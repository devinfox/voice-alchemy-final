import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { analyzeSessionPerformance } from '@/lib/openai'

// ============================================================================
// Types
// ============================================================================

interface NoteMetricInput {
  noteName: string
  octave: number
  targetFrequency: number
  pitchAccuracy: number
  pitchOnsetSpeedMs: number
  pitchStability: number
  inTuneSustainMs: number
  avgDetectedFrequency: number
  avgCentsDeviation: number
  maxCentsDeviation: number
  minCentsDeviation: number
  attemptNumber: number
}

interface SessionInput {
  startedAt: string
  endedAt: string
  noteMetrics: NoteMetricInput[]
  // Song Key Trainer fields
  songKey?: string
  songTitle?: string
  songArtist?: string
  songBpm?: number
  inKeyPercentage?: number
  avgCentsDeviation?: number
  totalNotes?: number
}

// ============================================================================
// POST - Save a pitch training session
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SessionInput = await request.json()
    const { startedAt, endedAt, noteMetrics, songKey, inKeyPercentage, avgCentsDeviation: songCentsDeviation, totalNotes: songTotalNotes } = body

    // Check if this is a Song Key Trainer session or Note-based session
    const isSongKeySession = !!songKey && songTotalNotes !== undefined

    let totalNotes: number
    let matchedNotes: number
    let avgPitchAccuracy: number
    let avgPitchOnsetSpeedMs: number
    let avgPitchStability: number
    let avgInTuneSustainMs: number
    let overallScore: number

    if (isSongKeySession) {
      // Song Key Trainer session
      totalNotes = songTotalNotes || 0
      matchedNotes = Math.round((totalNotes * (inKeyPercentage || 0)) / 100)
      avgPitchAccuracy = inKeyPercentage || 0
      avgPitchOnsetSpeedMs = 0
      avgPitchStability = Math.max(0, 100 - (songCentsDeviation || 0))
      avgInTuneSustainMs = 0
      overallScore = avgPitchAccuracy
    } else {
      // Note-based pitch training session
      if (!noteMetrics || noteMetrics.length === 0) {
        return NextResponse.json({ error: 'No note metrics provided' }, { status: 400 })
      }

      // Calculate session aggregates
      totalNotes = noteMetrics.length
      matchedNotes = noteMetrics.filter(n => n.pitchAccuracy >= 70).length

      avgPitchAccuracy = noteMetrics.reduce((sum, n) => sum + n.pitchAccuracy, 0) / totalNotes
      avgPitchOnsetSpeedMs = Math.round(noteMetrics.reduce((sum, n) => sum + n.pitchOnsetSpeedMs, 0) / totalNotes)
      avgPitchStability = noteMetrics.reduce((sum, n) => sum + n.pitchStability, 0) / totalNotes
      avgInTuneSustainMs = Math.round(noteMetrics.reduce((sum, n) => sum + n.inTuneSustainMs, 0) / totalNotes)

      // Calculate overall score (weighted average)
      overallScore = (
        avgPitchAccuracy * 0.35 +
        Math.min(100, Math.max(0, 100 - (avgPitchOnsetSpeedMs / 10))) * 0.2 +
        avgPitchStability * 0.25 +
        Math.min(100, (avgInTuneSustainMs / 50)) * 0.2
      )
    }

    const startTime = new Date(startedAt)
    const endTime = new Date(endedAt)
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    const sessionDate = startTime.toISOString().split('T')[0]

    // Check if there's an existing session for today
    const { data: existingSession } = await supabase
      .from('pitch_training_sessions')
      .select('id, overall_score')
      .eq('user_id', user.id)
      .eq('session_date', sessionDate)
      .single()

    // Only save if this session is better than existing or no existing session
    if (existingSession && existingSession.overall_score >= overallScore) {
      return NextResponse.json({
        message: 'Session not saved - existing session has higher score',
        currentScore: overallScore,
        bestScore: existingSession.overall_score,
        saved: false
      })
    }

    // Delete existing session if we're replacing it
    if (existingSession) {
      await supabase
        .from('pitch_training_sessions')
        .delete()
        .eq('id', existingSession.id)
    }

    // Create new session
    const { data: session, error: sessionError } = await supabase
      .from('pitch_training_sessions')
      .insert({
        user_id: user.id,
        session_date: sessionDate,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        avg_pitch_accuracy: avgPitchAccuracy,
        avg_pitch_onset_speed_ms: avgPitchOnsetSpeedMs,
        avg_pitch_stability: avgPitchStability,
        avg_in_tune_sustain_ms: avgInTuneSustainMs,
        overall_score: overallScore,
        total_notes_attempted: totalNotes,
        total_notes_matched: matchedNotes
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Session insert error:', sessionError)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    // Insert note metrics
    const noteMetricsToInsert = noteMetrics.map(n => ({
      session_id: session.id,
      user_id: user.id,
      note_name: n.noteName,
      octave: n.octave,
      target_frequency: n.targetFrequency,
      pitch_accuracy: n.pitchAccuracy,
      pitch_onset_speed_ms: n.pitchOnsetSpeedMs,
      pitch_stability: n.pitchStability,
      in_tune_sustain_ms: n.inTuneSustainMs,
      avg_detected_frequency: n.avgDetectedFrequency,
      avg_cents_deviation: n.avgCentsDeviation,
      max_cents_deviation: n.maxCentsDeviation,
      min_cents_deviation: n.minCentsDeviation,
      attempt_number: n.attemptNumber
    }))

    const { error: metricsError } = await supabase
      .from('pitch_training_note_metrics')
      .insert(noteMetricsToInsert)

    if (metricsError) {
      console.error('Metrics insert error:', metricsError)
      // Don't fail the whole request, session is already saved
    }

    // Generate AI feedback asynchronously (don't wait for it)
    generateAndSaveAIFeedback(user.id, session.id, {
      avgPitchAccuracy,
      avgPitchOnsetSpeedMs,
      avgPitchStability,
      avgInTuneSustainMs,
      overallScore,
      totalNotesAttempted: totalNotes,
      totalNotesMatched: matchedNotes,
      durationSeconds
    }, noteMetrics).catch(err => console.error('AI feedback generation failed:', err))

    return NextResponse.json({
      message: 'Session saved successfully',
      sessionId: session.id,
      overallScore,
      saved: true,
      isNewBest: !existingSession || overallScore > existingSession.overall_score
    })

  } catch (error) {
    console.error('Pitch training session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// GET - Get user's pitch training sessions
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

    const query = supabase
      .from('pitch_training_sessions')
      .select(includeMetrics
        ? '*, pitch_training_note_metrics(*)'
        : '*'
      )
      .eq('user_id', user.id)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })

    const { data: sessions, error } = await query

    if (error) {
      console.error('Sessions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions })

  } catch (error) {
    console.error('Pitch training sessions GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// Helper: Generate and save AI feedback
// ============================================================================

async function generateAndSaveAIFeedback(
  userId: string,
  sessionId: string,
  sessionMetrics: {
    avgPitchAccuracy: number
    avgPitchOnsetSpeedMs: number
    avgPitchStability: number
    avgInTuneSustainMs: number
    overallScore: number
    totalNotesAttempted: number
    totalNotesMatched: number
    durationSeconds: number
  },
  noteMetrics: NoteMetricInput[]
) {
  try {
    const supabase = await createClient()

    // Get student context (lesson notes, teacher feedback, etc.)
    const { data: lessonNotes } = await supabase
      .from('notes_archive')
      .select('content')
      .or(`student_id.eq.${userId},instructor_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(5)

    const studentContext = {
      lessonNotes: lessonNotes?.map(n => n.content?.substring(0, 200)) || []
    }

    // Generate AI analysis
    const analysis = await analyzeSessionPerformance(
      sessionMetrics,
      noteMetrics.map(n => ({
        noteName: n.noteName,
        octave: n.octave,
        pitchAccuracy: n.pitchAccuracy,
        pitchOnsetSpeedMs: n.pitchOnsetSpeedMs,
        pitchStability: n.pitchStability,
        inTuneSustainMs: n.inTuneSustainMs,
        avgCentsDeviation: n.avgCentsDeviation
      })),
      studentContext
    )

    // Save AI feedback
    await supabase
      .from('pitch_training_ai_feedback')
      .insert({
        user_id: userId,
        feedback_type: 'session',
        reference_id: sessionId,
        summary: analysis.summary,
        strengths: analysis.strengths,
        areas_for_improvement: analysis.areasForImprovement,
        personalized_tips: analysis.personalizedTips,
        recommended_exercises: analysis.recommendedExercises,
        context_data: { sessionMetrics, noteMetrics }
      })

  } catch (error) {
    console.error('AI feedback generation error:', error)
    throw error
  }
}
