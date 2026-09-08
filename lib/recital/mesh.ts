/**
 * RecitalMesh — full-mesh WebRTC engine tuned for a recital.
 *
 * Every participant holds one RTCPeerConnection per other participant
 * (perfect-negotiation pattern). What makes 10-20 people workable on home
 * connections is *what* each connection carries, not the topology:
 *
 *   • audio is sacred: music-grade Opus, no silence suppression, FEC on,
 *     high network priority, generous per-peer bitrate;
 *   • only the person on stage (or the host, between pieces) sends real
 *     video, budgeted across peers so their uplink never saturates;
 *   • everyone else sends a small thumbnail (or nothing), so audience uplink
 *     stays around a megabit even with twenty people;
 *   • tracks are swapped with replaceTrack(), so changing who is on stage or
 *     switching audio profiles never renegotiates.
 */
import { RecitalSignaling } from './signaling'
import {
  AUDIO_KBPS,
  SPOTLIGHT_MAX_KBPS,
  SPOTLIGHT_MIN_KBPS,
  THUMBNAIL_KBPS,
  type NetQuality,
  type RecitalEnvelope,
  type RecitalMessage,
  type RecitalPresence,
} from './protocol'

export type VideoMode = 'spotlight' | 'thumbnail' | 'off'
export type PeerConnectionStatus = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

export interface PeerStats {
  rttMs: number | null
  audioLossPct: number
  concealedPct: number
  jitterMs: number | null
  inboundVideoKbps: number
  quality: NetQuality
}

export interface MeshEvents {
  onRemoteStream(peerId: string, stream: MediaStream): void
  onRemoteStreamRemoved(peerId: string): void
  /** A peer started/updated a screen share (stream has the screen video + optional audio). */
  onRemoteScreen?(peerId: string, stream: MediaStream | null): void
  onPeerStatus(peerId: string, status: PeerConnectionStatus): void
  onMessage(envelope: RecitalEnvelope): void
  onParticipants(participants: RecitalPresence[]): void
  onStats(stats: { overall: NetQuality; peers: Map<string, PeerStats> }): void
}

interface Peer {
  id: string
  pc: RTCPeerConnection
  audioSender: RTCRtpSender
  videoSender: RTCRtpSender
  screenSender: RTCRtpSender
  screenAudioSender: RTCRtpSender
  stream: MediaStream
  screenStream: MediaStream
  makingOffer: boolean
  ignoreOffer: boolean
  pendingCandidates: RTCIceCandidateInit[]
  createdAt: number
  lastOfferAt: number
  lastStats: {
    at: number
    packetsLost: number
    packetsReceived: number
    concealed: number
    total: number
    videoBytes: number
  } | null
  stats: PeerStats
}

interface MeshOptions {
  recitalId: string
  presence: RecitalPresence
  ice: RTCConfiguration
  events: MeshEvents
  /** Total uplink budget (kbps) for the spotlight video fan-out. */
  spotlightBudgetKbps: number
  /**
   * Waiting-room support: while this returns false for a remote presence, no
   * peer connection is made with them (and none are made while we ourselves
   * are waiting). Defaults to "always connect".
   */
  shouldConnect?: (presence: RecitalPresence) => boolean
}

const STATS_INTERVAL_MS = 3000
const WATCHDOG_INTERVAL_MS = 5000
const CONNECT_TIMEOUT_MS = 12000

export class RecitalMesh {
  private signaling: RecitalSignaling
  private peers = new Map<string, Peer>()
  private localStream = new MediaStream()
  private localScreenStream = new MediaStream()
  private audioTrack: MediaStreamTrack | null = null
  private videoTrack: MediaStreamTrack | null = null
  private screenTrack: MediaStreamTrack | null = null
  private screenAudioTrack: MediaStreamTrack | null = null
  private shouldConnect: (presence: RecitalPresence) => boolean
  private videoMode: VideoMode = 'thumbnail'
  private statsTimer: ReturnType<typeof setInterval> | null = null
  private watchdogTimer: ReturnType<typeof setInterval> | null = null
  private closed = false
  private readonly id: string
  private readonly ice: RTCConfiguration
  private readonly events: MeshEvents
  private spotlightBudgetKbps: number
  private unsubscribers: Array<() => void> = []

