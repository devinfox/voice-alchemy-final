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
  // Singer-focused & acoustic telemetry
  targetAccuracy?: number
  voiceStability?: number
  maeCents?: number
  pitchBiasCents?: number
  pitchDirection?: 'sharp' | 'flat' | 'on-target'
  inTunePercent?: number
  inWindowPercent?: number
  avgSemitoneDeviation?: number
  mostSungNote?: string | null
  mostSungOctave?: number | null
  timeToFirstSound?: number
  sampleCount?: number
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
    // Singer-focused session aggregates
    let avgTargetAccuracy: number = 0
    let avgVoiceStability: number = 0
    let avgSemitoneDeviation: number = 0
    let pitchTendency: 'sharp' | 'flat' | 'on-target' = 'on-target'

    if (isSongKeySession) {
      totalNotes = songTotalNotes || 0
      matchedNotes = Math.round((totalNotes * (inKeyPercentage || 0)) / 100)
      avgPitchAccuracy = inKeyPercentage || 0
      avgPitchOnsetSpeedMs = 0
      avgPitchStability = Math.max(0, 100 - (songCentsDeviation || 0))
      avgInTuneSustainMs = 0
      overallScore = avgPitchAccuracy
    } else {
      if (!noteMetrics || noteMetrics.length === 0) {
        return NextResponse.json({ error: 'No note metrics provided' }, { status: 400 })
      }

      totalNotes = noteMetrics.length
      const hasNewMetrics = noteMetrics.some(n => n.targetAccuracy !== undefined)

      if (hasNewMetrics) {
        avgTargetAccuracy = noteMetrics.reduce((sum, n) => sum + (n.targetAccuracy ?? n.pitchAccuracy), 0) / totalNotes
        avgVoiceStability = noteMetrics.reduce((sum, n) => sum + (n.voiceStability ?? n.pitchStability), 0) / totalNotes
        avgSemitoneDeviation = noteMetrics.reduce((sum, n) => sum + (n.avgSemitoneDeviation ?? 0), 0) / totalNotes

        // Calculate pitch tendency
        const sharpCount = noteMetrics.filter(n => n.pitchDirection === 'sharp').length
        const flatCount = noteMetrics.filter(n => n.pitchDirection === 'flat').length
        if (sharpCount > flatCount && sharpCount > totalNotes * 0.3) {
          pitchTendency = 'sharp'
        } else if (flatCount > sharpCount && flatCount > totalNotes * 0.3) {
          pitchTendency = 'flat'
        } else {
          pitchTendency = 'on-target'
        }

        // Strict note match: Target Accuracy >= 70% AND mean error <= 25 cents
        matchedNotes = noteMetrics.filter(n => {
          const accuracy = n.targetAccuracy ?? n.pitchAccuracy
          const errorCents = n.maeCents !== undefined
            ? n.maeCents
            : n.avgSemitoneDeviation !== undefined
              ? Math.abs(n.avgSemitoneDeviation * 100)
              : Math.abs(n.avgCentsDeviation)
          return accuracy >= 70 && errorCents <= 25
        }).length

        avgPitchAccuracy = avgTargetAccuracy
        avgPitchOnsetSpeedMs = Math.round(noteMetrics.reduce((sum, n) => sum + n.pitchOnsetSpeedMs, 0) / totalNotes)
        avgPitchStability = avgVoiceStability
        avgInTuneSustainMs = Math.round(noteMetrics.reduce((sum, n) => sum + n.inTuneSustainMs, 0) / totalNotes)

        // Musical scoring: Target accuracy gates stability, onset speed, and sustain
        const targetGate = avgTargetAccuracy / 100
        overallScore = (
          avgTargetAccuracy * 0.50 +
          (avgVoiceStability * targetGate * 0.30) +
          (Math.min(100, Math.max(0, 100 - (avgPitchOnsetSpeedMs / 15))) * targetGate * 0.10) +
          (Math.min(100, (avgInTuneSustainMs / 40)) * targetGate * 0.10)
        )
      } else {
        matchedNotes = noteMetrics.filter(n => n.pitchAccuracy >= 70 && Math.abs(n.avgCentsDeviation) <= 25).length

        avgPitchAccuracy = noteMetrics.reduce((sum, n) => sum + n.pitchAccuracy, 0) / totalNotes
        avgPitchOnsetSpeedMs = Math.round(noteMetrics.reduce((sum, n) => sum + n.pitchOnsetSpeedMs, 0) / totalNotes)
        avgPitchStability = noteMetrics.reduce((sum, n) => sum + n.pitchStability, 0) / totalNotes
        avgInTuneSustainMs = Math.round(noteMetrics.reduce((sum, n) => sum + n.inTuneSustainMs, 0) / totalNotes)

        overallScore = (
          avgPitchAccuracy * 0.50 +
          avgPitchStability * 0.30 +
          Math.min(100, Math.max(0, 100 - (avgPitchOnsetSpeedMs / 15))) * 0.10 +
          Math.min(100, (avgInTuneSustainMs / 40)) * 0.10
        )
      }
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
      .maybeSingle()

    // If existing session scored higher, we still return progress status without throwing
    if (existingSession && existingSession.overall_score >= overallScore) {
      return NextResponse.json({
        message: 'Session recorded (daily best retained)',
        currentScore: overallScore,
        bestScore: existingSession.overall_score,
        saved: true,
        isNewBest: false
      })
    }

    // Delete existing session record for today if replacing with new daily high score
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
        total_notes_matched: matchedNotes,
        avg_target_accuracy: avgTargetAccuracy,
        avg_voice_stability: avgVoiceStability,
        avg_semitone_deviation: avgSemitoneDeviation,
        pitch_tendency: pitchTendency,
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
      pitch_accuracy: n.targetAccuracy ?? n.pitchAccuracy,
      pitch_onset_speed_ms: n.pitchOnsetSpeedMs,
      pitch_stability: n.voiceStability ?? n.pitchStability,
      in_tune_sustain_ms: n.inTuneSustainMs,
      avg_detected_frequency: n.avgDetectedFrequency,
      avg_cents_deviation: n.maeCents ?? n.avgCentsDeviation,
      max_cents_deviation: n.maxCentsDeviation,
      min_cents_deviation: n.minCentsDeviation,
      attempt_number: n.attemptNumber,
      target_accuracy: n.targetAccuracy ?? n.pitchAccuracy,
      voice_stability: n.voiceStability ?? n.pitchStability,
      avg_semitone_deviation: n.avgSemitoneDeviation ?? 0,
      most_sung_note: n.mostSungNote,
      most_sung_octave: n.mostSungOctave,
      pitch_direction: n.pitchDirection ?? 'on-target',
      time_to_first_sound: n.timeToFirstSound ?? 0,
      sample_count: n.sampleCount ?? 0,
    }))

    const { error: metricsError } = await supabase
      .from('pitch_training_note_metrics')
      .insert(noteMetricsToInsert)

    if (metricsError) {
      console.error('Metrics insert error:', metricsError)
    }

    // Generate AI feedback asynchronously with full acoustic facts
    generateAndSaveAIFeedback(user.id, session.id, {
      avgPitchAccuracy,
      avgPitchOnsetSpeedMs,
      avgPitchStability,
      avgInTuneSustainMs,
      overallScore,
      totalNotesAttempted: totalNotes,
      totalNotesMatched: matchedNotes,
      durationSeconds,
      avgTargetAccuracy,
      avgVoiceStability,
      pitchTendency,
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
    avgTargetAccuracy?: number
    avgVoiceStability?: number
    pitchTendency?: 'sharp' | 'flat' | 'on-target'
  },
  noteMetrics: NoteMetricInput[]
) {
  try {
    const supabase = await createClient()

    const { data: lessonNotes } = await supabase
      .from('notes_archive')
      .select('content')
      .or(`student_id.eq.${userId},instructor_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(5)

    const studentContext = {
      lessonNotes: lessonNotes?.map(n => n.content?.substring(0, 200)) || []
    }

    const analysis = await analyzeSessionPerformance(
      sessionMetrics,
      noteMetrics.map(n => ({
        noteName: n.noteName,
        octave: n.octave,
        targetAccuracy: n.targetAccuracy ?? n.pitchAccuracy,
        voiceStability: n.voiceStability ?? n.pitchStability,
        maeCents: n.maeCents,
        pitchBiasCents: n.pitchBiasCents,
        pitchDirection: n.pitchDirection,
        inTunePercent: n.inTunePercent,
        pitchOnsetSpeedMs: n.pitchOnsetSpeedMs,
        inTuneSustainMs: n.inTuneSustainMs,
        mostSungNote: n.mostSungNote,
        pitchAccuracy: n.pitchAccuracy,
        pitchStability: n.pitchStability,
        avgCentsDeviation: n.avgCentsDeviation
      })),
      studentContext
    )

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
