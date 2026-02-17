import * as Y from 'yjs'
import { getSupabaseClient } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Awareness user state
export interface AwarenessUser {
  name: string
  color: string
  cursor?: { anchor: number; head: number }
}

// Provider options
export interface YjsSupabaseProviderOptions {
  documentId: string // Unique identifier for the document (e.g., student ID)
  userId: string
  userName: string
  userColor?: string
  onSynced?: () => void
  onAwarenessUpdate?: (users: Map<number, AwarenessUser>) => void
}

// Generate a random color for user cursor
function generateUserColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Encode Uint8Array to base64 (chunked to avoid call stack overflow)
function encodeUpdate(update: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < update.length; i += chunkSize) {
    const chunk = update.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

// Decode base64 to Uint8Array
function decodeUpdate(encoded: string): Uint8Array {
  const binaryString = atob(encoded)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

export class YjsSupabaseProvider {
  private ydoc: Y.Doc
  private supabase: ReturnType<typeof getSupabaseClient>
  private channel: RealtimeChannel | null = null
  private documentId: string
  private userId: string
  private userName: string
  private userColor: string
  private clientId: number
  private awareness: Map<number, AwarenessUser> = new Map()
  private onSynced?: () => void
  private awarenessListeners: Set<(users: Map<number, AwarenessUser>) => void> = new Set()
  private synced = false
  private destroyed = false
  // Store bound handler so we can properly remove it
  private boundHandleDocumentUpdate: (update: Uint8Array, origin: unknown) => void

  constructor(ydoc: Y.Doc, options: YjsSupabaseProviderOptions) {
    this.ydoc = ydoc
    this.supabase = getSupabaseClient()
    this.documentId = options.documentId
    this.userId = options.userId
    this.userName = options.userName
    this.userColor = options.userColor || generateUserColor()
    this.clientId = Math.floor(Math.random() * 1000000)
    this.onSynced = options.onSynced
    if (options.onAwarenessUpdate) {
      this.awarenessListeners.add(options.onAwarenessUpdate)
    }
    this.boundHandleDocumentUpdate = this.handleDocumentUpdate.bind(this)

    this.connect()
  }

  private async connect() {
    const channelName = `lesson-notes:${this.documentId}`

    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: this.userId },
      },
    })

    // --- Register ALL handlers BEFORE subscribing ---

    // Handle incoming document updates
    this.channel.on('broadcast', { event: 'yjs-update' }, ({ payload }) => {
      if (payload.clientId !== this.clientId) {
        try {
          const update = decodeUpdate(payload.update)
          Y.applyUpdate(this.ydoc, update, 'remote')
        } catch (error) {
          console.error('[YjsProvider] Error applying update:', error)
        }
      }
    })

    // Handle awareness updates
    this.channel.on('broadcast', { event: 'awareness' }, ({ payload }) => {
      if (payload.clientId !== this.clientId) {
        this.awareness.set(payload.clientId, payload.user)
        this.notifyAwarenessListeners()
      }
    })

    // Handle sync requests from other clients
    this.channel.on('broadcast', { event: 'sync-request' }, ({ payload }) => {
      if (payload.clientId !== this.clientId && this.synced) {
        const state = Y.encodeStateAsUpdate(this.ydoc)
        this.channel?.send({
          type: 'broadcast',
          event: 'sync-response',
          payload: {
            clientId: this.clientId,
            targetClientId: payload.clientId,
            state: encodeUpdate(state),
          },
        })
      }
    })

    // Handle sync responses
    this.channel.on('broadcast', { event: 'sync-response' }, ({ payload }) => {
      if (payload.targetClientId === this.clientId) {
        try {
          const state = decodeUpdate(payload.state)
          Y.applyUpdate(this.ydoc, state, 'remote')
        } catch (error) {
          console.error('[YjsProvider] Error applying sync state:', error)
        }
      }
    })

    // Handle presence for user list
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel?.presenceState() || {}
      Object.values(state).forEach((presences: unknown) => {
        const presenceArray = presences as Array<{ clientId: number; user: AwarenessUser }>
        presenceArray.forEach((presence) => {
          if (presence.clientId !== this.clientId) {
            this.awareness.set(presence.clientId, presence.user)
          }
        })
      })
      this.notifyAwarenessListeners()
    })

    this.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach((presence) => {
        const p = presence as unknown as { clientId: number }
        if (p.clientId) {
          this.awareness.delete(p.clientId)
        }
      })
      this.notifyAwarenessListeners()
    })

    // Listen for local document changes
    this.ydoc.on('update', this.boundHandleDocumentUpdate)

    // --- NOW subscribe (all handlers already registered) ---
    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track presence
        await this.channel?.track({
          clientId: this.clientId,
          user: {
            name: this.userName,
            color: this.userColor,
          },
        })

        // Load initial state from database
        await this.loadInitialState()

        // Request state from any already-connected clients (they may have newer state)
        this.channel?.send({
          type: 'broadcast',
          event: 'sync-request',
          payload: { clientId: this.clientId },
        })
      }
    })
  }

  private async loadInitialState() {
    try {
      const { data: note, error } = await this.supabase
        .from('lesson_current_notes')
        .select('yjs_document_state')
        .eq('student_id', this.documentId)
        .maybeSingle()

      if (error) {
        console.error('[YjsProvider] Error loading initial state:', error)
        this.synced = true
        this.onSynced?.()
        return
      }

      if (note?.yjs_document_state) {
        try {
          const state = decodeUpdate(note.yjs_document_state)
          Y.applyUpdate(this.ydoc, state, 'remote')
        } catch (error) {
          console.error('[YjsProvider] Error applying initial state:', error)
        }
      }

      this.synced = true
      this.onSynced?.()
    } catch (error) {
      console.error('[YjsProvider] Error in loadInitialState:', error)
      this.synced = true
      this.onSynced?.()
    }
  }

  private handleDocumentUpdate(update: Uint8Array, origin: unknown) {
    if (origin === 'remote' || this.destroyed) return

    // Broadcast update to other clients
    this.channel?.send({
      type: 'broadcast',
      event: 'yjs-update',
      payload: {
        clientId: this.clientId,
        update: encodeUpdate(update),
      },
    })

    // Debounced save to database
    this.debouncedSave()
  }

  private saveTimeout: NodeJS.Timeout | null = null

  private debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      this.saveToDatabase()
    }, 1000)
  }

  private async saveToDatabase() {
    if (this.destroyed) return

    try {
      const state = Y.encodeStateAsUpdate(this.ydoc)
      const encodedState = encodeUpdate(state)

      const xmlFragment = this.ydoc.getXmlFragment('prosemirror')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const convertXmlToHtml = (node: any): string => {
        if (node instanceof Y.XmlText) {
          return node.toString()
        }
        if (node instanceof Y.XmlElement) {
          const tag = node.nodeName
          const children = Array.from(node.toArray()).map((child: unknown) => convertXmlToHtml(child)).join('')
          return `<${tag}>${children}</${tag}>`
        }
        if (node instanceof Y.XmlFragment) {
          return Array.from(node.toArray()).map((child: unknown) => convertXmlToHtml(child)).join('')
        }
        return ''
      }

      const contentHtml = convertXmlToHtml(xmlFragment)

      const { error } = await this.supabase
        .from('lesson_current_notes')
        .upsert({
          student_id: this.documentId,
          yjs_document_state: encodedState,
          content: contentHtml,
          updated_at: new Date().toISOString(),
        })

      if (error) {
        console.error('[YjsProvider] Error saving to database:', error)
      }
    } catch (error) {
      console.error('[YjsProvider] Error in saveToDatabase:', error)
    }
  }

  // Update local awareness (cursor position, etc.)
  setAwareness(state: Partial<AwarenessUser>) {
    const currentState = this.awareness.get(this.clientId) || {
      name: this.userName,
      color: this.userColor,
    }

    const newState = { ...currentState, ...state }
    this.awareness.set(this.clientId, newState)

    this.channel?.send({
      type: 'broadcast',
      event: 'awareness',
      payload: {
        clientId: this.clientId,
        user: newState,
      },
    })
  }

  private notifyAwarenessListeners() {
    for (const listener of this.awarenessListeners) {
      listener(this.awareness)
    }
  }

  onAwarenessChange(handler: (users: Map<number, AwarenessUser>) => void) {
    this.awarenessListeners.add(handler)
  }

  offAwarenessChange(handler: (users: Map<number, AwarenessUser>) => void) {
    this.awarenessListeners.delete(handler)
  }

  getAwareness(): Map<number, AwarenessUser> {
    return this.awareness
  }

  getClientId(): number {
    return this.clientId
  }

  isSynced(): boolean {
    return this.synced
  }

  async forceSave(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    await this.saveToDatabase()
  }

  async destroy() {
    this.destroyed = true

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      await this.saveToDatabase()
    }

    // Remove the SAME bound reference that was registered
    this.ydoc.off('update', this.boundHandleDocumentUpdate)

    if (this.channel) {
      await this.supabase.removeChannel(this.channel)
      this.channel = null
    }

    this.awareness.clear()
    this.awarenessListeners.clear()
  }
}
