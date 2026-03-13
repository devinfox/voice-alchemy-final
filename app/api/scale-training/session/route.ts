import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface NoteMetric {
  noteName: string
  octave: number
  expectedPosition: number
  actualPosition: number | null
  targetFrequency: number
  pitchAccuracy: number
  centsDeviation: number
  targetAccuracy: number
  voiceStability: number
  timeToSingMs: number | null
  wasInOrder: boolean
  sampleCount: number
  avgDetectedFrequency: number
}

interface SessionPayload {
  startedAt: string
  endedAt: string
  scaleType: string
  rootNote: string
  octave: number
  direction: string
  tempo?: number // BPM
  totalNotesExpected: number
  totalNotesSung: number
  notesInCorrectOrder: number
  sequenceAccuracy: number
  pitchAccuracy: number
  overallScore: number
  noteMetrics: NoteMetric[]
}

// POST - Save a scale training session
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SessionPayload = await request.json()

    // Validate required fields
    if (!body.startedAt || !body.scaleType || !body.rootNote) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sessionDate = new Date(body.startedAt).toISOString().split('T')[0]
    const startedAt = new Date(body.startedAt)
    const endedAt = new Date(body.endedAt)
    const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)

    // Calculate timing consistency from note metrics
    const timings = body.noteMetrics
      .map(m => m.timeToSingMs)
      .filter((t): t is number => t !== null && t > 0)

    let timingConsistency = 100
    if (timings.length > 1) {
      const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length
      const variance = timings.reduce((s, t) => s + Math.pow(t - avgTiming, 2), 0) / timings.length
      const stdDev = Math.sqrt(variance)
      // Lower std dev = more consistent
      timingConsistency = Math.max(0, Math.min(100, 100 - (stdDev / avgTiming) * 50))
    }

    const tempoBpm = body.tempo || 80 // Default to 80 BPM

    // Check if there's already a session for today with this scale at this tempo
    const { data: existingSession } = await supabase
      .from('scale_training_sessions')
      .select('id, overall_score')
      .eq('user_id', user.id)
      .eq('session_date', sessionDate)
      .eq('scale_type', body.scaleType)
      .eq('root_note', body.rootNote)
      .eq('direction', body.direction)
      .eq('tempo_bpm', tempoBpm)
      .single()

    let sessionId: string
    let isNewBest = false

    if (existingSession) {
      // Check if new score is better
      if (body.overallScore > (existingSession.overall_score || 0)) {
        // Update existing session
        const { data: updatedSession, error: updateError } = await supabase
          .from('scale_training_sessions')
          .update({
            started_at: body.startedAt,
            ended_at: body.endedAt,
            duration_seconds: durationSeconds,
            sequence_accuracy: body.sequenceAccuracy,
            pitch_accuracy: body.pitchAccuracy,
            timing_consistency: timingConsistency,
            overall_score: body.overallScore,
            total_notes_expected: body.totalNotesExpected,
            total_notes_sung: body.totalNotesSung,
            notes_in_correct_order: body.notesInCorrectOrder,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSession.id)
          .select('id')
          .single()

        if (updateError) {
          console.error('Error updating session:', updateError)
          return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
        }

        sessionId = updatedSession.id
        isNewBest = true

        // Delete old note metrics
        await supabase
          .from('scale_training_note_metrics')
          .delete()
          .eq('session_id', sessionId)
      } else {
        // Score not better, don't save
        return NextResponse.json({
          saved: false,
          isNewBest: false,
          message: 'Existing session has a higher score',
          existingScore: existingSession.overall_score,
          newScore: body.overallScore,
        })
      }
    } else {
      // Create new session
      const { data: newSession, error: insertError } = await supabase
        .from('scale_training_sessions')
        .insert({
          user_id: user.id,
          session_date: sessionDate,
          started_at: body.startedAt,
          ended_at: body.endedAt,
          duration_seconds: durationSeconds,
          scale_type: body.scaleType,
          root_note: body.rootNote,
          octave: body.octave,
          direction: body.direction,
          tempo_bpm: tempoBpm,
          sequence_accuracy: body.sequenceAccuracy,
          pitch_accuracy: body.pitchAccuracy,
          timing_consistency: timingConsistency,
          overall_score: body.overallScore,
          total_notes_expected: body.totalNotesExpected,
          total_notes_sung: body.totalNotesSung,
          notes_in_correct_order: body.notesInCorrectOrder,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Error inserting session:', insertError)
        return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
      }

      sessionId = newSession.id
      isNewBest = true
    }

    // Save note metrics
    if (body.noteMetrics && body.noteMetrics.length > 0) {
      const noteMetricsToInsert = body.noteMetrics.map(metric => ({
        session_id: sessionId,
        user_id: user.id,
        note_name: metric.noteName,
        octave: metric.octave,
        expected_position: metric.expectedPosition,
        actual_position: metric.actualPosition,
        target_frequency: metric.targetFrequency,
        pitch_accuracy: metric.pitchAccuracy,
        cents_deviation: metric.centsDeviation,
        target_accuracy: metric.targetAccuracy,
        voice_stability: metric.voiceStability,
        time_to_sing_ms: metric.timeToSingMs,
        was_in_order: metric.wasInOrder,
        sample_count: metric.sampleCount,
        avg_detected_frequency: metric.avgDetectedFrequency,
      }))

      const { error: metricsError } = await supabase
        .from('scale_training_note_metrics')
        .insert(noteMetricsToInsert)

      if (metricsError) {
        console.error('Error inserting note metrics:', metricsError)
        // Don't fail the request, session was saved
      }
    }

    // Update weekly progress
    await updateWeeklyProgress(supabase, user.id)

    return NextResponse.json({
      sessionId,
      saved: true,
      isNewBest,
      overallScore: body.overallScore,
    })
  } catch (error) {
    console.error('Error in scale-training/session POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET - Retrieve scale training sessions
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

    let query = supabase
      .from('scale_training_sessions')
      .select(includeMetrics ? '*, scale_training_note_metrics(*)' : '*')
      .eq('user_id', user.id)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })

    const { data: sessions, error } = await query

    if (error) {
      console.error('Error fetching sessions:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Error in scale-training/session GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to update weekly progress
async function updateWeeklyProgress(supabase: any, userId: string) {
  try {
    // Get current week's start (Monday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - diff)
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    // Get this week's sessions
    const { data: sessions } = await supabase
      .from('scale_training_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('session_date', weekStartStr)

    if (!sessions || sessions.length === 0) return

    // Calculate aggregates
    const avgSequenceAccuracy = sessions.reduce((s: number, x: any) => s + (x.sequence_accuracy || 0), 0) / sessions.length
    const avgPitchAccuracy = sessions.reduce((s: number, x: any) => s + (x.pitch_accuracy || 0), 0) / sessions.length
    const avgTimingConsistency = sessions.reduce((s: number, x: any) => s + (x.timing_consistency || 0), 0) / sessions.length
    const avgOverallScore = sessions.reduce((s: number, x: any) => s + (x.overall_score || 0), 0) / sessions.length
    const totalNotes = sessions.reduce((s: number, x: any) => s + (x.total_notes_sung || 0), 0)
    const totalTime = sessions.reduce((s: number, x: any) => s + (x.duration_seconds || 0), 0)

    // Calculate tempo stats
    const tempos = sessions.map((s: any) => s.tempo_bpm || 80).filter((t: number) => t > 0)
    const avgTempo = tempos.length > 0 ? tempos.reduce((s: number, t: number) => s + t, 0) / tempos.length : 80
    const minTempo = tempos.length > 0 ? Math.min(...tempos) : 80
    const maxTempo = tempos.length > 0 ? Math.max(...tempos) : 80

    // Count unique scales practiced
    const uniqueScales = new Set(sessions.map((s: any) => `${s.scale_type}-${s.root_note}`))

    // Find most practiced scale
    const scaleCounts: Record<string, number> = {}
    const rootCounts: Record<string, number> = {}
    sessions.forEach((s: any) => {
      scaleCounts[s.scale_type] = (scaleCounts[s.scale_type] || 0) + 1
      rootCounts[s.root_note] = (rootCounts[s.root_note] || 0) + 1
    })
    const mostPracticedScale = Object.entries(scaleCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const mostPracticedRoot = Object.entries(rootCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

    // Get previous week for comparison
    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0]

    const { data: prevWeek } = await supabase
      .from('scale_training_weekly_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start_date', prevWeekStartStr)
      .single()

    // Calculate changes
    const sequenceChange = prevWeek?.avg_sequence_accuracy
      ? ((avgSequenceAccuracy - prevWeek.avg_sequence_accuracy) / prevWeek.avg_sequence_accuracy) * 100
      : null
    const pitchChange = prevWeek?.avg_pitch_accuracy
      ? ((avgPitchAccuracy - prevWeek.avg_pitch_accuracy) / prevWeek.avg_pitch_accuracy) * 100
      : null
    const overallChange = prevWeek?.avg_overall_score
      ? ((avgOverallScore - prevWeek.avg_overall_score) / prevWeek.avg_overall_score) * 100
      : null

    // Upsert weekly progress
    await supabase
      .from('scale_training_weekly_progress')
      .upsert({
        user_id: userId,
        week_start_date: weekStartStr,
        avg_sequence_accuracy: avgSequenceAccuracy,
        avg_pitch_accuracy: avgPitchAccuracy,
        avg_timing_consistency: avgTimingConsistency,
        avg_overall_score: avgOverallScore,
        avg_tempo_bpm: avgTempo,
        min_tempo_bpm: minTempo,
        max_tempo_bpm: maxTempo,
        total_sessions: sessions.length,
        total_scales_practiced: uniqueScales.size,
        total_notes_attempted: totalNotes,
        total_practice_time_seconds: totalTime,
        most_practiced_scale: mostPracticedScale,
        most_practiced_root: mostPracticedRoot,
        sequence_accuracy_change: sequenceChange,
        pitch_accuracy_change: pitchChange,
        overall_score_change: overallChange,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,week_start_date',
      })
  } catch (error) {
    console.error('Error updating weekly progress:', error)
  }
}
