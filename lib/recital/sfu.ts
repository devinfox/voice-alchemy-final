/**
 * RecitalSfu: group classes and recitals on the LiveKit media server.
 *
 * Same public shape as RecitalMesh (see ./transport.ts), so the room hooks
 * and the UI do not care which one they hold. The media side is the CRM's
 * daily-meeting engine (lib/group-call/meeting-session.ts): everyone uploads
 * one copy of their camera and mic and the server forwards it, so a room no
 * longer gets heavier for every person with each person who joins.
 *
 * What stays on Supabase Realtime (./signaling.ts), exactly as with the mesh:
 * who is here, the waiting room, chat, reactions, host commands and the
 * recital's live state. Only sound and picture moved.
 */
import { JoinRefusedError, MeetingSession, type LinkQuality, type MeetingLogger } from '@/lib/group-call/meeting-session'
import { RecitalSignaling } from './signaling'
import { AUDIO_KBPS, type NetQuality, type RecitalMessage, type RecitalPresence } from './protocol'
import type { MeshOptions, PeerConnectionStatus, PeerStats, VideoMode } from './mesh'
import type { RecitalTransport } from './transport'

const STATS_INTERVAL_MS = 3000
/** After a host admits someone, their row can lag the admit message by a moment. */
const LOBBY_RETRY_MS = 1500
const REJOIN_DELAYS_MS = [1000, 2000, 4000, 8000, 15000]

const logger: MeetingLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (event, data) => console.warn('[GroupCall]', event, data ?? ''),
  error: (event, data) => console.warn('[GroupCall]', event, data ?? ''),
}

function toNet(quality: LinkQuality | undefined): NetQuality {
  if (!quality) return 'unknown'
  if (quality === 'lost') return 'bad'
  if (quality === 'poor') return 'warning'
  return 'good'
}

export interface SfuOptions extends Omit<MeshOptions, 'ice'> {
  /** The class/recital session token from the join route. */
  sessionToken: string
}

export class RecitalSfu implements RecitalTransport {
  private signaling: RecitalSignaling
  private session: MeetingSession | null = null
  private joining: Promise<void> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private statsTimer: ReturnType<typeof setInterval> | null = null
  private rejoinAttempt = 0
  private closed = false
  private reconnecting = false

  private audioTrack: MediaStreamTrack | null = null
  private videoTrack: MediaStreamTrack | null = null
  private screenTrack: MediaStreamTrack | null = null
  private screenAudioTrack: MediaStreamTrack | null = null
  private videoMode: VideoMode = 'thumbnail'

  /** People whose media connection is up. */
  private peerIds = new Set<string>()
  private streams = new Map<string, MediaStream>()
  private screens = new Map<string, MediaStream>()
  private streamListeners = new Map<string, () => void>()
  private quality = new Map<string, LinkQuality>()
  private localQuality: LinkQuality | undefined
  private unsubscribers: Array<() => void> = []

  private readonly id: string
  private readonly events: MeshOptions['events']
  private readonly sessionToken: string

  constructor(options: SfuOptions) {
    this.id = options.presence.id
    this.events = options.events
    this.sessionToken = options.sessionToken
    this.signaling = new RecitalSignaling(options.recitalId, options.presence)
  }

  get participantId(): string {
    return this.id
  }

  // ---------------------------------------------------------------- lifecycle

  async connect(): Promise<void> {
    this.unsubscribers.push(
      this.signaling.onMessage((env) => {
        // Mesh negotiation chatter (from a tab still on the old build) means nothing here.
        const t = env.msg.type
        if (t === 'hello' || t === 'bye' || t === 'offer' || t === 'answer' || t === 'ice-candidate') return
        this.events.onMessage(env)
      })
    )
    this.unsubscribers.push(
      this.signaling.onParticipants((list) => {
        this.events.onParticipants(list)
        this.applyQualities()
      })
    )
    await this.signaling.connect()
    this.statsTimer = setInterval(() => this.tick(), STATS_INTERVAL_MS)
    if (!this.signaling.getPresence().waiting) await this.joinMedia(true)
  }

  async disconnect(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.statsTimer) clearInterval(this.statsTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.unsubscribers.forEach((u) => u())
    this.streamListeners.forEach((off) => off())
    this.streamListeners.clear()
    const session = this.session
    this.session = null
    await session?.disconnect()
    await this.signaling.disconnect()
  }

  /**
   * With the mesh this opened and closed peer connections. Here there is one
   * connection, to the server; this joins it once we are out of the waiting
   * room. Safe to call any time.
   */
  reconcilePeers(): void {
    if (this.closed) return
    if (this.signaling.getPresence().waiting) return
    if (!this.session && !this.joining && !this.retryTimer) void this.joinMedia(false)
    this.applyQualities()
  }

