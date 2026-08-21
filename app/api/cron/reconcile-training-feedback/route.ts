import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { analyzeSessionPerformance } from '@/lib/openai'
import {
  analyzeRhythmSession,
  analyzeScaleSession,
  analyzeSongKeySession,
  saveTrainingFeedback,
  fetchLessonContext,
  type TrainingFeedbackType,
} from '@/lib/training-ai'

// ============================================================================
// Reconciliation cron: find training sessions with no AI feedback, generate it
// ============================================================================
// Every trainer generates feedback fire-and-forget so the UI stays responsive.
// On serverless that is inherently lossy - the function can freeze the instant
// the response is sent, and an OpenAI hiccup loses the coaching silently. The
// evidence: 15 pitch sessions in the database but only 6 feedback rows.
//
// This job closes that gap. It is the actual delivery guarantee: any session
// older than the grace period without a matching feedback row gets one. Adding
// a new trainer means adding one entry to TOOLS below.
// ============================================================================

/** Give the inline attempt time to finish before treating a session as missed. */
const GRACE_PERIOD_MINUTES = 10

/** Cap per run so a large backlog cannot blow the function timeout or the API budget. */
const MAX_PER_RUN = 12

interface ToolConfig {
  table: string
  feedbackType: TrainingFeedbackType
  /** Column holding the owning user id. Not consistent across these tables. */
  userColumn: string
  label: string
}

