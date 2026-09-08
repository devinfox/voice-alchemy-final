/**
 * Recital signaling over Supabase Realtime (presence + broadcast).
 *
 * Deliberately separate from lib/webrtc-signaling.ts (the 1:1 lesson path)
 * so recital changes can never break lessons. Channel: `recital:<recitalId>`.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { RecitalEnvelope, RecitalMessage, RecitalPresence } from './protocol'

type MessageHandler = (envelope: RecitalEnvelope) => void
type PresenceHandler = (participants: RecitalPresence[]) => void

export class RecitalSignaling {
  private supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  private channel: RealtimeChannel | null = null
  private handlers = new Set<MessageHandler>()
  private presenceHandlers = new Set<PresenceHandler>()
  private participants = new Map<string, RecitalPresence>()
  private presence: RecitalPresence
  private readonly channelName: string

  constructor(recitalId: string, presence: RecitalPresence) {
    this.channelName = `recital:${recitalId}`
    this.presence = presence
  }

  get id(): string {
    return this.presence.id
  }

  async connect(): Promise<void> {
    if (this.channel) return
    return new Promise((resolve, reject) => {
      const channel = this.supabase.channel(this.channelName, {
        config: { presence: { key: this.presence.id }, broadcast: { self: false, ack: false } },
      })
      this.channel = channel

      channel.on('presence', { event: 'sync' }, () => {
        this.readPresence()
      })
      channel.on('presence', { event: 'join' }, () => {
        this.readPresence()
      })
      channel.on('presence', { event: 'leave' }, ({ key }) => {
        this.participants.delete(key)
        this.emitPresence()
      })
      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        const env = payload as RecitalEnvelope
        if (!env || env.from === this.presence.id) return
        if (env.to && env.to !== this.presence.id) return
        this.handlers.forEach((h) => h(env))
      })

      let settled = false
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.untrack()
          } catch {
            // no prior presence
          }
          await channel.track(this.presence)
          if (!settled) {
            settled = true
            resolve()
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!settled) {
            settled = true
            reject(new Error('Could not connect to the recital room'))
          }
        }
      })
    })
  }

  async updatePresence(patch: Partial<RecitalPresence>): Promise<void> {
    this.presence = { ...this.presence, ...patch }
    if (!this.channel) return
    try {
      await this.channel.track(this.presence)
    } catch {
      // transient; next update will retry
    }
  }

  getPresence(): RecitalPresence {
    return this.presence
  }

  send(to: string | undefined, msg: RecitalMessage): void {
    if (!this.channel) return
    const envelope: RecitalEnvelope = { from: this.presence.id, to, msg, ts: Date.now() }
    void this.channel.send({ type: 'broadcast', event: 'signal', payload: envelope })
  }

  broadcast(msg: RecitalMessage): void {
    this.send(undefined, msg)
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onParticipants(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler)
    handler(this.getParticipants())
    return () => this.presenceHandlers.delete(handler)
  }

  getParticipants(): RecitalPresence[] {
    return Array.from(this.participants.values())
  }

  async disconnect(): Promise<void> {
    const channel = this.channel
    this.channel = null
    if (!channel) return
    try {
      await channel.untrack()
      await channel.unsubscribe()
    } catch {
      // ignore
    }
    this.participants.clear()
  }

  private readPresence(): void {
    const state = (this.channel?.presenceState() || {}) as Record<string, RecitalPresence[]>
    this.participants.clear()
    for (const entries of Object.values(state)) {
      // Keep the newest entry per participant (stale tabs linger briefly).
      let latest: RecitalPresence | null = null
      for (const p of entries) {
        if (!p?.id) continue
        if (!latest || (p.joinedAt || 0) > (latest.joinedAt || 0)) latest = p
      }
      if (latest) this.participants.set(latest.id, latest)
    }
    this.emitPresence()
  }

  private emitPresence(): void {
    const list = this.getParticipants()
    this.presenceHandlers.forEach((h) => h(list))
  }
}
