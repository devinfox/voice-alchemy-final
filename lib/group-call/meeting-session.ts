/**
 * Copied from ../crm/lib/meeting-session.ts (the engine behind the CRM's daily
 * meeting), so group classes and recitals run on the same multi-person logic.
 * Keep it in step with that file. What differs here, and why:
 *   - the join token comes from /api/recitals/livekit, authorised by the
 *     class/recital session token (guests have no account);
 *   - the microphone bitrate is passed in: singing needs far more than speech;
 *   - a screen share gets its own stream (onRemoteScreen) so the camera stays
 *     visible beside it;
 *   - other people's connection quality is reported (onRemoteQuality);
 *   - host actions and the lobby are handled by the class/recital code
 *     (lib/recital/sfu.ts), not by LiveKit permissions.
 *
 * The call's transport: one LiveKit room connection (an SFU), wrapped so the
 * meeting UI (components/meetings/video-chat.tsx) deals in participants,
 * MediaStreams and messages, never in LiveKit objects.
 *
 * Why an SFU: in the old browser-to-browser mesh every person encoded and
 * uploaded a separate copy of their camera and mic to every other person, so a
 * 13-person daily meeting meant twelve encoders per laptop and 12× upload for
 * whoever shared a screen. Here everyone sends one copy to the server, which
 * forwards it; the server also picks the right simulcast layer per viewer.
 *
 * Trust: join tokens come from /api/recitals/livekit; the server decides who
 * may enter and who is a host.
 *
 * No console logging anywhere in here: everything goes to the MeetingLogger.
 */
import {
  ConnectionQuality,
  DisconnectReason,
  LogLevel,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
  setLogLevel,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from 'livekit-client'
import { addTrackNotifying, removeTrackNotifying } from './media-stream-tracks'

export interface MeetingLogger {
  debug(event: string, data?: Record<string, unknown>): void
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, data?: Record<string, unknown>): void
}

/** Phones and tablets: weaker encoders, cellular uplinks. */
function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; the touch points give it away.
  const applePad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return applePad || /iPhone|iPad|iPod|Android|Mobile|Silk|Kindle/i.test(ua)
}

export type LinkQuality = 'excellent' | 'good' | 'poor' | 'lost'

export interface MeetingParticipant {
  id: string
  name: string
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isHost: boolean
  joinedAt: number
}

/** A guest in the lobby, shown to hosts. */
export interface PendingRequest {
  id: string
  name: string
  email?: string
  requestedAt: number
  waitingSince: number
}

export interface ChatMessageIn {
  from: string
  name: string
  message: string
  timestamp: number
}

export interface PresentationState {
  isActive: boolean
  hostId: string
  currentSlide: number
}

export type CommandType =
  | 'force-mute'
  | 'stop-screen-share'
  | 'remove-participant'
  | 'screen-share-request'
  | 'screen-share-response'

export interface CommandMessage {
  type: CommandType
  /** Sender id; null when our server sent it (always trustworthy). */
  from: string | null
  /** Sender's display name, when the sender included one. */
  name?: string
  payload?: Record<string, unknown>
}

export type DisconnectCause = 'removed' | 'denied' | 'duplicate' | 'ended' | 'left' | 'error'

export type RemoteQuality = 'low' | 'medium' | 'high'

export interface MeetingSessionEvents {
  onParticipants: (participants: MeetingParticipant[]) => void
  onPending: (pending: PendingRequest[]) => void
  onRemoteStream: (id: string, stream: MediaStream) => void
  onRemoteStreamRemoved: (id: string) => void
  /** Someone's screen share started (a stream) or stopped (null). */
  onRemoteScreen?: (id: string, stream: MediaStream | null) => void
  /** Another person's connection quality changed. */
  onRemoteQuality?: (id: string, quality: LinkQuality) => void
  /** We were in the lobby and a host let us in. */
  onAdmitted: () => void
  onChat: (message: ChatMessageIn) => void
  onPresentation: (state: PresentationState) => void
  onCommand: (command: CommandMessage) => void
  /** The server muted one of our tracks (a host's doing). */
  onLocalMuted: (source: 'microphone' | 'camera' | 'screen') => void
  onConnection: (state: 'reconnecting' | 'reconnected') => void
  onDisconnected: (cause: DisconnectCause) => void
  onQuality?: (quality: LinkQuality) => void
  /**
   * Who the server currently hears, loudest first. Fires on every change,
   * including to an empty list when the room goes quiet. Identities, so the
   * UI can match them against participants and remote streams.
   */
  onActiveSpeakers?: (ids: string[]) => void
  /**
   * LiveKit is recording the room (lib/meeting-recording-egress.ts). Fires
   * once on connect with the current state, then on every change, for every
   * participant, so everyone sees the badge.
   */
  onRecording?: (recording: boolean) => void
  /**
   * Whether the browser lets this page play call audio (LiveKit's own
   * check, Room.canPlaybackAudio). False on phones until a tap: the UI then
   * shows "Tap to turn on sound", which calls startAudio().
   */
  onAudioPlayback?: (canPlay: boolean) => void
}

