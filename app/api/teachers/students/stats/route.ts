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
  type StudentTrainingSummary,
  type SessionRow,
} from '@/lib/training-stats'

// GET /api/teachers/students/stats
// Per-student training summaries for every student of the requesting
// teacher (all students for admins). All values are computed from real
// pitch/rhythm/scale training session rows.
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url)
    const onlyStudentId = searchParams.get('studentId')

    // Scope: teachers see students from their own confirmed bookings;
    // admins see all confirmed bookings' students.
    let bookingsQuery = supabase
      .from('bookings')
      .select('student_id')
      .eq('status', 'confirmed')
    if (!isAdmin) {
      bookingsQuery = bookingsQuery.eq('instructor_id', profile.id)
    }
    if (onlyStudentId) {
      bookingsQuery = bookingsQuery.eq('student_id', onlyStudentId)
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery
    if (bookingsError) {
      console.error('[Student Stats API] Error fetching bookings:', bookingsError)
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
    }

    const studentIds = [...new Set(bookings?.map((b) => b.student_id).filter(Boolean) || [])]
    if (studentIds.length === 0) {
      return NextResponse.json({ stats: {} })
    }

    // Role and relationship are verified above; training reads use the
    // service client so RLS-policy gaps can't silently blank out the data.
    const db = await getTrainingReadClient(supabase)

    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const lastWeekStartStr = isoDaysAgo(now.getDay() + 7)
    const thirtyDaysAgoStr = isoDaysAgo(30)

    const [pitchResult, rhythmResult, scaleResult, lastWeekPitchResult] = await Promise.all([
      db
        .from('pitch_training_sessions')
        .select('user_id, session_date, overall_score')
        .in('user_id', studentIds)
        .gte('session_date', thirtyDaysAgoStr)
        .order('session_date', { ascending: false }),
      db
        .from('rhythm_training_sessions')
        .select('user_id, session_date, on_beat_percent')
        .in('user_id', studentIds)
        .gte('session_date', thirtyDaysAgoStr)
        .order('session_date', { ascending: false }),
      db
        .from('scale_training_sessions')
        .select('user_id, session_date, overall_score')
        .in('user_id', studentIds)
        .gte('session_date', thirtyDaysAgoStr)
        .order('session_date', { ascending: false }),
      db
        .from('pitch_training_sessions')
        .select('user_id, overall_score')
        .in('user_id', studentIds)
        .gte('session_date', lastWeekStartStr)
        .lt('session_date', weekStartStr),
    ])

    const firstError =
      pitchResult.error || rhythmResult.error || scaleResult.error || lastWeekPitchResult.error
    if (firstError) {
      console.error('[Student Stats API] Error fetching training sessions:', firstError)
      return NextResponse.json({ error: 'Failed to fetch training data' }, { status: 500 })
    }

    const pitchRows: SessionRow[] = (pitchResult.data || []).map((r) => ({
      user_id: r.user_id,
      session_date: r.session_date,
      score: r.overall_score,
    }))
    const rhythmRows: SessionRow[] = (rhythmResult.data || []).map((r) => ({
      user_id: r.user_id,
      session_date: r.session_date,
      score: r.on_beat_percent,
    }))
    const scaleRows: SessionRow[] = (scaleResult.data || []).map((r) => ({
      user_id: r.user_id,
      session_date: r.session_date,
      score: r.overall_score,
    }))
    const lastWeekPitch = lastWeekPitchResult.data || []

    const stats: Record<string, StudentTrainingSummary> = {}

    for (const studentId of studentIds) {
      const pitch = pitchRows.filter((r) => r.user_id === studentId)
      const rhythm = rhythmRows.filter((r) => r.user_id === studentId)
      const scale = scaleRows.filter((r) => r.user_id === studentId)

      const pitchStats = toolStatsFrom(pitch, weekStartStr)
      const rhythmStats = toolStatsFrom(rhythm, weekStartStr)
      const scaleStats = toolStatsFrom(scale, weekStartStr)

      // Pitch weekly change: this week's avg vs last week's avg
      const thisWeekScores = pitch
        .filter((r) => r.session_date >= weekStartStr)
        .map((r) => r.score)
        .filter((s): s is number => s !== null)
      const lastWeekScores = lastWeekPitch
        .filter((r) => r.user_id === studentId)
        .map((r) => r.overall_score)
        .filter((s): s is number => s !== null && s !== undefined)
      let weeklyChange: number | null = null
      if (thisWeekScores.length > 0 && lastWeekScores.length > 0) {
        const thisAvg = thisWeekScores.reduce((a, b) => a + b, 0) / thisWeekScores.length
        const lastAvg = lastWeekScores.reduce((a, b) => a + b, 0) / lastWeekScores.length
        if (lastAvg > 0) weeklyChange = Math.round(((thisAvg - lastAvg) / lastAvg) * 1000) / 10
      }

      const allDates = [...pitch, ...rhythm, ...scale].map((r) => r.session_date)
      const lastPracticedDate =
        [pitchStats.lastSessionDate, rhythmStats.lastSessionDate, scaleStats.lastSessionDate]
          .filter((d): d is string => d !== null)
          .sort()
          .reverse()[0] ?? null

      const sessionsThisWeek =
        pitchStats.sessionsThisWeek + rhythmStats.sessionsThisWeek + scaleStats.sessionsThisWeek
      const engagement = engagementFrom(sessionsThisWeek, lastPracticedDate)
      const gap = daysSince(lastPracticedDate)

      stats[studentId] = {
        studentId,
        pitch: { ...pitchStats, weeklyChange },
        rhythm: rhythmStats,
        scale: scaleStats,
        lastPracticedDate,
        daysSincePractice: gap,
        currentStreak: calculateStreak(allDates),
        sessionsThisWeek,
        activity14d: buildActivity14d(allDates),
        engagement,
        insight: coachingSignal({
          engagement,
          daysSincePractice: gap,
          currentStreak: calculateStreak(allDates),
          sessionsThisWeek,
          pitchAvg: pitchStats.avgScore,
          pitchChange: weeklyChange,
          rhythmAvg: rhythmStats.avgScore,
          scaleAvg: scaleStats.avgScore,
        }),
      }
    }

    return NextResponse.json({ stats })
  } catch (error) {
    console.error('[Student Stats API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
