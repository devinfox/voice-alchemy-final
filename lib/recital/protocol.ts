/**
 * Wire protocol for the recital room (Supabase Realtime broadcast + presence).
 * Shared by the mesh engine, the React hook and the UI.
 */
import type { RecitalRole } from '@/types/recital.types'

export type RecitalPhase = 'lobby' | 'performing' | 'intermission' | 'ended'

/** Host-authored room state. Rebroadcast to late joiners. */
export interface RecitalLiveState {
  phase: RecitalPhase
  current: {
    performanceId: string
    performerParticipantId: string | null
    performerName: string
    songTitle: string
    startedAt: number
  } | null
  /** Host is recording an archive of the stage. */
  hostRecording: boolean
  /** Monotonic; receivers ignore stale updates. */
  version: number
}

export const INITIAL_LIVE_STATE: RecitalLiveState = {
  phase: 'lobby',
  current: null,
  hostRecording: false,
  version: 0,
}

export type NetQuality = 'good' | 'warning' | 'bad' | 'unknown'

/** Presence payload each participant tracks on the channel. */
export interface RecitalPresence {
  id: string
  name: string
  role: RecitalRole
  isMuted: boolean
  isVideoOff: boolean
  handRaised: boolean
  clipping: boolean
  net: NetQuality
  /** Which audio profile this peer is currently sending. */
  audioProfile: 'talk' | 'performance'
  /** In the waiting room (training sessions): visible to the host, not connected. */
  waiting?: boolean
  /** Currently sharing a screen. */
  sharingScreen?: boolean
  joinedAt: number
}

export interface ChatMessage {
  id: string
  from: string
  senderName: string
  senderRole: RecitalRole
  text: string
  at: number
}

export type HostCommand =
  | { command: 'admit' }
  | { command: 'deny' }
  | { command: 'mute' }
  | { command: 'mute-all' }
  | { command: 'lower-hand' }
  | { command: 'remove'; reason?: string }

export type RecitalMessage =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'state'; state: RecitalLiveState }
  | { type: 'state-request' }
  | { type: 'program-updated' }
  | { type: 'host-command'; cmd: HostCommand }
  | { type: 'reaction'; emoji: string }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'chat-history'; messages: ChatMessage[] }
  | { type: 'hello' }
  | { type: 'bye' }

export interface RecitalEnvelope {
  from: string
  to?: string
  msg: RecitalMessage
  ts: number
}

/** Audio bitrate we ask Opus for, per direction, in kbps. */
export const AUDIO_KBPS = 96
/** Thumbnail video budget per peer, in kbps. */
export const THUMBNAIL_KBPS = 70
/** Floor and ceiling for the performer's per-peer video bitrate, in kbps. */
export const SPOTLIGHT_MIN_KBPS = 180
export const SPOTLIGHT_MAX_KBPS = 2500

export const REACTIONS = ['👏', '🌹', '🎉', '❤️', '🔥', '🥹'] as const
