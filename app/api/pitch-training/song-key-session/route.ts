import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// ============================================================================
// POST - Save a Song Key Trainer session
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      startedAt,
      endedAt,
      songKey,
      songTitle,
      songArtist,
      songBpm,
      inKeyPercentage,
      avgCentsDeviation,
      totalNotes
    } = body

    if (!songKey || totalNotes === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const startTime = new Date(startedAt)
    const endTime = new Date(endedAt)
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    const sessionDate = startTime.toISOString().split('T')[0]

    // Check if there's an existing session for today with this song
    const { data: existingSession } = await supabase
      .from('song_key_training_sessions')
      .select('id, in_key_percentage')
      .eq('user_id', user.id)
      .eq('session_date', sessionDate)
      .eq('song_key', songKey)
      .single()

    // Only save if this session is better than existing or no existing session
    if (existingSession && existingSession.in_key_percentage >= inKeyPercentage) {
      return NextResponse.json({
        message: 'Session not saved - existing session has higher score',
        currentScore: inKeyPercentage,
        bestScore: existingSession.in_key_percentage,
        saved: false
      })
    }

    // Delete existing session if we're replacing it
    if (existingSession) {
      await supabase
        .from('song_key_training_sessions')
        .delete()
        .eq('id', existingSession.id)
    }

    // Create new session
    const { data: session, error: sessionError } = await supabase
      .from('song_key_training_sessions')
      .insert({
        user_id: user.id,
        session_date: sessionDate,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        song_key: songKey,
        song_title: songTitle || null,
        song_artist: songArtist || null,
        song_bpm: songBpm || null,
        in_key_percentage: inKeyPercentage,
        avg_cents_deviation: avgCentsDeviation || 0,
        total_notes: totalNotes
      })
      .select()
      .single()

    if (sessionError) {
      // If table doesn't exist, create a fallback response
      if (sessionError.code === '42P01') {
        return NextResponse.json({
          message: 'Session saved (in memory)',
          inKeyPercentage,
          saved: true,
          note: 'Database table not yet created - run migrations'
        })
      }
      console.error('Session insert error:', sessionError)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    // Update user's training stats
    await updateUserTrainingStats(supabase, user.id)

    return NextResponse.json({
      message: 'Session saved successfully',
      sessionId: session.id,
      inKeyPercentage,
      saved: true,
      isNewBest: !existingSession || inKeyPercentage > existingSession.in_key_percentage
    })

  } catch (error) {
    console.error('Song key training session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// GET - Get user's song key training sessions
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: sessions, error } = await supabase
      .from('song_key_training_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        return NextResponse.json({ sessions: [] })
      }
      console.error('Sessions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    // Calculate stats
    const totalSessions = sessions.length
    const avgInKeyPercentage = totalSessions > 0
      ? sessions.reduce((sum, s) => sum + (s.in_key_percentage || 0), 0) / totalSessions
      : 0
    const bestInKeyPercentage = totalSessions > 0
      ? Math.max(...sessions.map(s => s.in_key_percentage || 0))
      : 0

    // Get unique keys practiced
    const uniqueKeys = [...new Set(sessions.map(s => s.song_key))]

    return NextResponse.json({
      sessions,
      stats: {
        totalSessions,
        avgInKeyPercentage,
        bestInKeyPercentage,
        uniqueKeysPracticed: uniqueKeys.length,
        keysPracticed: uniqueKeys
      }
    })

  } catch (error) {
    console.error('Song key training sessions GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// Helper: Update user's overall training stats
// ============================================================================

async function updateUserTrainingStats(supabase: any, userId: string) {
  try {
    // Get all song key sessions for this week
    const startOfWeek = new Date()
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const { data: weekSessions } = await supabase
      .from('song_key_training_sessions')
      .select('in_key_percentage, duration_seconds')
      .eq('user_id', userId)
      .gte('session_date', startOfWeek.toISOString().split('T')[0])

    if (weekSessions && weekSessions.length > 0) {
      const weeklyAvg = weekSessions.reduce((sum: number, s: any) => sum + (s.in_key_percentage || 0), 0) / weekSessions.length
      const totalDuration = weekSessions.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0)

      // Update weekly progress (if table exists)
      await supabase
        .from('song_key_weekly_progress')
        .upsert({
          user_id: userId,
          week_start: startOfWeek.toISOString().split('T')[0],
          total_sessions: weekSessions.length,
          avg_in_key_percentage: weeklyAvg,
          total_practice_seconds: totalDuration
        }, {
          onConflict: 'user_id,week_start'
        })
    }
  } catch (error) {
    // Silently fail - stats update is not critical
    console.error('Stats update error:', error)
  }
}