interface ParticipantMeta {
  host: boolean
  waiting: boolean
  guest: boolean
  email?: string
  denied?: boolean
}

function parseMeta(raw: string | undefined): ParticipantMeta {
  if (!raw) return { host: false, waiting: false, guest: false }
  try {
    const p = JSON.parse(raw) as Partial<ParticipantMeta>
    return { host: !!p.host, waiting: !!p.waiting, guest: !!p.guest, email: p.email, denied: !!p.denied }
  } catch {
    return { host: false, waiting: false, guest: false }
  }
}

interface RemoteEntry {
  stream: MediaStream
  /** The screen share and its sound, kept apart from the camera stream. */
  screenStream: MediaStream
  camera: MediaStreamTrack | null
  screen: MediaStreamTrack | null
  announced: boolean
}

// The SDK's own logger would otherwise print to the console; our telemetry is
// the only place call diagnostics go.
setLogLevel(LogLevel.silent)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const TOPIC_CHAT = 'chat'
const TOPIC_PRESENTATION = 'presentation'
const TOPIC_COMMAND = 'command'

export interface ConnectOptions {
  /** The class/recital session token from the join route. */
  sessionToken: string
  /** Microphone bitrate ceiling in kbps. */
  audioKbps: number
  logger: MeetingLogger
}

/** The server refused a token; `status` tells a lobby wait (403) from a real failure. */
export class JoinRefusedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export class MeetingSession {
  private room: Room
  private events: MeetingSessionEvents
  private logger: MeetingLogger
  private remotes = new Map<string, RemoteEntry>()
  private camPub: LocalTrackPublication | null = null
  private micPub: LocalTrackPublication | null = null
  private screenPub: LocalTrackPublication | null = null
  private screenAudioPub: LocalTrackPublication | null = null
  private participantsScheduled = false
  private closed = false

  readonly roomId: string
  readonly identity: string
  /** True while we sit in the lobby (no publish, no subscribe). */
  waiting: boolean
  readonly isHost: boolean

  private constructor(room: Room, opts: { roomId: string; identity: string; waiting: boolean; host: boolean }, events: MeetingSessionEvents, logger: MeetingLogger) {
    this.room = room
    this.events = events
    this.logger = logger
    this.roomId = opts.roomId
    this.identity = opts.identity
    this.waiting = opts.waiting
    this.isHost = opts.host
  }

