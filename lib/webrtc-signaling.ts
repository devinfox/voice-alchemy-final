/**
 * WebRTC Signaling using Supabase Realtime
 * Real-time signaling infrastructure for lesson rooms.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Types for signaling messages
export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'participant-joined' | 'participant-left' | 'mute-status' | 'video-status' | 'screen-share' | 'chat' | 'recording-status'
  from: string
  to?: string // If undefined, broadcast to all
  payload: any
  timestamp: number
}

export interface Participant {
  id: string
  name: string
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isHost: boolean
  joinedAt: number
}

export interface RoomState {
  participants: Map<string, Participant>
  isRecording: boolean
  recordingStartedAt?: number
  recordingStartedBy?: string
}

type SignalingCallback = (message: SignalingMessage) => void
type ParticipantCallback = (participants: Participant[]) => void

export class WebRTCSignaling {
  private supabase: ReturnType<typeof createSupabaseClient>
  private channel: RealtimeChannel | null = null
  private roomId: string
  private participantId: string
  private participantName: string
  private isHost: boolean
  private callbacks: Map<string, SignalingCallback[]> = new Map()
  private participantCallbacks: ParticipantCallback[] = []
  private roomState: RoomState = {
    participants: new Map(),
    isRecording: false,
  }

  constructor(
    roomId: string,
    participantId: string,
    participantName: string,
    isHost: boolean = false
  ) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    this.supabase = createSupabaseClient(supabaseUrl, supabaseKey)
    this.roomId = roomId
    this.participantId = participantId
    this.participantName = participantName
    this.isHost = isHost
  }

  /**
   * Connect to the signaling channel
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.channel = this.supabase.channel(`lesson:${this.roomId}`, {
        config: {
          presence: { key: this.participantId },
          broadcast: { self: false },
        },
      })

      // Handle presence (participant tracking)
      this.channel.on('presence', { event: 'sync' }, () => {
        const presenceState = this.channel?.presenceState() || {}
        this.updateParticipantsFromPresence(presenceState)
      })

      this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Signaling] Participant joined:', key, newPresences)
      })

      this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[Signaling] Participant left:', key, leftPresences)
        this.roomState.participants.delete(key)
        this.notifyParticipantChange()
      })

      // Handle broadcast messages (signaling)
      this.channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        const message = payload as SignalingMessage

        // Only process messages meant for us or broadcast
        if (message.to && message.to !== this.participantId) {
          return
        }

        this.handleSignalingMessage(message)
      })

      // Subscribe to the channel
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track our presence
          await this.channel?.track({
            id: this.participantId,
            name: this.participantName,
            isHost: this.isHost,
            isMuted: false,
            isVideoOff: false,
            isScreenSharing: false,
            joinedAt: Date.now(),
          })

          // Announce ourselves
          this.broadcast({
            type: 'participant-joined',
            from: this.participantId,
            payload: {
              id: this.participantId,
              name: this.participantName,
              isHost: this.isHost,
            },
            timestamp: Date.now(),
          })

          resolve()
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Failed to connect to signaling channel'))
        }
      })
    })
  }

  /**
   * Disconnect from the signaling channel
   */
  async disconnect(): Promise<void> {
    if (this.channel) {
      // Announce departure
      this.broadcast({
        type: 'participant-left',
        from: this.participantId,
        payload: { id: this.participantId },
        timestamp: Date.now(),
      })

      await this.channel.untrack()
      await this.channel.unsubscribe()
      this.channel = null
    }
  }

  /**
   * Send a signaling message (offer, answer, ICE candidate)
   */
  sendSignal(to: string, type: SignalingMessage['type'], payload: any): void {
    this.broadcast({
      type,
      from: this.participantId,
      to,
      payload,
      timestamp: Date.now(),
    })
  }

  /**
   * Broadcast a message to all participants
   */
  broadcast(message: SignalingMessage): void {
    if (!this.channel) {
      console.error('[Signaling] Not connected')
      return
    }

    this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: message,
    })
  }

  /**
   * Update media status
   */
  updateMediaStatus(isMuted: boolean, isVideoOff: boolean, isScreenSharing: boolean): void {
    this.channel?.track({
      id: this.participantId,
      name: this.participantName,
      isHost: this.isHost,
      isMuted,
      isVideoOff,
      isScreenSharing,
      joinedAt: this.roomState.participants.get(this.participantId)?.joinedAt || Date.now(),
    })

    this.broadcast({
      type: 'mute-status',
      from: this.participantId,
      payload: { isMuted, isVideoOff, isScreenSharing },
      timestamp: Date.now(),
    })
  }

  /**
   * Send chat message
   */
  sendChatMessage(message: string): void {
    this.broadcast({
      type: 'chat',
      from: this.participantId,
      payload: {
        message,
        senderName: this.participantName,
      },
      timestamp: Date.now(),
    })
  }

  /**
   * Update recording status
   */
  updateRecordingStatus(isRecording: boolean): void {
    this.roomState.isRecording = isRecording
    if (isRecording) {
      this.roomState.recordingStartedAt = Date.now()
      this.roomState.recordingStartedBy = this.participantId
    }

    this.broadcast({
      type: 'recording-status',
      from: this.participantId,
      payload: {
        isRecording,
        startedAt: this.roomState.recordingStartedAt,
        startedBy: this.roomState.recordingStartedBy,
      },
      timestamp: Date.now(),
    })
  }

  /**
   * Subscribe to signaling messages
   */
  on(event: SignalingMessage['type'], callback: SignalingCallback): void {
    const callbacks = this.callbacks.get(event) || []
    callbacks.push(callback)
    this.callbacks.set(event, callbacks)
  }

  /**
   * Unsubscribe from signaling messages
   */
  off(event: SignalingMessage['type'], callback: SignalingCallback): void {
    const callbacks = this.callbacks.get(event) || []
    const index = callbacks.indexOf(callback)
    if (index !== -1) {
      callbacks.splice(index, 1)
    }
  }

  /**
   * Subscribe to participant changes
   */
  onParticipantChange(callback: ParticipantCallback): void {
    this.participantCallbacks.push(callback)
  }

  /**
   * Get current participants
   */
  getParticipants(): Participant[] {
    return Array.from(this.roomState.participants.values())
  }

  /**
   * Get room state
   */
  getRoomState(): RoomState {
    return this.roomState
  }

  // Private methods

  private handleSignalingMessage(message: SignalingMessage): void {
    // Update local state based on message type
    if (message.type === 'mute-status') {
      const participant = this.roomState.participants.get(message.from)
      if (participant) {
        participant.isMuted = message.payload.isMuted
        participant.isVideoOff = message.payload.isVideoOff
        participant.isScreenSharing = message.payload.isScreenSharing
        this.notifyParticipantChange()
      }
    } else if (message.type === 'recording-status') {
      this.roomState.isRecording = message.payload.isRecording
      this.roomState.recordingStartedAt = message.payload.startedAt
      this.roomState.recordingStartedBy = message.payload.startedBy
    }

    // Notify callbacks
    const callbacks = this.callbacks.get(message.type) || []
    callbacks.forEach((callback) => callback(message))
  }

  private updateParticipantsFromPresence(presenceState: Record<string, any[]>): void {
    this.roomState.participants.clear()

    Object.entries(presenceState).forEach(([_key, presences]) => {
      presences.forEach((presence: any) => {
        this.roomState.participants.set(presence.id, {
          id: presence.id,
          name: presence.name,
          isMuted: presence.isMuted || false,
          isVideoOff: presence.isVideoOff || false,
          isScreenSharing: presence.isScreenSharing || false,
          isHost: presence.isHost || false,
          joinedAt: presence.joinedAt || Date.now(),
        })
      })
    })

    this.notifyParticipantChange()
  }

  private notifyParticipantChange(): void {
    const participants = this.getParticipants()
    this.participantCallbacks.forEach((callback) => callback(participants))
  }
}

/**
 * Create a unique room identifier
 */
export function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 3; i++) {
    if (i > 0) result += '-'
    for (let j = 0; j < 3; j++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
  }
  return result
}