  constructor(options: MeshOptions) {
    this.id = options.presence.id
    this.ice = options.ice
    this.events = options.events
    this.spotlightBudgetKbps = options.spotlightBudgetKbps
    this.shouldConnect = options.shouldConnect ?? (() => true)
    this.signaling = new RecitalSignaling(options.recitalId, options.presence)
  }

  get participantId(): string {
    return this.id
  }

  // ---------------------------------------------------------------- lifecycle

  async connect(): Promise<void> {
    this.unsubscribers.push(this.signaling.onMessage((env) => this.handleEnvelope(env)))
    this.unsubscribers.push(
      this.signaling.onParticipants((list) => {
        this.events.onParticipants(list)
        this.reconcilePeers(list)
      })
    )
    await this.signaling.connect()
    this.signaling.broadcast({ type: 'hello' })
    this.statsTimer = setInterval(() => void this.collectStats(), STATS_INTERVAL_MS)
    this.watchdogTimer = setInterval(() => this.watchdog(), WATCHDOG_INTERVAL_MS)
  }

  async disconnect(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.statsTimer) clearInterval(this.statsTimer)
    if (this.watchdogTimer) clearInterval(this.watchdogTimer)
    try {
      this.signaling.broadcast({ type: 'bye' })
    } catch {
      // ignore
    }
    for (const id of Array.from(this.peers.keys())) this.closePeer(id)
    this.unsubscribers.forEach((u) => u())
    await this.signaling.disconnect()
  }

  /** Connect to every eligible presence, drop the rest. Safe to call any time. */
  reconcilePeers(list: RecitalPresence[] = this.signaling.getParticipants()): void {
    if (this.closed) return
    const weWait = !!this.signaling.getPresence().waiting
    for (const p of list) {
      if (p.id === this.id) continue
      const eligible = !weWait && this.shouldConnect(p)
      if (eligible && !this.peers.has(p.id)) this.ensurePeer(p.id)
      if (!eligible && this.peers.has(p.id)) this.closePeer(p.id)
    }
    for (const id of Array.from(this.peers.keys())) {
      if (!list.some((p) => p.id === id)) this.closePeer(id)
    }
  }

  // ------------------------------------------------------------- local media

  /** Swap the outgoing audio track on every peer (no renegotiation). */
  async setAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    this.audioTrack = track
    this.syncLocalStream()
    await Promise.all(
      Array.from(this.peers.values()).map((peer) =>
        peer.audioSender.replaceTrack(track).catch((err) => console.warn('[Mesh] audio replaceTrack', err))
      )
    )
  }

  async setVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    this.videoTrack = track
    this.syncLocalStream()
    const outgoing = this.videoMode === 'off' ? null : track
    await Promise.all(
      Array.from(this.peers.values()).map((peer) =>
        peer.videoSender.replaceTrack(outgoing).catch((err) => console.warn('[Mesh] video replaceTrack', err))
      )
    )
    await this.applyVideoEncodings()
  }

  /**
   * Start/stop sharing a screen. Uses dedicated transceivers so the camera
   * keeps flowing alongside the share; no renegotiation.
   */
  async setScreenTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null = null): Promise<void> {
    this.screenTrack = video
    this.screenAudioTrack = audio
    for (const t of this.localScreenStream.getTracks()) this.localScreenStream.removeTrack(t)
    if (video) this.localScreenStream.addTrack(video)
    if (audio) this.localScreenStream.addTrack(audio)
    await Promise.all(
      Array.from(this.peers.values()).map(async (peer) => {
        await peer.screenSender.replaceTrack(video).catch((err) => console.warn('[Mesh] screen replaceTrack', err))
        await peer.screenAudioSender.replaceTrack(audio).catch((err) => console.warn('[Mesh] screen audio replaceTrack', err))
      })
    )
    await this.applyScreenEncodings()
    this.updatePresence({ sharingScreen: !!video })
  }

  isSharingScreen(): boolean {
    return !!this.screenTrack
  }

  /** Spotlight (on stage), thumbnail (in the audience) or off. */
  async setVideoMode(mode: VideoMode): Promise<void> {
    if (mode === this.videoMode) return
    this.videoMode = mode
    const outgoing = mode === 'off' ? null : this.videoTrack
    await Promise.all(
      Array.from(this.peers.values()).map((peer) =>
        peer.videoSender.replaceTrack(outgoing).catch((err) => console.warn('[Mesh] video mode replaceTrack', err))
      )
    )
    await this.applyVideoEncodings()
  }

  getVideoMode(): VideoMode {
    return this.videoMode
  }

  setSpotlightBudget(kbps: number): void {
    this.spotlightBudgetKbps = kbps
    void this.applyVideoEncodings()
  }

  // -------------------------------------------------------------- messaging

  updatePresence(patch: Partial<RecitalPresence>): void {
    void this.signaling.updatePresence(patch)
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
    const peer = this.peers.get(peerId)
    if (!peer) return 'new'
    return peer.pc.connectionState as PeerConnectionStatus
  }

  getRemoteStream(peerId: string): MediaStream | null {
    return this.peers.get(peerId)?.stream ?? null
  }

  getRemoteScreen(peerId: string): MediaStream | null {
    return this.peers.get(peerId)?.screenStream ?? null
  }

  // ------------------------------------------------------------------ peers

  private isPolite(remoteId: string): boolean {
    return this.id.localeCompare(remoteId) < 0
  }

  private syncLocalStream(): void {
    for (const t of this.localStream.getTracks()) this.localStream.removeTrack(t)
    if (this.audioTrack) this.localStream.addTrack(this.audioTrack)
    if (this.videoTrack) this.localStream.addTrack(this.videoTrack)
  }

  private ensurePeer(remoteId: string): Peer {
    const existing = this.peers.get(remoteId)
    if (existing) return existing
    if (this.closed) throw new Error('mesh closed')

    const pc = new RTCPeerConnection(this.ice)
    const stream = new MediaStream()
    const screenStream = new MediaStream()

    // Fixed transceiver order (audio, video, screen video, screen audio) so
    // both sides agree on m-lines and later track swaps never renegotiate.
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv', streams: [this.localStream] })
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv', streams: [this.localStream] })
    const screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv', streams: [this.localScreenStream] })
    const screenAudioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv', streams: [this.localScreenStream] })

    const peer: Peer = {
      id: remoteId,
      pc,
      audioSender: audioTransceiver.sender,
      videoSender: videoTransceiver.sender,
      screenSender: screenTransceiver.sender,
      screenAudioSender: screenAudioTransceiver.sender,
      stream,
      screenStream,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      createdAt: Date.now(),
      lastOfferAt: 0,
      lastStats: null,
      stats: { rttMs: null, audioLossPct: 0, concealedPct: 0, jitterMs: null, inboundVideoKbps: 0, quality: 'unknown' },
    }
    this.peers.set(remoteId, peer)

    if (this.audioTrack) void audioTransceiver.sender.replaceTrack(this.audioTrack)
    if (this.videoTrack && this.videoMode !== 'off') void videoTransceiver.sender.replaceTrack(this.videoTrack)
    if (this.screenTrack) void screenTransceiver.sender.replaceTrack(this.screenTrack)
    if (this.screenAudioTrack) void screenAudioTransceiver.sender.replaceTrack(this.screenAudioTrack)

    pc.ontrack = (event) => {
      const track = event.track
      const mid = event.transceiver?.mid
      const isScreen = mid === screenTransceiver.mid || mid === screenAudioTransceiver.mid
      const target = isScreen ? screenStream : stream
      if (!target.getTracks().some((t) => t.id === track.id)) target.addTrack(track)
      const emit = () => {
        if (isScreen) {
          const live = screenStream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted)
          this.events.onRemoteScreen?.(remoteId, live ? screenStream : null)
        } else {
          this.events.onRemoteStream(remoteId, stream)
        }
      }
      // Re-emit on mute/unmute so tiles can switch between video and avatar
      // when a peer stops/starts sending (replaceTrack(null) mutes remotely).
      track.onunmute = emit
      track.onmute = emit
      emit()
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.send(remoteId, { type: 'ice-candidate', candidate: event.candidate.toJSON() })
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as PeerConnectionStatus
      this.events.onPeerStatus(remoteId, state)
      if (state === 'connected') {
        void this.applyVideoEncodings(peer)
        void this.applyScreenEncodings(peer)
        void this.applyAudioParameters(peer)
      } else if (state === 'failed') {
        void this.restartIce(peer)
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') void this.restartIce(peer)
    }

    pc.onnegotiationneeded = async () => {
      if (this.isPolite(remoteId)) return
      await this.makeOffer(peer)
    }

    return peer
  }

  private closePeer(remoteId: string): void {
    const peer = this.peers.get(remoteId)
    if (!peer) return
    this.peers.delete(remoteId)
    try {
      peer.pc.ontrack = null
      peer.pc.onicecandidate = null
      peer.pc.onconnectionstatechange = null
      peer.pc.onnegotiationneeded = null
      peer.pc.close()
    } catch {
      // ignore
    }
    this.events.onRemoteStreamRemoved(remoteId)
    this.events.onRemoteScreen?.(remoteId, null)
    this.events.onPeerStatus(remoteId, 'closed')
  }

  private async makeOffer(peer: Peer, iceRestart = false): Promise<void> {
    if (peer.makingOffer || peer.pc.signalingState === 'closed') return
    try {
      peer.makingOffer = true
      peer.lastOfferAt = Date.now()
      const offer = await peer.pc.createOffer({ iceRestart })
      await peer.pc.setLocalDescription({ type: 'offer', sdp: tuneOpus(offer.sdp || '') })
      if (peer.pc.localDescription) {
        this.signaling.send(peer.id, { type: 'offer', sdp: peer.pc.localDescription.toJSON() })
      }
    } catch (err) {
      console.warn('[Mesh] makeOffer failed', err)
    } finally {
      peer.makingOffer = false
    }
  }

  private async restartIce(peer: Peer): Promise<void> {
    if (this.isPolite(peer.id)) return // impolite side drives restarts
    await this.makeOffer(peer, true)
  }

  private async handleOffer(peer: Peer, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = peer.pc
    const polite = this.isPolite(peer.id)
    const collision = peer.makingOffer || pc.signalingState !== 'stable'
    peer.ignoreOffer = !polite && collision
    if (peer.ignoreOffer) return
    try {
      await pc.setRemoteDescription(sdp) // implicit rollback for the polite peer
      await this.flushCandidates(peer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription({ type: 'answer', sdp: tuneOpus(answer.sdp || '') })
      if (pc.localDescription) {
        this.signaling.send(peer.id, { type: 'answer', sdp: pc.localDescription.toJSON() })
      }
    } catch (err) {
      console.warn('[Mesh] handleOffer failed', err)
    }
  }

  private async handleAnswer(peer: Peer, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (peer.pc.signalingState !== 'have-local-offer') return
    try {
      await peer.pc.setRemoteDescription(sdp)
      await this.flushCandidates(peer)
    } catch (err) {
      console.warn('[Mesh] handleAnswer failed', err)
    }
  }

  private async handleCandidate(peer: Peer, candidate: RTCIceCandidateInit): Promise<void> {
    if (!peer.pc.remoteDescription) {
      peer.pendingCandidates.push(candidate)
      return
    }
    try {
      await peer.pc.addIceCandidate(candidate)
    } catch (err) {
      if (!peer.ignoreOffer) console.warn('[Mesh] addIceCandidate failed', err)
    }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const pending = peer.pendingCandidates
    peer.pendingCandidates = []
    for (const c of pending) {
      try {
        await peer.pc.addIceCandidate(c)
      } catch {
        // stale candidate
      }
    }
  }

  private handleEnvelope(env: RecitalEnvelope): void {
    const { from, msg } = env
    switch (msg.type) {
      case 'hello': {
        this.ensurePeer(from)
        return
      }
      case 'bye': {
        this.closePeer(from)
        return
      }
      case 'offer': {
        const peer = this.ensurePeer(from)
        void this.handleOffer(peer, msg.sdp)
        return
      }
      case 'answer': {
        const peer = this.peers.get(from)
        if (peer) void this.handleAnswer(peer, msg.sdp)
        return
      }
      case 'ice-candidate': {
        const peer = this.peers.get(from)
        if (peer) void this.handleCandidate(peer, msg.candidate)
        return
      }
      default:
        this.events.onMessage(env)
    }
  }

  /** Re-offer connections that never came up; the impolite side drives it. */
  private watchdog(): void {
    const now = Date.now()
    for (const peer of this.peers.values()) {
      const state = peer.pc.connectionState
      if (state === 'connected' || state === 'closed') continue
      if (this.isPolite(peer.id)) continue
      if (now - peer.createdAt < CONNECT_TIMEOUT_MS) continue
      if (now - peer.lastOfferAt < CONNECT_TIMEOUT_MS) continue
      void this.makeOffer(peer, state === 'failed' || state === 'disconnected')
    }
  }

  // -------------------------------------------------------------- encodings

  private async applyAudioParameters(peer: Peer): Promise<void> {
    try {
      const params = peer.audioSender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      params.encodings[0].maxBitrate = 128_000
      // Priority hints: ignored by some browsers, honoured by Chromium.
      ;(params.encodings[0] as RTCRtpEncodingParameters & { priority?: string; networkPriority?: string }).priority = 'high'
      ;(params.encodings[0] as RTCRtpEncodingParameters & { networkPriority?: string }).networkPriority = 'high'
      await peer.audioSender.setParameters(params)
    } catch {
      // Not all browsers accept audio encoding params.
    }
  }

  private spotlightPerPeerKbps(): number {
    const peers = Math.max(1, this.peers.size)
    const perPeer = (this.spotlightBudgetKbps - peers * AUDIO_KBPS) / peers
    return Math.round(Math.min(SPOTLIGHT_MAX_KBPS, Math.max(SPOTLIGHT_MIN_KBPS, perPeer)))
  }

  private async applyVideoEncodings(only?: Peer): Promise<void> {
    const targets = only ? [only] : Array.from(this.peers.values())
    const spotlightKbps = this.spotlightPerPeerKbps()
    await Promise.all(
      targets.map(async (peer) => {
        try {
          const params = peer.videoSender.getParameters()
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
          const enc = params.encodings[0]
          if (this.videoMode === 'off') {
            enc.active = false
          } else if (this.videoMode === 'spotlight') {
            enc.active = true
            enc.maxBitrate = spotlightKbps * 1000
            enc.scaleResolutionDownBy = spotlightKbps >= 1200 ? 1 : spotlightKbps >= 500 ? 1.5 : 2
            enc.maxFramerate = spotlightKbps >= 500 ? 30 : 24
          } else {
            enc.active = true
            enc.maxBitrate = THUMBNAIL_KBPS * 1000
            enc.scaleResolutionDownBy = 4
            enc.maxFramerate = 12
          }
          ;(enc as RTCRtpEncodingParameters & { priority?: string; networkPriority?: string }).priority = 'low'
          ;(enc as RTCRtpEncodingParameters & { networkPriority?: string }).networkPriority = 'low'
          ;(params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
            this.videoMode === 'spotlight' ? 'balanced' : 'maintain-framerate'
          await peer.videoSender.setParameters(params)
        } catch {
          // Before negotiation completes some browsers reject setParameters; retried on connect.
        }
      })
    )
  }

  /**
   * Screen shares are mostly static text/UI: keep resolution, drop frame rate,
   * and budget the fan-out like the spotlight so the host's uplink survives.
   */
  private async applyScreenEncodings(only?: Peer): Promise<void> {
    const targets = only ? [only] : Array.from(this.peers.values())
    const peers = Math.max(1, this.peers.size)
    const perPeerKbps = Math.round(Math.min(3000, Math.max(250, (this.spotlightBudgetKbps * 1.6) / peers)))
    await Promise.all(
      targets.map(async (peer) => {
        try {
          const params = peer.screenSender.getParameters()
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
          const enc = params.encodings[0]
          enc.active = !!this.screenTrack
          enc.maxBitrate = perPeerKbps * 1000
          enc.maxFramerate = perPeerKbps >= 1200 ? 15 : 8
          enc.scaleResolutionDownBy = 1
          ;(params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-resolution'
          await peer.screenSender.setParameters(params)
        } catch {
          // retried on connect
        }
      })
    )
  }

  // ------------------------------------------------------------------ stats

  private async collectStats(): Promise<void> {
    if (this.closed) return
    let overall: NetQuality = this.peers.size ? 'good' : 'unknown'
    const snapshot = new Map<string, PeerStats>()

    await Promise.all(
      Array.from(this.peers.values()).map(async (peer) => {
        if (peer.pc.connectionState !== 'connected') {
          peer.stats = { ...peer.stats, quality: 'unknown' }
          snapshot.set(peer.id, peer.stats)
          return
        }
        try {
          const report = await peer.pc.getStats()
          let packetsLost = 0
          let packetsReceived = 0
          let concealed = 0
          let total = 0
          let jitter: number | null = null
          let rtt: number | null = null
          let videoBytes = 0
          report.forEach((s) => {
            if (s.type === 'inbound-rtp' && s.kind === 'audio') {
              packetsLost += s.packetsLost || 0
              packetsReceived += s.packetsReceived || 0
              concealed += s.concealedSamples || 0
              total += s.totalSamplesReceived || 0
              if (typeof s.jitter === 'number') jitter = s.jitter * 1000
            } else if (s.type === 'inbound-rtp' && s.kind === 'video') {
              videoBytes += s.bytesReceived || 0
            } else if (s.type === 'candidate-pair' && (s.nominated || s.selected) && typeof s.currentRoundTripTime === 'number') {
              rtt = s.currentRoundTripTime * 1000
            }
          })
          const now = Date.now()
          const prev = peer.lastStats
          peer.lastStats = { at: now, packetsLost, packetsReceived, concealed, total, videoBytes }
          let lossPct = 0
          let concealedPct = 0
          let videoKbps = 0
          if (prev) {
            const dLost = packetsLost - prev.packetsLost
            const dRecv = packetsReceived - prev.packetsReceived
            const dConc = concealed - prev.concealed
            const dTotal = total - prev.total
            const dt = Math.max(0.5, (now - prev.at) / 1000)
            lossPct = dLost + dRecv > 0 ? (100 * dLost) / (dLost + dRecv) : 0
            concealedPct = dTotal > 0 ? (100 * dConc) / dTotal : 0
            videoKbps = ((videoBytes - prev.videoBytes) * 8) / 1000 / dt
          }
          let quality: NetQuality = 'good'
          if (lossPct > 6 || concealedPct > 4 || (rtt !== null && rtt > 600)) quality = 'bad'
          else if (lossPct > 1.5 || concealedPct > 1.5 || (rtt !== null && rtt > 300)) quality = 'warning'
          peer.stats = { rttMs: rtt, audioLossPct: lossPct, concealedPct, jitterMs: jitter, inboundVideoKbps: videoKbps, quality }
          snapshot.set(peer.id, peer.stats)
          if (quality === 'bad') overall = 'bad'
          else if (quality === 'warning' && overall !== 'bad') overall = 'warning'
        } catch {
          snapshot.set(peer.id, peer.stats)
        }
      })
    )

    this.events.onStats({ overall, peers: snapshot })
  }
}

/**
 * Ask Opus for music, not speech: ~96 kbps mono, no DTX (silence suppression
 * would chop breaths and tails), in-band FEC on, full-band playback.
 * fmtp lines describe what the *receiver* wants, so tuning both offer and
 * answer covers both directions.
 */
export function tuneOpus(sdp: string): string {
  const rtpmap = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp)
  if (!rtpmap) return sdp
  const pt = rtpmap[1]
  const wanted: Record<string, string> = {
    maxaveragebitrate: String(AUDIO_KBPS * 1000),
    maxplaybackrate: '48000',
    stereo: '0',
    'sprop-stereo': '0',
    usedtx: '0',
    useinbandfec: '1',
    cbr: '0',
  }
  const fmtpRegex = new RegExp(`^a=fmtp:${pt} (.*)$`, 'm')
  const match = fmtpRegex.exec(sdp)
  if (match) {
    const params: Record<string, string> = {}
    for (const kv of match[1].split(';')) {
      const [k, v] = kv.split('=').map((s) => s.trim())
      if (k) params[k] = v ?? ''
    }
    Object.assign(params, wanted)
    const line = `a=fmtp:${pt} ` + Object.entries(params).map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';')
    return sdp.replace(fmtpRegex, line)
  }
  const line = `a=fmtp:${pt} ` + Object.entries(wanted).map(([k, v]) => `${k}=${v}`).join(';')
  return sdp.replace(rtpmap[0], `${rtpmap[0]}\r\n${line}`)
}