  private async joinMedia(throwOnFailure: boolean): Promise<void> {
    if (this.closed || this.session) return
    if (this.joining) return this.joining
    this.joining = (async () => {
      const session = await MeetingSession.connect(
        { sessionToken: this.sessionToken, audioKbps: AUDIO_KBPS, logger },
        {
          onParticipants: (list) => this.onMediaParticipants(list.map((p) => p.id)),
          onPending: () => undefined,
          onRemoteStream: (id, stream) => this.onStream(id, stream),
          onRemoteStreamRemoved: (id) => this.onStreamRemoved(id),
          onRemoteScreen: (id, stream) => {
            if (stream) this.screens.set(id, stream)
            else this.screens.delete(id)
            this.events.onRemoteScreen?.(id, stream)
          },
          onRemoteQuality: (id, q) => this.quality.set(id, q),
          onQuality: (q) => {
            this.localQuality = q
          },
          onAdmitted: () => undefined,
          onChat: () => undefined,
          onPresentation: () => undefined,
          onCommand: () => undefined,
          onLocalMuted: () => undefined,
          onConnection: (state) => {
            this.reconnecting = state === 'reconnecting'
            const status: PeerConnectionStatus = this.reconnecting ? 'connecting' : 'connected'
            this.peerIds.forEach((id) => this.events.onPeerStatus(id, status))
          },
          onDisconnected: (cause) => this.onMediaLost(cause),
        }
      )
      if (this.closed) {
        await session.disconnect()
        return
      }
      this.session = session
      this.rejoinAttempt = 0
      await this.publishAll()
      this.applyQualities()
    })()
    try {
      await this.joining
    } catch (err) {
      this.joining = null
      // Still in the waiting room as far as the server knows: ask again shortly.
      const lobby = err instanceof JoinRefusedError && err.status === 403
      if (throwOnFailure && !lobby) throw err
      this.scheduleRejoin(lobby ? LOBBY_RETRY_MS : undefined)
      return
    }
    this.joining = null
  }

