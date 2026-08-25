// Server-side helpers shared by the teacher-facing training stats endpoints.
// All computations run over real session rows from pitch/rhythm/scale
// training tables — no synthesized values.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ToolStats {
  sessionsThisWeek: number
  sessionsTotal: number
  avgScore: number | null
  bestScore: number | null
  lastSessionDate: string | null
}

export interface StudentTrainingSummary {
  studentId: string
  pitch: ToolStats & { weeklyChange: number | null }
  rhythm: ToolStats
  scale: ToolStats
  lastPracticedDate: string | null
  daysSincePractice: number | null
  currentStreak: number
  sessionsThisWeek: number
  /** Sessions per day for the last 14 days, oldest first. */
  activity14d: number[]
  engagement: 'high' | 'medium' | 'low' | 'inactive'
  insight: string | null
}

export interface SessionRow {
  user_id: string
  session_date: string
  score: number | null
}

/**
 * Service-role client for training reads. Callers MUST have verified the
 * requester's teacher/instructor/admin role (and, for per-student routes,
 * the booking relationship) before using it. Falls back to the provided
 * user-scoped client when no service key is configured — RLS then applies.
 */
export async function getTrainingReadClient(userClient: SupabaseClient): Promise<SupabaseClient> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (serviceRoleKey && supabaseUrl && serviceRoleKey.length > 10) {
    const { createClient } = await import('@supabase/supabase-js')
    return createClient(supabaseUrl, serviceRoleKey)
  }
  return userClient
}

export function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

/**
 * Parse a date-only string ('YYYY-MM-DD') in LOCAL time. `new Date(str)`
 * would parse it as UTC midnight, shifting the day for anyone west of UTC.
 */
export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = parseDateOnly(dateStr)
  return Math.max(0, Math.round((today.getTime() - then.getTime()) / 86400000))
}

/** Consecutive-day practice streak ending today or yesterday. */
export function calculateStreak(sessionDates: string[]): number {
  if (sessionDates.length === 0) return 0
  const uniqueSorted = [...new Set(sessionDates)].sort().reverse()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const first = parseDateOnly(uniqueSorted[0])

  const gapToFirst = Math.round((today.getTime() - first.getTime()) / 86400000)
  if (gapToFirst > 1) return 0

  let streak = 1
  for (let i = 1; i < uniqueSorted.length; i++) {
    const prev = parseDateOnly(uniqueSorted[i - 1])
    const cur = parseDateOnly(uniqueSorted[i])
    const gap = Math.round((prev.getTime() - cur.getTime()) / 86400000)
    if (gap === 1) streak++
    else break
  }
  return streak
}

/** Session counts per day over the last 14 days, oldest first. */
export function buildActivity14d(sessionDates: string[]): number[] {
  const counts = new Array(14).fill(0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const dateStr of sessionDates) {
    const d = parseDateOnly(dateStr)
    const idx = 13 - Math.round((today.getTime() - d.getTime()) / 86400000)
    if (idx >= 0 && idx < 14) counts[idx]++
  }
  return counts
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function toolStatsFrom(
  rows: SessionRow[],
  weekStartStr: string
): ToolStats {
  const scores = rows.map((r) => r.score).filter((s): s is number => s !== null && s !== undefined)
  return {
    sessionsThisWeek: rows.filter((r) => r.session_date >= weekStartStr).length,
    sessionsTotal: rows.length,
    avgScore: scores.length > 0 ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    bestScore: scores.length > 0 ? round1(Math.max(...scores)) : null,
    lastSessionDate: rows[0]?.session_date ?? null,
  }
}

export function engagementFrom(
  sessionsThisWeek: number,
  lastPracticedDate: string | null
): 'high' | 'medium' | 'low' | 'inactive' {
  const gap = daysSince(lastPracticedDate)
  if (sessionsThisWeek >= 5) return 'high'
  if (sessionsThisWeek >= 2) return 'medium'
  if (sessionsThisWeek >= 1 || (gap !== null && gap <= 30)) return 'low'
  return 'inactive'
}

/**
 * Rule-based coaching signal derived from the real numbers above.
 * Deliberately not labeled "AI" anywhere — it is arithmetic, not a model.
 */
export function coachingSignal(s: {
  engagement: string
  daysSincePractice: number | null
  currentStreak: number
  sessionsThisWeek: number
  pitchAvg: number | null
  pitchChange: number | null
  rhythmAvg: number | null
  scaleAvg: number | null
}): string | null {
  const { engagement, daysSincePractice, currentStreak, sessionsThisWeek, pitchAvg, pitchChange, rhythmAvg, scaleAvg } = s

  if (engagement === 'inactive') {
    return daysSincePractice === null
      ? 'No practice sessions logged yet.'
      : `No practice in ${daysSincePractice} days — a check-in might help.`
  }
  if (pitchChange !== null && pitchChange <= -10) {
    return `Pitch scores are down ${Math.abs(Math.round(pitchChange))}% vs last week — worth a look before the next lesson.`
  }
  if (pitchAvg !== null && scaleAvg !== null && pitchAvg - scaleAvg >= 15) {
    return `Pitch (${Math.round(pitchAvg)}%) is well ahead of scales (${Math.round(scaleAvg)}%) — a scale-focused warmup could balance things.`
  }
  if (pitchAvg !== null && rhythmAvg !== null && pitchAvg - rhythmAvg >= 15) {
    return `Pitch (${Math.round(pitchAvg)}%) is well ahead of rhythm (${Math.round(rhythmAvg)}%) — consider rhythm drills this week.`
  }
  if (currentStreak >= 5) {
    return `${currentStreak}-day practice streak going — momentum worth acknowledging in the next lesson.`
  }
  if (pitchChange !== null && pitchChange >= 10) {
    return `Pitch scores are up ${Math.round(pitchChange)}% vs last week.`
  }
  if (sessionsThisWeek === 0) {
    return 'No practice yet this week.'
  }
  return null
}