  /** Ask our server for a token, then join. Resolves once the room is connected. */
  static async connect(opts: ConnectOptions, events: MeetingSessionEvents): Promise<MeetingSession> {
    const res = await fetch('/api/recitals/livekit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.sessionToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new JoinRefusedError(data.error || `Could not join the call (${res.status})`, res.status)
    }
    const grant = (await res.json()) as { url: string; token: string; room: string; identity: string; host: boolean; waiting: boolean }

    const mobile = isLikelyMobile()
    const room = new Room({
      // Quality per viewer is chosen by setVideoQuality() below, from what the
      // layout shows. adaptiveStream stays off on purpose: it sizes and pauses
      // subscriptions from the <video> elements LiveKit itself attached, and
      // ours are plain elements fed MediaStreams (see onTrackSubscribed). With
      // it on, every remote camera counts as "not visible" and the SFU pauses
      // it (livekit-client RemoteVideoTrack.updateVisibility, 2.23).
      adaptiveStream: false,
      // Layers nobody is watching are not encoded at all.
      dynacast: true,
      // We own our camera and mic tracks (the voice pipeline runs on the mic).
      stopLocalTrackOnUnpublish: false,
      disconnectOnPageLeave: true,
      publishDefaults: {
        simulcast: true,
        // Desktops: H.264, hardware-encoded nearly everywhere. Phones: VP8,
        // because Android phones without an H.264 hardware encoder fell back
        // to a software one that couldn't keep up (B02). Either way a VP8
        // copy is offered to a receiver that can't decode the primary.
        videoCodec: mobile ? 'vp8' : 'h264',
        backupCodec: { codec: 'vp8' },
        // Phones capture 540p (cameraConstraints in video-chat.tsx) and send at most that, over
        // a cellular uplink: 180p and 360p below it.
        videoEncoding: mobile ? VideoPresets.h540.encoding : VideoPresets.h720.encoding,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        // Never DTX: it clips the first syllable after silence. RED (redundant
        // audio) costs little with one uplink and rides out bursty loss.
        dtx: false,
        red: true,
        audioPreset: { maxBitrate: opts.audioKbps * 1000 },
        stopMicTrackOnMute: false,
      },
    })

    const session = new MeetingSession(
      room,
      { roomId: grant.room, identity: grant.identity, waiting: grant.waiting, host: grant.host },
      events,
      opts.logger
    )
    session.wire()

    await room.connect(grant.url, grant.token, { autoSubscribe: true })
    opts.logger.info('room_connected', {
      waiting: grant.waiting,
      host: grant.host,
      participants: room.remoteParticipants.size,
      serverUrl: grant.url,
    })
    // Anyone already here.
    room.remoteParticipants.forEach((p) => session.adoptParticipant(p))
    session.scheduleParticipants()
    session.events.onRecording?.(room.isRecording)
    if (!room.canPlaybackAudio) session.events.onAudioPlayback?.(false)
    return session
  }

  // --- Events ---------------------------------------------------------------

