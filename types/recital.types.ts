/**
 * Recital domain types. Mirrors supabase/migrations/20260907000003_recitals.sql.
 */

export type RecitalStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'
export type RecitalRole = 'host' | 'audience'
export type PerformanceStatus = 'queued' | 'performing' | 'done' | 'skipped'
export type RecordingKind = 'performer-local' | 'host-archive'

export interface RecitalSettings {
  /** Audience members send a low-res thumbnail video (default true). */
  audienceVideo: boolean
  /** The performer records a pristine local copy and uploads it (default true). */
  localRecording: boolean
  /** The host records what they receive from the performer as a backup (default true). */
  hostArchive: boolean
  /** Upload budget for the performer's video fan-out, in kbps (default 5000). */
  performerUplinkKbps: number
  /** Audience may unmute themselves during a performance (default true). */
  allowSelfUnmute: boolean
}

export const DEFAULT_RECITAL_SETTINGS: RecitalSettings = {
  audienceVideo: true,
  localRecording: true,
  hostArchive: true,
  performerUplinkKbps: 5000,
  allowSelfUnmute: true,
}

export function resolveSettings(raw: unknown): RecitalSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<RecitalSettings>
  return {
    audienceVideo: s.audienceVideo ?? DEFAULT_RECITAL_SETTINGS.audienceVideo,
    localRecording: s.localRecording ?? DEFAULT_RECITAL_SETTINGS.localRecording,
    hostArchive: s.hostArchive ?? DEFAULT_RECITAL_SETTINGS.hostArchive,
    performerUplinkKbps: clampNumber(s.performerUplinkKbps, 1500, 20000, DEFAULT_RECITAL_SETTINGS.performerUplinkKbps),
    allowSelfUnmute: s.allowSelfUnmute ?? DEFAULT_RECITAL_SETTINGS.allowSelfUnmute,
  }
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}

export interface Recital {
  id: string
  host_id: string
  title: string
  description: string | null
  scheduled_at: string
  duration_minutes: number
  status: RecitalStatus
  join_code: string
  current_performance_id: string | null
  settings: Partial<RecitalSettings>
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface SoundcheckResult {
  rawPeakDb: number
  verdict: SoundcheckVerdict
  trimDb: number
  deviceLabel: string | null
  isBluetooth: boolean
  headphones: boolean
  at: string
}

export type SoundcheckVerdict = 'too-hot' | 'hot' | 'good' | 'quiet' | 'silent'

export interface RecitalParticipant {
  id: string
  recital_id: string
  profile_id: string | null
  display_name: string
  /** Only returned to the host. */
  email?: string | null
  role: RecitalRole
  soundcheck: SoundcheckResult | null
  joined_at: string | null
  left_at: string | null
  created_at: string
}

export interface RecitalPerformance {
  id: string
  recital_id: string
  participant_id: string | null
  performer_name: string
  song_title: string
  composer: string | null
  notes: string | null
  order_index: number
  status: PerformanceStatus
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export interface RecitalRecording {
  id: string
  recital_id: string
  performance_id: string | null
  participant_id: string | null
  kind: RecordingKind
  storage_path: string
  mime_type: string | null
  file_size: number | null
  duration_seconds: number | null
  created_at: string
  /** Signed URL, only present in API responses. */
  url?: string
  performance?: Pick<RecitalPerformance, 'performer_name' | 'song_title'> | null
}

/** What a participant (guest or account) needs to enter the room. */
export interface RecitalJoinGrant {
  token: string
  participantId: string
  role: RecitalRole
  displayName: string
  recital: Recital
  hostName: string
  performances: RecitalPerformance[]
  participants: RecitalParticipant[]
}
