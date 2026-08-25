import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import {
  getTrainingReadClient,
  isoDaysAgo,
  daysSince,
  calculateStreak,
  buildActivity14d,
  toolStatsFrom,
  engagementFrom,
  coachingSignal,
  type SessionRow,
} from '@/lib/training-stats'

interface RecentSession {
  tool: 'pitch' | 'rhythm' | 'scale'
  sessionDate: string
  createdAt: string | null
  score: number | null
  durationSeconds: number | null
  detail: string | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// GET /api/teachers/students/[bookingId]/training
// Full training detail for one student, for their teacher's student page.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isTeacher = profile.role === 'teacher' || profile.role === 'instructor'
    const isAdmin = profile.role === 'admin'
    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Only teachers can access this endpoint' }, { status: 403 })
    }

    // The booking both authorizes the request and identifies the student.
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id, status')
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (!isAdmin && booking.instructor_id !== profile.id) {
      return NextResponse.json({ error: 'Not your student' }, { status: 403 })
    }
    if (booking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Booking is not confirmed' }, { status: 403 })
    }

    const studentId = booking.student_id

    // Role + relationship verified above; use the service client so
    // RLS-policy gaps can't silently blank out the data.
    const db = await getTrainingReadClient(supabase)

    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const lastWeekStartStr = isoDaysAgo(now.getDay() + 7)
    const thirtyDaysAgoStr = isoDaysAgo(30)

    const [pitchResult, rhythmResult, scaleResult, lastWeekPitchResult, notesResult, notesCountResult] =
      await Promise.all([
        db
          .from('pitch_training_sessions')
          .select('session_date, overall_score, duration_seconds, created_at')
          .eq('user_id', studentId)
          .gte('session_date', thirtyDaysAgoStr)
          .order('created_at', { ascending: false }),
        db
          .from('rhythm_training_sessions')
          .select('session_date, on_beat_percent, duration_seconds, created_at')
          .eq('user_id', studentId)
          .gte('session_date', thirtyDaysAgoStr)
          .order('created_at', { ascending: false }),
        db
          .from('scale_training_sessions')
          .select('session_date, overall_score, duration_seconds, created_at, scale_type, root_note')
          .eq('user_id', studentId)
          .gte('session_date', thirtyDaysAgoStr)
          .order('created_at', { ascending: false }),
        db
          .from('pitch_training_sessions')
          .select('overall_score')
          .eq('user_id', studentId)
          .gte('session_date', lastWeekStartStr)
          .lt('session_date', weekStartStr),
        db
          .from('notes_archive')
          .select('id, content, content_html, class_ended_at, created_at')
          .eq('student_id', studentId)
          .order('class_ended_at', { ascending: false })
          .limit(1),
        db
          .from('notes_archive')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', studentId),
      ])

    const firstError =
      pitchResult.error || rhythmResult.error || scaleResult.error || lastWeekPitchResult.error
    if (firstError) {
      console.error('[Student Training API] Error fetching sessions:', firstError)
      return NextResponse.json({ error: 'Failed to fetch training data' }, { status: 500 })
    }

    const pitchRows: SessionRow[] = (pitchResult.data || []).map((r) => ({
      user_id: studentId,
      session_date: r.session_date,
      score: r.overall_score,
    }))
    const rhythmRows: SessionRow[] = (rhythmResult.data || []).map((r) => ({
      user_id: studentId,
      session_date: r.session_date,
      score: r.on_beat_percent,
    }))
    const scaleRows: SessionRow[] = (scaleResult.data || []).map((r) => ({
      user_id: studentId,
      session_date: r.session_date,
      score: r.overall_score,
    }))

    const pitchStats = toolStatsFrom(pitchRows, weekStartStr)
    const rhythmStats = toolStatsFrom(rhythmRows, weekStartStr)
    const scaleStats = toolStatsFrom(scaleRows, weekStartStr)

    const thisWeekScores = pitchRows
      .filter((r) => r.session_date >= weekStartStr)
      .map((r) => r.score)
      .filter((s): s is number => s !== null)
    const lastWeekScores = (lastWeekPitchResult.data || [])
      .map((r) => r.overall_score)
      .filter((s): s is number => s !== null && s !== undefined)
    let weeklyChange: number | null = null
    if (thisWeekScores.length > 0 && lastWeekScores.length > 0) {
      const thisAvg = thisWeekScores.reduce((a, b) => a + b, 0) / thisWeekScores.length
      const lastAvg = lastWeekScores.reduce((a, b) => a + b, 0) / lastWeekScores.length
      if (lastAvg > 0) weeklyChange = Math.round(((thisAvg - lastAvg) / lastAvg) * 1000) / 10
    }

    const recentSessions: RecentSession[] = [
      ...(pitchResult.data || []).map((r): RecentSession => ({
        tool: 'pitch',
        sessionDate: r.session_date,
        createdAt: r.created_at ?? null,
        score: r.overall_score,
        durationSeconds: r.duration_seconds ?? null,
        detail: null,
      })),
      ...(rhythmResult.data || []).map((r): RecentSession => ({
        tool: 'rhythm',
        sessionDate: r.session_date,
        createdAt: r.created_at ?? null,
        score: r.on_beat_percent,
        durationSeconds: r.duration_seconds ?? null,
        detail: null,
      })),
      ...(scaleResult.data || []).map((r): RecentSession => ({
        tool: 'scale',
        sessionDate: r.session_date,
        createdAt: r.created_at ?? null,
        score: r.overall_score,
        durationSeconds: r.duration_seconds ?? null,
        detail: [r.root_note, r.scale_type ? String(r.scale_type).replace(/_/g, ' ') : null]
          .filter(Boolean)
          .join(' '),
      })),
    ]
      .sort((a, b) => (b.createdAt || b.sessionDate).localeCompare(a.createdAt || a.sessionDate))
      .slice(0, 10)

    const allDates = [...pitchRows, ...rhythmRows, ...scaleRows].map((r) => r.session_date)
    const lastPracticedDate =
      [pitchStats.lastSessionDate, rhythmStats.lastSessionDate, scaleStats.lastSessionDate]
        .filter((d): d is string => d !== null)
        .sort()
        .reverse()[0] ?? null
    const sessionsThisWeek =
      pitchStats.sessionsThisWeek + rhythmStats.sessionsThisWeek + scaleStats.sessionsThisWeek
    const engagement = engagementFrom(sessionsThisWeek, lastPracticedDate)
    const gap = daysSince(lastPracticedDate)
    const currentStreak = calculateStreak(allDates)

    // Blended score: average of the per-tool averages that exist
    const toolAvgs = [pitchStats.avgScore, rhythmStats.avgScore, scaleStats.avgScore].filter(
      (s): s is number => s !== null
    )
    const blendedScore =
      toolAvgs.length > 0
        ? Math.round((toolAvgs.reduce((a, b) => a + b, 0) / toolAvgs.length) * 10) / 10
        : null

    const latestNoteRow = notesResult.data?.[0] ?? null
    const latestNote = latestNoteRow
      ? {
          endedAt: latestNoteRow.class_ended_at,
          excerpt: stripHtml(latestNoteRow.content_html || latestNoteRow.content || '').slice(0, 220),
        }
      : null

    return NextResponse.json({
      studentId,
      pitch: { ...pitchStats, weeklyChange },
      rhythm: rhythmStats,
      scale: scaleStats,
      lastPracticedDate,
      daysSincePractice: gap,
      currentStreak,
      sessionsThisWeek,
      blendedScore,
      activity14d: buildActivity14d(allDates),
      engagement,
      insight: coachingSignal({
        engagement,
        daysSincePractice: gap,
        currentStreak,
        sessionsThisWeek,
        pitchAvg: pitchStats.avgScore,
        pitchChange: weeklyChange,
        rhythmAvg: rhythmStats.avgScore,
        scaleAvg: scaleStats.avgScore,
      }),
      recentSessions,
      notes: {
        count: notesCountResult.count ?? 0,
        latest: latestNote,
      },
    })
  } catch (error) {
    console.error('[Student Training API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