  private scheduleRejoin(delayMs?: number): void {
    if (this.closed || this.retryTimer) return
    const delay = delayMs ?? REJOIN_DELAYS_MS[Math.min(this.rejoinAttempt, REJOIN_DELAYS_MS.length - 1)]
    this.rejoinAttempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.closed || this.signaling.getPresence().waiting) return
      void this.joinMedia(false)
    }, delay)
  }

  /** The media connection ended and LiveKit's own reconnect gave up (or the server closed it). */
  private onMediaLost(cause: string): void {
    this.session = null
    this.reconnecting = false
    for (const id of Array.from(this.peerIds)) this.events.onPeerStatus(id, 'closed')
    this.peerIds.clear()
    for (const id of Array.from(this.streams.keys())) this.onStreamRemoved(id)
    for (const id of Array.from(this.screens.keys())) this.events.onRemoteScreen?.(id, null)
    this.screens.clear()
    this.quality.clear()
    // Removed by the host, or the same person joined from another tab: stay out.
    if (this.closed || cause === 'left' || cause === 'removed' || cause === 'denied' || cause === 'duplicate') return
    this.scheduleRejoin()
  }

  // ------------------------------------------------------------------ remotes

  private onMediaParticipants(ids: string[]): void {
    const now = new Set(ids.filter((id) => id !== this.id))
    for (const id of now) {
      if (!this.peerIds.has(id)) {
        this.peerIds.add(id)
        this.events.onPeerStatus(id, this.reconnecting ? 'connecting' : 'connected')
      }
    }
    for (const id of Array.from(this.peerIds)) {
      if (!now.has(id)) {
        this.peerIds.delete(id)
        this.quality.delete(id)
        this.events.onPeerStatus(id, 'closed')
      }
    }
    this.applyQualities()
  }

  private onStream(id: string, stream: MediaStream): void {
    this.streams.set(id, stream)
    this.streamListeners.get(id)?.()
    // A camera that arrives after the microphone lands on the same stream:
    // tell the UI again so the tile swaps the avatar for the picture.
    const again = () => {
      if (this.streams.get(id) !== stream) return
      this.events.onRemoteStream(id, stream)
      this.applyQualities()
    }
    stream.addEventListener('addtrack', again)
    stream.addEventListener('removetrack', again)
    this.streamListeners.set(id, () => {
      stream.removeEventListener('addtrack', again)
      stream.removeEventListener('removetrack', again)
    })
    this.events.onRemoteStream(id, stream)
    this.applyQualities()
  }

  private onStreamRemoved(id: string): void {
    this.streamListeners.get(id)?.()
    this.streamListeners.delete(id)
    if (!this.streams.delete(id)) return
    this.events.onRemoteStreamRemoved(id)
  }

  /**
   * Ask the server for the picture size each person is worth: full quality
   * for whoever is on stage (they say so in their presence), a small copy for
   * the rest, smaller still once the room is big.
   */
  private applyQualities(): void {
    const session = this.session
    if (!session) return
    const others = this.signaling.getParticipants().filter((p) => p.id !== this.id)
    const small = others.length > 4 ? 'low' : 'medium'
    for (const p of others) {
      if (!this.peerIds.has(p.id)) continue
      session.setVideoQuality(p.id, p.videoMode === 'spotlight' ? 'high' : small)
    }
  }

  // ------------------------------------------------------------- local media

  private async publishAll(): Promise<void> {
    await this.applyMic()
    await this.applyCamera()
    if (this.screenTrack) await this.session?.startScreenShare(this.screenTrack, this.screenAudioTrack ?? undefined)
  }

  private async applyMic(): Promise<void> {
    const session = this.session
    if (!session) return
    try {
      if (this.audioTrack) await session.replaceMic(this.audioTrack, !this.audioTrack.enabled)
      else await session.unpublishMic()
    } catch (err) {
      console.warn('[GroupCall] microphone publish failed', err)
    }
  }

  private async applyCamera(): Promise<void> {
    const session = this.session
    if (!session) return
    try {
      if (this.videoTrack && this.videoMode !== 'off') await session.replaceCamera(this.videoTrack, !this.videoTrack.enabled)
      else await session.unpublishCamera()
    } catch (err) {
      console.warn('[GroupCall] camera publish failed', err)
    }
  }

  async setAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    this.audioTrack = track
    await this.applyMic()
  }

  async setVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    this.videoTrack = track
    await this.applyCamera()
  }

  async setScreenTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null = null): Promise<void> {
    this.screenTrack = video
    this.screenAudioTrack = audio
    const session = this.session
    if (session) {
      try {
        await session.stopScreenShare()
        if (video) await session.startScreenShare(video, audio ?? undefined)
      } catch (err) {
        console.warn('[GroupCall] screen share failed', err)
      }
    }
    this.updatePresence({ sharingScreen: !!video })
  }

  isSharingScreen(): boolean {
    return !!this.screenTrack
  }

  /** Spotlight (on stage), thumbnail (in the audience) or off (camera not sent). */
  async setVideoMode(mode: VideoMode): Promise<void> {
    if (mode === this.videoMode && this.signaling.getPresence().videoMode === mode) return
    this.videoMode = mode
    // Viewers read this to decide which copy of our picture to ask the server for.
    this.updatePresence({ videoMode: mode })
    await this.applyCamera()
  }

  getVideoMode(): VideoMode {
    return this.videoMode
  }

  /** The mesh split an upload budget across viewers. One upload here: nothing to split. */
  setSpotlightBudget(): void {}

  /**
   * The room mutes by switching the track off; the server has to hear about
   * it too, or it keeps treating a live mic as muted and forwards nothing.
   */
  private syncMutes(): void {
    const session = this.session
    if (!session) return
    if (this.audioTrack) void session.setMicMuted(!this.audioTrack.enabled).catch(() => undefined)
    if (this.videoTrack && this.videoMode !== 'off') void session.setCameraOff(!this.videoTrack.enabled).catch(() => undefined)
  }

  // -------------------------------------------------------------- messaging

  updatePresence(patch: Partial<RecitalPresence>): void {
    void this.signaling.updatePresence(patch)
    if ('isMuted' in patch || 'isVideoOff' in patch) this.syncMutes()
  }

  getPresence(): RecitalPresence {
    return this.signaling.getPresence()
  }

  getParticipants(): RecitalPresence[] {
    return this.signaling.getParticipants()
  }

  broadcast(msg: RecitalMessage): void {
    this.signaling.broadcast(msg)
  }

  sendTo(peerId: string, msg: RecitalMessage): void {
    this.signaling.send(peerId, msg)
  }

  getPeerStatus(peerId: string): PeerConnectionStatus {
    if (!this.session || !this.peerIds.has(peerId)) return 'new'
    return this.reconnecting ? 'connecting' : 'connected'
  }

  getRemoteStream(peerId: string): MediaStream | null {
    return this.streams.get(peerId) ?? null
  }

  getRemoteScreen(peerId: string): MediaStream | null {
    return this.screens.get(peerId) ?? null
  }

  // ------------------------------------------------------------------ stats

  private tick(): void {
    if (this.closed) return
    this.syncMutes()
    const peers = new Map<string, PeerStats>()
    for (const id of this.peerIds) {
      peers.set(id, {
        rttMs: null,
        audioLossPct: 0,
        concealedPct: 0,
        jitterMs: null,
        inboundVideoKbps: 0,
        quality: toNet(this.quality.get(id)),
      })
    }
    const overall: NetQuality = !this.session ? 'unknown' : this.reconnecting ? 'bad' : toNet(this.localQuality ?? 'good')
    this.events.onStats({ overall, peers })
  }
}