  private wire() {
    const room = this.room
    room
      .on(RoomEvent.ParticipantConnected, (p) => {
        this.logger.info('participant_connected', { id: p.identity, waiting: parseMeta(p.metadata).waiting })
        this.adoptParticipant(p)
        this.scheduleParticipants()
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        this.logger.info('participant_disconnected', { id: p.identity })
        this.dropParticipant(p.identity)
        this.scheduleParticipants()
      })
      .on(RoomEvent.ParticipantMetadataChanged, () => this.scheduleParticipants())
      // An admit arrives as two updates, metadata and permissions, in either
      // order. Only the permissions make publishing legal, so that is the one
      // that ends the lobby; acting on the metadata first failed the publish
      // with "insufficient permissions".
      .on(RoomEvent.ParticipantPermissionsChanged, (_prev, p) => {
        if (p.identity !== this.identity) return
        if (this.waiting && p.permissions?.canPublish && p.permissions.canSubscribe) this.admitted()
      })
      .on(RoomEvent.TrackSubscribed, (track, pub, p) => this.onTrackSubscribed(track, pub, p))
      .on(RoomEvent.TrackUnsubscribed, (track, pub, p) => this.onTrackUnsubscribed(track, pub, p))
      .on(RoomEvent.TrackPublished, () => this.scheduleParticipants())
      .on(RoomEvent.TrackUnpublished, () => this.scheduleParticipants())
      .on(RoomEvent.LocalTrackPublished, () => this.scheduleParticipants())
      .on(RoomEvent.LocalTrackUnpublished, () => this.scheduleParticipants())
      .on(RoomEvent.TrackMuted, (pub, p) => this.onMuteChanged(pub, p, true))
      .on(RoomEvent.TrackUnmuted, (pub, p) => this.onMuteChanged(pub, p, false))
      .on(RoomEvent.DataReceived, (payload, p, _kind, topic) => this.onData(payload, p, topic))
      .on(RoomEvent.Reconnecting, () => {
        this.logger.warn('reconnecting')
        this.events.onConnection('reconnecting')
      })
      .on(RoomEvent.Reconnected, () => {
        this.logger.info('reconnected')
        this.events.onConnection('reconnected')
      })
      .on(RoomEvent.Disconnected, (reason) => this.onDisconnected(reason))
      .on(RoomEvent.ConnectionQualityChanged, (quality, p) => {
        const label =
          quality === ConnectionQuality.Excellent ? 'excellent'
          : quality === ConnectionQuality.Good ? 'good'
          : quality === ConnectionQuality.Poor ? 'poor'
          : 'lost'
        if (p.identity !== this.identity) {
          this.events.onRemoteQuality?.(p.identity, label)
          return
        }
        // Every change, with the device, so a bad call can be traced to a
        // phone or a network (B02). Changes are rare; this stays cheap.
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : undefined
        if (label === 'poor' || label === 'lost') this.logger.warn('connection_quality', { quality: label, ua })
        else this.logger.info('connection_quality', { quality: label, ua })
        this.events.onQuality?.(label)
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.events.onActiveSpeakers?.(speakers.map(sp => sp.identity))
      })
      .on(RoomEvent.MediaDevicesError, (err) => this.logger.error('media_devices_error', { err }))
      .on(RoomEvent.RecordingStatusChanged, (recording) => this.events.onRecording?.(recording))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        // Logged by the UI (audio_playback_blocked / audio_unlocked), which
        // also counts its own refused audio elements.
        this.events.onAudioPlayback?.(room.canPlaybackAudio)
      })
      .on(RoomEvent.TrackSubscriptionFailed, (sid, p, reason) =>
        this.logger.warn('track_subscription_failed', { sid, from: p?.identity, reason: reason !== undefined ? String(reason) : undefined })
      )
  }

  private admitted() {
    this.waiting = false
    this.logger.info('admitted')
    // Subscriptions start now; adopt everyone so their tracks have a stream.
    this.room.remoteParticipants.forEach((p) => this.adoptParticipant(p))
    this.scheduleParticipants()
    this.events.onAdmitted()
  }

  private onDisconnected(reason?: DisconnectReason) {
    if (this.closed) return
    this.closed = true
    let cause: DisconnectCause
    switch (reason) {
      case DisconnectReason.PARTICIPANT_REMOVED:
        cause = this.waiting ? 'denied' : 'removed'
        break
      case DisconnectReason.DUPLICATE_IDENTITY:
        cause = 'duplicate'
        break
      case DisconnectReason.CLIENT_INITIATED:
        cause = 'left'
        break
      case DisconnectReason.ROOM_DELETED:
      case DisconnectReason.ROOM_CLOSED:
        cause = 'ended'
        break
      default:
        cause = 'error'
    }
    this.logger.info('disconnected', { cause, reason: reason !== undefined ? DisconnectReason[reason] : undefined })
    this.events.onDisconnected(cause)
  }

  // --- Participants ---------------------------------------------------------

  private scheduleParticipants() {
    if (this.participantsScheduled) return
    this.participantsScheduled = true
    queueMicrotask(() => {
      this.participantsScheduled = false
      if (this.closed) return
      const list: MeetingParticipant[] = []
      const pending: PendingRequest[] = []
      const add = (p: Participant) => {
        const meta = parseMeta(p.metadata)
        const joinedAt = p.joinedAt ? p.joinedAt.getTime() : Date.now()
        if (meta.waiting) {
          if (p.identity !== this.identity) {
            pending.push({ id: p.identity, name: p.name || 'Guest', email: meta.email, requestedAt: joinedAt, waitingSince: joinedAt })
          }
          return
        }
        const mic = p.getTrackPublication(Track.Source.Microphone)
        const cam = p.getTrackPublication(Track.Source.Camera)
        const screen = p.getTrackPublication(Track.Source.ScreenShare)
        list.push({
          id: p.identity,
          name: p.name || (p.identity === this.identity ? 'You' : 'Participant'),
          isMuted: !mic || mic.isMuted,
          isVideoOff: !cam || cam.isMuted,
          isScreenSharing: !!screen && !screen.isMuted,
          isHost: meta.host,
          joinedAt,
        })
      }
      if (!this.waiting) add(this.room.localParticipant)
      this.room.remoteParticipants.forEach(add)
      list.sort((a, b) => a.joinedAt - b.joinedAt)
      this.events.onParticipants(list)
      if (this.isHost) this.events.onPending(pending.sort((a, b) => a.waitingSince - b.waitingSince))
    })
  }

  private adoptParticipant(p: RemoteParticipant) {
    if (parseMeta(p.metadata).waiting) return
    p.trackPublications.forEach((pub) => {
      const remotePub = pub as RemoteTrackPublication
      if (remotePub.track && remotePub.isSubscribed) this.onTrackSubscribed(remotePub.track as RemoteTrack, remotePub, p)
    })
  }

  private dropParticipant(id: string) {
    const entry = this.remotes.get(id)
    if (!entry) return
    this.remotes.delete(id)
    if (entry.screen) this.events.onRemoteScreen?.(id, null)
    if (entry.announced) this.events.onRemoteStreamRemoved(id)
  }

  private entryFor(id: string): RemoteEntry {
    let entry = this.remotes.get(id)
    if (!entry) {
      entry = { stream: new MediaStream(), screenStream: new MediaStream(), camera: null, screen: null, announced: false }
      this.remotes.set(id, entry)
    }
    return entry
  }

  /**
   * The main stream carries the camera; the screen share lives on its own
   * stream. Tracks go on and off through the notifying helpers: a plain
   * addTrack() fires no event, and the tiles only re-attach on `addtrack`
   * (lib/group-call/media-stream-tracks.ts).
   */
  private syncVideo(entry: RemoteEntry) {
    for (const t of entry.stream.getVideoTracks()) {
      if (t !== entry.camera) removeTrackNotifying(entry.stream, t)
    }
    if (entry.camera) addTrackNotifying(entry.stream, entry.camera)
  }

  private syncScreen(id: string, entry: RemoteEntry) {
    for (const t of entry.screenStream.getVideoTracks()) {
      if (t !== entry.screen) removeTrackNotifying(entry.screenStream, t)
    }
    if (entry.screen) addTrackNotifying(entry.screenStream, entry.screen)
    this.events.onRemoteScreen?.(id, entry.screen ? entry.screenStream : null)
  }

  private announce(id: string, entry: RemoteEntry) {
    if (entry.announced) return
    entry.announced = true
    this.events.onRemoteStream(id, entry.stream)
  }

  private onTrackSubscribed(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) {
    // What each person actually receives, so "the other side never showed
    // up" can be checked in meeting_events instead of guessed.
    this.logger.info('track_subscribed', { from: p.identity, source: pub.source, kind: track.kind })
    const entry = this.entryFor(p.identity)
    const mst = track.mediaStreamTrack
    if (pub.source === Track.Source.ScreenShareAudio) {
      // A shared tab's sound rides with the share.
      addTrackNotifying(entry.screenStream, mst)
      if (entry.screen) this.events.onRemoteScreen?.(p.identity, entry.screenStream)
    } else if (track.kind === Track.Kind.Audio) {
      // Their mic. Announced below if this is the first track; otherwise the
      // audio element learns of it from the `addtrack` the helper fires, which
      // is what a late microphone (camera subscribed first) depends on.
      addTrackNotifying(entry.stream, mst)
    } else if (pub.source === Track.Source.ScreenShare) {
      entry.screen = mst
      this.syncScreen(p.identity, entry)
      // A share is always worth full quality.
      pub.setVideoQuality(VideoQuality.HIGH)
    } else {
      entry.camera = mst
      this.syncVideo(entry)
    }
    this.announce(p.identity, entry)
    this.scheduleParticipants()
  }

  private onTrackUnsubscribed(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) {
    this.logger.info('track_unsubscribed', { from: p.identity, source: pub.source, kind: track.kind })
    const entry = this.remotes.get(p.identity)
    if (!entry) return
    const mst = track.mediaStreamTrack
    if (pub.source === Track.Source.ScreenShareAudio) {
      removeTrackNotifying(entry.screenStream, mst)
    } else if (track.kind === Track.Kind.Audio) {
      removeTrackNotifying(entry.stream, mst)
    } else if (pub.source === Track.Source.ScreenShare) {
      if (entry.screen === mst) entry.screen = null
      this.syncScreen(p.identity, entry)
    } else {
      if (entry.camera === mst) entry.camera = null
      this.syncVideo(entry)
    }
    this.scheduleParticipants()
  }

  private onMuteChanged(pub: TrackPublication, p: Participant, muted: boolean) {
    this.scheduleParticipants()
    if (p.identity !== this.identity || !muted) return
    // Our own mute() calls land here too; the UI treats a repeat as a no-op.
    const source =
      pub.source === Track.Source.Microphone ? 'microphone'
      : pub.source === Track.Source.Camera ? 'camera'
      : pub.source === Track.Source.ScreenShare ? 'screen'
      : null
    if (source) this.events.onLocalMuted(source)
  }

  private onData(payload: Uint8Array, p: RemoteParticipant | undefined, topic?: string) {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(decoder.decode(payload)) as Record<string, unknown>
    } catch {
      return
    }
    const from = p?.identity ?? null
    if (topic === TOPIC_CHAT) {
      if (!from) return
      this.events.onChat({
        from,
        name: typeof msg.senderName === 'string' ? msg.senderName : p?.name || 'Participant',
        message: typeof msg.message === 'string' ? msg.message : '',
        timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
      })
    } else if (topic === TOPIC_PRESENTATION) {
      if (!from) return
      this.events.onPresentation({
        isActive: !!msg.isActive,
        hostId: typeof msg.hostId === 'string' ? msg.hostId : from,
        currentSlide: typeof msg.currentSlide === 'number' ? msg.currentSlide : 0,
      })
    } else if (topic === TOPIC_COMMAND) {
      const type = msg.type as CommandType
      if (typeof type !== 'string') return
      this.events.onCommand({
        type,
        from,
        name: typeof msg.name === 'string' ? msg.name : p?.name,
        payload: msg.payload && typeof msg.payload === 'object' ? (msg.payload as Record<string, unknown>) : undefined,
      })
    }
  }

  // --- Local media ----------------------------------------------------------

  /**
   * Publish our camera and mic, exactly as the UI has them (muted stays muted).
   * Safe to call again after the lobby: already-published tracks are skipped.
   */
  async publishLocal(stream: MediaStream, state: { micMuted: boolean; cameraOff: boolean }): Promise<void> {
    if (this.waiting || this.closed) return
    const local = this.room.localParticipant
    const audio = stream.getAudioTracks()[0]
    const video = stream.getVideoTracks()[0]
    if (audio && !this.micPub) {
      this.micPub = await local.publishTrack(audio, { source: Track.Source.Microphone, name: 'microphone' })
      await this.setMicMuted(state.micMuted)
    }
    if (video && !this.camPub) {
      this.camPub = await local.publishTrack(video, { source: Track.Source.Camera, name: 'camera' })
      await this.setCameraOff(state.cameraOff)
    }
    this.logger.info('local_published', { audio: !!audio, video: !!video, micMuted: state.micMuted, cameraOff: state.cameraOff })
  }

  async setMicMuted(muted: boolean): Promise<void> {
    if (!this.micPub) return
    if (muted) await this.micPub.mute()
    else await this.micPub.unmute()
  }

  async setCameraOff(off: boolean): Promise<void> {
    if (!this.camPub) return
    if (off) await this.camPub.mute()
    else await this.camPub.unmute()
  }

  /** A different camera track (device switch, background effect on/off). */
  async replaceCamera(track: MediaStreamTrack, cameraOff: boolean): Promise<void> {
    if (this.waiting || this.closed) return
    if (this.camPub?.track) {
      await this.camPub.track.replaceTrack(track, { userProvidedTrack: true })
      await this.setCameraOff(cameraOff)
    } else {
      this.camPub = await this.room.localParticipant.publishTrack(track, { source: Track.Source.Camera, name: 'camera' })
      await this.setCameraOff(cameraOff)
    }
  }

  async replaceMic(track: MediaStreamTrack, micMuted: boolean): Promise<void> {
    if (this.waiting || this.closed) return
    if (this.micPub?.track) {
      await this.micPub.track.replaceTrack(track, { userProvidedTrack: true })
      await this.setMicMuted(micMuted)
    } else {
      this.micPub = await this.room.localParticipant.publishTrack(track, { source: Track.Source.Microphone, name: 'microphone' })
      await this.setMicMuted(micMuted)
    }
  }

  /** Stop sending the microphone. The track itself is the caller's to stop. */
  async unpublishMic(): Promise<void> {
    const pub = this.micPub
    this.micPub = null
    if (pub?.track) await this.room.localParticipant.unpublishTrack(pub.track, false)
  }

  /** Stop sending the camera. The track itself is the caller's to stop. */
  async unpublishCamera(): Promise<void> {
    const pub = this.camPub
    this.camPub = null
    if (pub?.track) await this.room.localParticipant.unpublishTrack(pub.track, false)
  }

  async startScreenShare(video: MediaStreamTrack, audio?: MediaStreamTrack): Promise<void> {
    if (this.waiting || this.closed) return
    const local = this.room.localParticipant
    this.screenPub = await local.publishTrack(video, {
      source: Track.Source.ScreenShare,
      name: 'screen',
      simulcast: false,
      videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
    })
    if (audio) {
      this.screenAudioPub = await local.publishTrack(audio, {
        source: Track.Source.ScreenShareAudio,
        name: 'screen-audio',
        dtx: false,
        audioPreset: { maxBitrate: 64_000 },
      })
    }
    this.logger.info('screen_share_started', { audio: !!audio })
  }

  async stopScreenShare(): Promise<void> {
    const local = this.room.localParticipant
    const pubs = [this.screenPub, this.screenAudioPub]
    this.screenPub = null
    this.screenAudioPub = null
    for (const pub of pubs) {
      if (pub?.track) {
        try {
          await local.unpublishTrack(pub.track, false)
        } catch {
          // Already gone.
        }
      }
    }
    this.logger.info('screen_share_stopped')
  }

  // --- Subscriptions ----------------------------------------------------------

  /** Ask the server for the layer this viewer needs: big tile, small tile. */
  setVideoQuality(id: string, quality: RemoteQuality): void {
    const p = this.room.remoteParticipants.get(id)
    const pub = p?.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | undefined
    if (!pub) return
    const q = quality === 'high' ? VideoQuality.HIGH : quality === 'medium' ? VideoQuality.MEDIUM : VideoQuality.LOW
    try {
      pub.setVideoQuality(q)
    } catch {
      // Not subscribed yet; the next layout pass will try again.
    }
  }

  // --- Messages ---------------------------------------------------------------

  private async publishData(topic: string, data: Record<string, unknown>, to?: string[]): Promise<void> {
    if (this.waiting || this.closed) return
    try {
      await this.room.localParticipant.publishData(encoder.encode(JSON.stringify(data)), {
        reliable: true,
        topic,
        destinationIdentities: to,
      })
    } catch (err) {
      this.logger.warn('publish_data_failed', { topic, err })
    }
  }

  sendChat(message: string, senderName: string): Promise<void> {
    return this.publishData(TOPIC_CHAT, { message, senderName, timestamp: Date.now() })
  }

  sendPresentation(state: PresentationState): Promise<void> {
    return this.publishData(TOPIC_PRESENTATION, { ...state })
  }

  /** Peer-to-peer request (screen hand-over). The receiver checks the sender is a host. */
  sendCommand(to: string, type: 'screen-share-request' | 'screen-share-response', payload: Record<string, unknown>, name: string): Promise<void> {
    return this.publishData(TOPIC_COMMAND, { type, name, payload }, [to])
  }

  // --- Audio ------------------------------------------------------------------

  /**
   * Let the page play call audio. Must run inside a tap or click (that is
   * the whole point): resumes LiveKit's audio context and the elements it
   * manages. Our own <audio> sinks retry on the same gesture by themselves.
   */
  async startAudio(): Promise<void> {
    try {
      await this.room.startAudio()
      this.logger.info('audio_start_tapped', { canPlay: this.room.canPlaybackAudio })
    } catch (err) {
      this.logger.warn('audio_unlock_failed', { err })
    }
    this.events.onAudioPlayback?.(this.room.canPlaybackAudio)
  }

  // --- Teardown -------------------------------------------------------------

  async disconnect(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.remotes.clear()
    try {
      await this.room.disconnect(false)
    } catch {
      // Already closed.
    }
  }
}
