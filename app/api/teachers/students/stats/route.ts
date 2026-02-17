import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// ============================================================================
// Types
// ============================================================================

interface StudentStats {
  studentId: string
  pitchTraining: {
    sessionsThisWeek: number
    sessionsTotal: number
    avgScore: number
    bestScore: number
    currentStreak: number
    lastSessionDate: string | null
    weeklyChange: number // percentage change from last week
  }
  rhythmTraining: {
    sessionsThisWeek: number
    sessionsTotal: number
    avgOnBeatPercent: number
    bestOnBeatPercent: number
    lastSessionDate: string | null
  }
  songTraining: {
    sessionsThisWeek: number
    sessionsTotal: number
    avgAccuracy: number
    uniqueSongs: number
    lastSessionDate: string | null
  }
  overallEngagement: 'high' | 'medium' | 'low' | 'inactive'
  aiInsight: string | null
}

// ============================================================================
// GET - Get training stats for all students of a teacher
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a teacher/instructor/admin
    const isTeacher = profile.role === 'teacher' || profile.role === 'instructor'
    const isAdmin = profile.role === 'admin'

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Only teachers can access this endpoint' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') // Optional: get stats for specific student

    // Get all confirmed bookings
    // Admins can see all students, teachers only see their own
    let bookingsQuery = supabase
      .from('bookings')
      .select('student_id')
      .eq('status', 'confirmed')

    // Non-admin teachers only see their own students
    if (!isAdmin) {
      bookingsQuery = bookingsQuery.eq('instructor_id', profile.id)
    }

    if (studentId) {
      bookingsQuery = bookingsQuery.eq('student_id', studentId)
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery

    if (bookingsError) {
      console.error('[Student Stats API] Error fetching bookings:', bookingsError)
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
    }

    const studentIds = [...new Set(bookings?.map(b => b.student_id).filter(Boolean) || [])]

    if (studentIds.length === 0) {
      return NextResponse.json({ stats: {} })
    }

    // Calculate date ranges
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // This week (Sunday to Saturday)
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    // Last week
    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0]
    const lastWeekEndStr = weekStartStr

    // 30 days ago for total stats
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

    // Fetch all training data in parallel
    const [
      pitchSessionsResult,
      rhythmSessionsResult,
      songSessionsResult,
      lastWeekPitchResult
    ] = await Promise.all([
      // Pitch training sessions (last 30 days)
      supabase
        .from('pitch_training_sessions')
        .select('user_id, session_date, overall_score, avg_pitch_accuracy')
        .in('user_id', studentIds)
        .gte('session_date', thirtyDaysAgoStr)
        .order('session_date', { ascending: false }),

      // Rhythm training sessions (last 30 days)
      supabase
        .from('rhythm_training_sessions')
        .select('user_id, session_date, on_beat_percent, timing_consistency')
        .in('user_id', studentIds)
        .gte('session_date', thirtyDaysAgoStr)
        .order('session_date', { ascending: false }),

      // Song pitch sessions (last 30 days)
      supabase
        .from('song_pitch_sessions')
        .select('user_id, session_date, accuracy_percent, song_title')
        .in('user_id', studentIds)
        .gte('session_date', thirtyDaysAgoStr)
        .order('session_date', { ascending: false }),

      // Last week's pitch sessions for comparison
      supabase
        .from('pitch_training_sessions')
        .select('user_id, overall_score')
        .in('user_id', studentIds)
        .gte('session_date', lastWeekStartStr)
        .lt('session_date', lastWeekEndStr)
    ])

    const pitchSessions = pitchSessionsResult.data || []
    const rhythmSessions = rhythmSessionsResult.data || []
    const songSessions = songSessionsResult.data || []
    const lastWeekPitchSessions = lastWeekPitchResult.data || []

    // Build stats for each student
    const stats: Record<string, StudentStats> = {}

    for (const studentId of studentIds) {
      // Filter sessions for this student
      const studentPitchSessions = pitchSessions.filter(s => s.user_id === studentId)
      const studentRhythmSessions = rhythmSessions.filter(s => s.user_id === studentId)
      const studentSongSessions = songSessions.filter(s => s.user_id === studentId)
      const studentLastWeekPitch = lastWeekPitchSessions.filter(s => s.user_id === studentId)

      // Pitch training stats
      const pitchThisWeek = studentPitchSessions.filter(s => s.session_date >= weekStartStr)
      const pitchScores = studentPitchSessions.map(s => s.overall_score)
      const lastWeekAvg = studentLastWeekPitch.length > 0
        ? studentLastWeekPitch.reduce((sum, s) => sum + s.overall_score, 0) / studentLastWeekPitch.length
        : 0
      const thisWeekAvg = pitchThisWeek.length > 0
        ? pitchThisWeek.reduce((sum, s) => sum + s.overall_score, 0) / pitchThisWeek.length
        : 0
      const weeklyChange = lastWeekAvg > 0 ? ((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100 : 0

      // Calculate streak
      const currentStreak = calculateStreak(studentPitchSessions.map(s => s.session_date))

      // Rhythm training stats
      const rhythmThisWeek = studentRhythmSessions.filter(s => s.session_date >= weekStartStr)
      const rhythmScores = studentRhythmSessions.map(s => s.on_beat_percent)

      // Song training stats
      const songThisWeek = studentSongSessions.filter(s => s.session_date >= weekStartStr)
      const songAccuracies = studentSongSessions.map(s => s.accuracy_percent || 0)
      const uniqueSongs = new Set(studentSongSessions.map(s => s.song_title)).size

      // Calculate overall engagement
      const totalSessionsThisWeek = pitchThisWeek.length + rhythmThisWeek.length + songThisWeek.length
      const lastPitchSession = studentPitchSessions[0]?.session_date || null
      const lastRhythmSession = studentRhythmSessions[0]?.session_date || null
      const lastSongSession = studentSongSessions[0]?.session_date || null

      const mostRecentSession = [lastPitchSession, lastRhythmSession, lastSongSession]
        .filter(Boolean)
        .sort()
        .reverse()[0] || null

      let engagement: 'high' | 'medium' | 'low' | 'inactive' = 'inactive'
      if (totalSessionsThisWeek >= 5) engagement = 'high'
      else if (totalSessionsThisWeek >= 2) engagement = 'medium'
      else if (totalSessionsThisWeek >= 1 || (mostRecentSession && mostRecentSession >= thirtyDaysAgoStr)) engagement = 'low'

      // Generate AI insight
      const aiInsight = generateQuickInsight({
        pitchThisWeek: pitchThisWeek.length,
        rhythmThisWeek: rhythmThisWeek.length,
        avgScore: pitchScores.length > 0 ? pitchScores.reduce((a, b) => a + b, 0) / pitchScores.length : 0,
        weeklyChange,
        currentStreak,
        engagement
      })

      stats[studentId] = {
        studentId,
        pitchTraining: {
          sessionsThisWeek: pitchThisWeek.length,
          sessionsTotal: studentPitchSessions.length,
          avgScore: pitchScores.length > 0 ? Math.round(pitchScores.reduce((a, b) => a + b, 0) / pitchScores.length * 10) / 10 : 0,
          bestScore: pitchScores.length > 0 ? Math.round(Math.max(...pitchScores) * 10) / 10 : 0,
          currentStreak,
          lastSessionDate: lastPitchSession,
          weeklyChange: Math.round(weeklyChange * 10) / 10
        },
        rhythmTraining: {
          sessionsThisWeek: rhythmThisWeek.length,
          sessionsTotal: studentRhythmSessions.length,
          avgOnBeatPercent: rhythmScores.length > 0 ? Math.round(rhythmScores.reduce((a, b) => a + b, 0) / rhythmScores.length * 10) / 10 : 0,
          bestOnBeatPercent: rhythmScores.length > 0 ? Math.round(Math.max(...rhythmScores) * 10) / 10 : 0,
          lastSessionDate: lastRhythmSession
        },
        songTraining: {
          sessionsThisWeek: songThisWeek.length,
          sessionsTotal: studentSongSessions.length,
          avgAccuracy: songAccuracies.length > 0 ? Math.round(songAccuracies.reduce((a, b) => a + b, 0) / songAccuracies.length * 10) / 10 : 0,
          uniqueSongs,
          lastSessionDate: lastSongSession
        },
        overallEngagement: engagement,
        aiInsight
      }
    }

    return NextResponse.json({ stats })

  } catch (error) {
    console.error('[Student Stats API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// Helper: Calculate practice streak
// ============================================================================

function calculateStreak(sessionDates: string[]): number {
  if (sessionDates.length === 0) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let streak = 0
  const sortedDates = [...new Set(sessionDates)].sort().reverse()

  for (let i = 0; i < sortedDates.length; i++) {
    const sessionDate = new Date(sortedDates[i])
    sessionDate.setHours(0, 0, 0, 0)

    const expectedDate = new Date(today)
    expectedDate.setDate(expectedDate.getDate() - i)

    // Allow for today or yesterday as the start
    if (i === 0) {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      if (sessionDate.getTime() === today.getTime() || sessionDate.getTime() === yesterday.getTime()) {
        streak++
        if (sessionDate.getTime() === yesterday.getTime()) {
          // Adjust expected date calculation if starting from yesterday
          expectedDate.setDate(expectedDate.getDate() - 1)
        }
      } else {
        break
      }
    } else if (sessionDate.getTime() === expectedDate.getTime()) {
      streak++
    } else {
      break
    }
  }

  return streak
}

// ============================================================================
// Helper: Generate quick AI insight
// ============================================================================

function generateQuickInsight(data: {
  pitchThisWeek: number
  rhythmThisWeek: number
  avgScore: number
  weeklyChange: number
  currentStreak: number
  engagement: string
}): string {
  const { pitchThisWeek, rhythmThisWeek, avgScore, weeklyChange, currentStreak, engagement } = data

  if (engagement === 'inactive') {
    return 'No recent practice activity. Consider reaching out to check in.'
  }

  if (engagement === 'high' && weeklyChange > 5) {
    return `Excellent progress! ${currentStreak > 3 ? `${currentStreak}-day streak.` : ''} Score up ${weeklyChange.toFixed(0)}% this week.`
  }

  if (engagement === 'high') {
    return `Practicing consistently (${pitchThisWeek + rhythmThisWeek} sessions this week). ${avgScore > 80 ? 'Strong scores.' : 'Working on fundamentals.'}`
  }

  if (weeklyChange < -10) {
    return `Scores down ${Math.abs(weeklyChange).toFixed(0)}% this week. May need extra attention.`
  }

  if (currentStreak >= 3) {
    return `${currentStreak}-day practice streak! Building good habits.`
  }

  if (pitchThisWeek === 0 && rhythmThisWeek === 0) {
    return 'No practice this week yet. A gentle reminder might help.'
  }

  if (avgScore >= 85) {
    return 'Strong performer. Ready for more advanced exercises.'
  }

  if (avgScore >= 70) {
    return 'Making steady progress. Keep encouraging consistent practice.'
  }

  return `${pitchThisWeek + rhythmThisWeek} session${pitchThisWeek + rhythmThisWeek !== 1 ? 's' : ''} this week. Avg score: ${avgScore.toFixed(0)}%.`
}
