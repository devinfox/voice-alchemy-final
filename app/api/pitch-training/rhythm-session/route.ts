import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// ============================================================================
// Types
// ============================================================================

interface RhythmSessionInput {
  startedAt: string
  endedAt: string
  bpm: number
  timeSignature: string
  durationSeconds: number
  totalBeats: number
  onBeatCount: number
  earlyCount: number
  lateCount: number
  missedCount: number
  avgTimingOffsetMs: number
  timingConsistency: number
  onBeatPercent: number
  bestStreak: number
  beatMetrics?: {
    beatNumber: number
    expectedTimeMs: number
    actualTimeMs: number | null
    timingOffsetMs: number | null
    timingResult: string
  }[]
}

// ============================================================================
// POST - Save a rhythm training session
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: RhythmSessionInput = await request.json()
    const {
      startedAt,
      endedAt,
      bpm,
      timeSignature,
      durationSeconds,
      totalBeats,
      onBeatCount,
      earlyCount,
      lateCount,
      missedCount,
      avgTimingOffsetMs,
      timingConsistency,
      onBeatPercent,
      bestStreak,
      beatMetrics,
    } = body

    if (totalBeats === 0) {
      return NextResponse.json({ error: 'No beats recorded' }, { status: 400 })
    }

    // Calculate overall score (weighted average)
    // Higher on-beat percentage = better
    // Higher consistency = better
    // Lower average offset = better
    const offsetScore = Math.max(0, 100 - Math.abs(avgTimingOffsetMs))
    const overallScore = (
      onBeatPercent * 0.5 +
      timingConsistency * 0.3 +
      offsetScore * 0.2
    )

    const startTime = new Date(startedAt)
    const sessionDate = startTime.toISOString().split('T')[0]

    // Create new session (allow multiple sessions per day for rhythm training)
    const { data: session, error: sessionError } = await supabase
      .from('rhythm_training_sessions')
      .insert({
        user_id: user.id,
        session_date: sessionDate,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        bpm,
        time_signature: timeSignature,
        total_beats: totalBeats,
        on_beat_count: onBeatCount,
        early_count: earlyCount,
        late_count: lateCount,
        missed_count: missedCount,
        avg_timing_offset_ms: avgTimingOffsetMs,
        timing_consistency: timingConsistency,
        on_beat_percent: onBeatPercent,
        best_streak: bestStreak,
        overall_score: overallScore,
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Rhythm session insert error:', sessionError)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    // Insert beat metrics if provided
    if (beatMetrics && beatMetrics.length > 0) {
      const beatMetricsToInsert = beatMetrics.map(b => ({
        session_id: session.id,
        user_id: user.id,
        beat_number: b.beatNumber,
        expected_time_ms: b.expectedTimeMs,
        actual_time_ms: b.actualTimeMs,
        timing_offset_ms: b.timingOffsetMs,
        timing_result: b.timingResult,
      }))

      const { error: metricsError } = await supabase
        .from('rhythm_training_beat_metrics')
        .insert(beatMetricsToInsert)

      if (metricsError) {
        console.error('Beat metrics insert error:', metricsError)
        // Don't fail the whole request, session is already saved
      }
    }

    return NextResponse.json({
      message: 'Session saved successfully',
      sessionId: session.id,
      overallScore,
      saved: true,
    })

  } catch (error) {
    console.error('Rhythm training session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// GET - Get user's rhythm training sessions
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
    const includeMetrics = searchParams.get('includeMetrics') === 'true'

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: sessions, error } = await supabase
      .from('rhythm_training_sessions')
      .select(includeMetrics
        ? '*, rhythm_training_beat_metrics(*)'
        : '*'
      )
      .eq('user_id', user.id)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })

    if (error) {
      console.error('Rhythm sessions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions })

  } catch (error) {
    console.error('Rhythm training sessions GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
