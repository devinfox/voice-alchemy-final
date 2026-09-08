/**
 * Training session domain types. Mirrors 20260907000004_training_sessions.sql.
 */

export type TrainingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'
export type TrainingRole = 'host' | 'attendee'

export interface TrainingSettings {
  /** People wait until the host lets them in (invited emails skip the wait). */
  waitingRoom: boolean
  /** Attendees appear on small tiles. */
  audienceVideo: boolean
  /** Attendees may unmute themselves. */
  allowSelfUnmute: boolean
  /** Upload budget for the host's video/screen fan-out, kbps. */
  uplinkKbps: number
}

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  waitingRoom: true,
  audienceVideo: true,
  allowSelfUnmute: true,
  uplinkKbps: 6000,
}

export function resolveTrainingSettings(raw: unknown): TrainingSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<TrainingSettings>
  const kbps = typeof s.uplinkKbps === 'number' && Number.isFinite(s.uplinkKbps) ? s.uplinkKbps : DEFAULT_TRAINING_SETTINGS.uplinkKbps
  return {
    waitingRoom: s.waitingRoom ?? DEFAULT_TRAINING_SETTINGS.waitingRoom,
    audienceVideo: s.audienceVideo ?? DEFAULT_TRAINING_SETTINGS.audienceVideo,
    allowSelfUnmute: s.allowSelfUnmute ?? DEFAULT_TRAINING_SETTINGS.allowSelfUnmute,
    uplinkKbps: Math.min(20000, Math.max(1500, kbps)),
  }
}

export interface TrainingSession {
  id: string
  host_id: string
  title: string
  description: string | null
  scheduled_at: string
  duration_minutes: number
  status: TrainingStatus
  join_code: string
  settings: Partial<TrainingSettings>
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface TrainingParticipant {
  id: string
  session_id: string
  profile_id: string | null
  first_name: string
  last_name: string
  /** Only returned to the host. */
  email?: string | null
  role: TrainingRole
  invited: boolean
  admitted_at: string | null
  denied_at: string | null
  joined_at: string | null
  left_at: string | null
  created_at: string
}

export function participantName(p: Pick<TrainingParticipant, 'first_name' | 'last_name'>): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
}

export interface TrainingJoinGrant {
  token: string
  participantId: string
  role: TrainingRole
  displayName: string
  /** False means "wait for the host to let you in". */
  admitted: boolean
  session: TrainingSession
  hostName: string
}