const TOOLS: ToolConfig[] = [
  { table: 'pitch_training_sessions', feedbackType: 'session', userColumn: 'user_id', label: 'Pitch' },
  { table: 'rhythm_training_sessions', feedbackType: 'rhythm_session', userColumn: 'user_id', label: 'Rhythm' },
  { table: 'scale_training_sessions', feedbackType: 'scale_session', userColumn: 'user_id', label: 'Scale' },
  { table: 'song_key_training_sessions', feedbackType: 'song_key_session', userColumn: 'user_id', label: 'SongKey' },
]

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdmin()
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MINUTES * 60 * 1000).toISOString()

    // One read of the feedback table covers every tool.
    const { data: existingFeedback } = await admin
      .from('pitch_training_ai_feedback')
      .select('feedback_type, reference_id')

    const covered = new Set(
      (existingFeedback || [])
        .filter(f => f.reference_id)
        .map(f => `${f.feedback_type}:${f.reference_id}`)
    )

    const results: Array<{ tool: string; sessionId: string; status: string; error?: string }> = []
    let budget = MAX_PER_RUN

    for (const tool of TOOLS) {
      if (budget <= 0) break

      const { data: sessions, error } = await admin
        .from(tool.table)
        .select('*')
        .lt('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        // A missing table or column should not take down the whole sweep.
        console.error(`[Reconcile] ${tool.label}: query failed - ${error.message}`)
        results.push({ tool: tool.label, sessionId: '-', status: 'query_failed', error: error.message })
        continue
      }

      const missing = (sessions || []).filter(s => !covered.has(`${tool.feedbackType}:${s.id}`))
      if (missing.length === 0) continue

      console.log(`[Reconcile] ${tool.label}: ${missing.length} session(s) missing feedback`)

      for (const session of missing) {
        if (budget <= 0) break
        budget--

        const userId = session[tool.userColumn]
        if (!userId) {
          results.push({ tool: tool.label, sessionId: session.id, status: 'no_user' })
          continue
        }

        try {
          const lessonNotes = await fetchLessonContext(admin, userId)
          let analysis

          switch (tool.feedbackType) {
            case 'session': {
              // Pitch needs its per-note breakdown to say anything useful.
              const { data: noteMetrics } = await admin
                .from('pitch_training_note_metrics')
                .select('note_name, octave, pitch_accuracy, pitch_onset_speed_ms, pitch_stability, in_tune_sustain_ms, avg_cents_deviation')
                .eq('session_id', session.id)

              analysis = await analyzeSessionPerformance(
                {
                  avgPitchAccuracy: Number(session.avg_pitch_accuracy) || 0,
                  avgPitchOnsetSpeedMs: Number(session.avg_pitch_onset_speed_ms) || 0,
                  avgPitchStability: Number(session.avg_pitch_stability) || 0,
                  avgInTuneSustainMs: Number(session.avg_in_tune_sustain_ms) || 0,
                  overallScore: Number(session.overall_score) || 0,
                  totalNotesAttempted: session.total_notes_attempted || 0,
                  totalNotesMatched: session.total_notes_matched || 0,
                  durationSeconds: session.duration_seconds || 0,
                },
                (noteMetrics || []).map(n => ({
                  noteName: n.note_name,
                  octave: n.octave,
                  pitchAccuracy: Number(n.pitch_accuracy) || 0,
                  pitchOnsetSpeedMs: Number(n.pitch_onset_speed_ms) || 0,
                  pitchStability: Number(n.pitch_stability) || 0,
                  inTuneSustainMs: Number(n.in_tune_sustain_ms) || 0,
                  avgCentsDeviation: Number(n.avg_cents_deviation) || 0,
                })),
                { lessonNotes }
              )
              break
            }

            case 'rhythm_session':
              analysis = await analyzeRhythmSession(
                {
                  bpm: session.bpm || 60,
                  timeSignature: session.time_signature || '4/4',
                  durationSeconds: session.duration_seconds || 0,
                  totalBeats: session.total_beats || 0,
                  onBeatCount: session.on_beat_count || 0,
                  earlyCount: session.early_count || 0,
                  lateCount: session.late_count || 0,
                  missedCount: session.missed_count || 0,
                  avgTimingOffsetMs: Number(session.avg_timing_offset_ms) || 0,
                  timingConsistency: Number(session.timing_consistency) || 0,
                  onBeatPercent: Number(session.on_beat_percent) || 0,
                  bestStreak: session.best_streak || 0,
                  overallScore: Number(session.overall_score) || 0,
                  rhythmTendency: session.rhythm_tendency,
                  avgEarlyMs: Number(session.avg_early_ms) || undefined,
                  avgLateMs: Number(session.avg_late_ms) || undefined,
                },
                { lessonNotes }
              )
              break

            case 'scale_session':
              analysis = await analyzeScaleSession(
                {
                  scaleType: session.scale_type,
                  rootNote: session.root_note,
                  direction: session.direction,
                  octave: session.octave,
                  tempoBpm: session.tempo_bpm,
                  durationSeconds: session.duration_seconds || 0,
                  sequenceAccuracy: Number(session.sequence_accuracy) || 0,
                  pitchAccuracy: Number(session.pitch_accuracy) || 0,
                  overallScore: Number(session.overall_score) || 0,
                  totalNotesExpected: session.total_notes_expected || 0,
                  totalNotesSung: session.total_notes_sung || 0,
                  notesInCorrectOrder: session.notes_in_correct_order || 0,
                },
                { lessonNotes }
              )
              break

            case 'song_key_session':
              analysis = await analyzeSongKeySession(
                {
                  songTitle: session.song_title,
                  songArtist: session.song_artist,
                  songKey: session.song_key,
                  songBpm: session.song_bpm,
                  durationSeconds: session.duration_seconds || 0,
                  totalNotes: session.total_notes || 0,
                  inKeyPercentage: Number(session.in_key_percentage) || 0,
                  avgCentsDeviation: Number(session.avg_cents_deviation) || 0,
                },
                { lessonNotes }
              )
              break

            default:
              continue
          }

          const saved = await saveTrainingFeedback(
            admin, userId, tool.feedbackType, session.id, analysis,
            { reconciled: true, sessionDate: session.session_date }
          )

          results.push({
            tool: tool.label,
            sessionId: session.id,
            status: saved ? 'generated' : 'already_existed',
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[Reconcile] ${tool.label} ${session.id} failed:`, message)
          results.push({ tool: tool.label, sessionId: session.id, status: 'failed', error: message })
        }
      }
    }

    const generated = results.filter(r => r.status === 'generated').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      message: results.length
        ? `Reconciled ${results.length} session(s): ${generated} generated, ${failed} failed`
        : 'All training sessions have AI feedback',
      generated,
      failed,
      budgetRemaining: budget,
      results,
    })
  } catch (err) {
    console.error('[Reconcile] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
