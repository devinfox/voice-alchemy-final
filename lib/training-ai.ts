/**
 * AI coaching for the practice tools.
 *
 * Before this module, only the Pitch trainer generated feedback. Rhythm, Scale,
 * Song Key and Song Pitch saved metrics to the database and nothing ever looked
 * at them, so a student could practise for months and receive no coaching from
 * any tool except Pitch Perfect.
 *
 * All feedback lands in pitch_training_ai_feedback, discriminated by
 * feedback_type. That table is misnamed for this purpose but already carries the
 * right shape (summary / strengths / areas_for_improvement / personalized_tips /
 * recommended_exercises / context_data) and is already read by the Training
 * Center, so reusing it avoids a migration and makes every tool's feedback show
 * up in the existing UI for free.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getOpenAIClient, type PitchAnalysisResult } from '@/lib/openai'

/** Discriminator values written to pitch_training_ai_feedback.feedback_type. */
export type TrainingFeedbackType =
  | 'session'            // pitch trainer, pre-existing
  | 'weekly'             // pitch trainer weekly rollup, pre-existing
  | 'comprehensive'      // cross-tool insight, pre-existing
  | 'notes_analysis'     // lesson-notes analysis, pre-existing
  | 'scale_session'
  | 'rhythm_session'
  | 'song_key_session'

export interface RhythmSessionMetrics {
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
  overallScore: number
  rhythmTendency?: string
  avgEarlyMs?: number
  avgLateMs?: number
}

export interface SongKeySessionMetrics {
  songTitle?: string | null
  songArtist?: string | null
  songKey: string
  songBpm?: number | null
  durationSeconds: number
  totalNotes: number
  inKeyPercentage: number
  avgCentsDeviation: number
}

export interface ScaleSessionMetrics {
  scaleType: string
  rootNote: string
  direction: string
  octave?: number
  tempoBpm?: number
  durationSeconds: number
  sequenceAccuracy: number
  pitchAccuracy: number
  overallScore: number
  totalNotesExpected: number
  totalNotesSung: number
  notesInCorrectOrder: number
}

/** Shared trailer instructing the model to return our standard JSON shape. */
const JSON_SHAPE_INSTRUCTION = `
Respond in this exact JSON format:
{
  "summary": "2-3 sentences on how this session went",
  "strengths": ["strength 1", "strength 2"],
  "areasForImprovement": ["area 1", "area 2"],
  "personalizedTips": ["tip 1", "tip 2", "tip 3"],
  "recommendedExercises": ["exercise 1", "exercise 2"]
}`

async function complete(systemPrompt: string, userPrompt: string, maxTokens = 900): Promise<PitchAnalysisResult> {
  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: maxTokens,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No response from OpenAI')
  return JSON.parse(content) as PitchAnalysisResult
}

// ---------------------------------------------------------------------------
// Rhythm
// ---------------------------------------------------------------------------

export async function analyzeRhythmSession(
  metrics: RhythmSessionMetrics,
  context?: { lessonNotes?: string[]; previousScores?: number[] }
): Promise<PitchAnalysisResult> {
  const systemPrompt = `You are an expert vocal coach specialising in rhythm and timing for singers.

You are analysing a metronome-based rhythm session. Interpret the numbers like a coach, not a statistician:
- On-beat percentage is the headline accuracy figure. 85%+ is good, 95%+ is excellent.
- Timing consistency measures steadiness. A singer can be consistently early and still be musical; a singer who is erratic is much harder to accompany.
- Rhythm tendency matters more than raw offset. Rushing ("early") and dragging ("late") have different causes and different fixes: rushing usually comes from tension or breath anxiety, dragging from late breath preparation or over-thinking.
- Missed beats indicate loss of pulse, which is more serious than being slightly off.
- Faster tempos naturally produce larger absolute offsets. Judge the offset relative to the beat length, not in absolute milliseconds.

Be encouraging and specific. Give exercises a singer can actually do with a metronome.`

  const beatLengthMs = 60000 / metrics.bpm
  const offsetAsPercentOfBeat = (Math.abs(metrics.avgTimingOffsetMs) / beatLengthMs) * 100

  const userPrompt = `Analyse this rhythm training session:

TEMPO: ${metrics.bpm} BPM (${metrics.timeSignature}), one beat = ${beatLengthMs.toFixed(0)}ms
DURATION: ${Math.round(metrics.durationSeconds / 60)} minutes

ACCURACY:
- Overall score: ${metrics.overallScore.toFixed(1)}%
- On-beat: ${metrics.onBeatPercent.toFixed(1)}% (${metrics.onBeatCount}/${metrics.totalBeats} beats)
- Early: ${metrics.earlyCount} | Late: ${metrics.lateCount} | Missed: ${metrics.missedCount}
- Best streak: ${metrics.bestStreak} consecutive beats

TIMING:
- Average offset: ${metrics.avgTimingOffsetMs.toFixed(0)}ms (${offsetAsPercentOfBeat.toFixed(1)}% of a beat)
- Timing consistency: ${metrics.timingConsistency.toFixed(1)}%
- Tendency: ${metrics.rhythmTendency ?? 'unknown'}
${metrics.avgEarlyMs ? `- When early, average ${metrics.avgEarlyMs.toFixed(0)}ms early` : ''}
${metrics.avgLateMs ? `- When late, average ${metrics.avgLateMs.toFixed(0)}ms late` : ''}

${context?.previousScores?.length ? `RECENT SCORES: ${context.previousScores.map(s => s.toFixed(0) + '%').join(', ')}` : ''}
${context?.lessonNotes?.length ? `FROM RECENT LESSONS: ${context.lessonNotes.slice(0, 3).join('; ')}` : ''}
${JSON_SHAPE_INSTRUCTION}`

  return complete(systemPrompt, userPrompt)
}

// ---------------------------------------------------------------------------
// Song Key
// ---------------------------------------------------------------------------

export async function analyzeSongKeySession(
  metrics: SongKeySessionMetrics,
  context?: { lessonNotes?: string[]; previousKeys?: string[] }
): Promise<PitchAnalysisResult> {
  const systemPrompt = `You are an expert vocal coach analysing how well a singer stayed in the key of a song.

Interpretation guidance:
- In-key percentage is how often the sung note belonged to the song's key. 80%+ is solid, 90%+ is strong.
- Average cents deviation shows tuning precision within those notes. Under 20 cents is good, under 10 is excellent.
- A singer can be in key but consistently flat, which points to breath support rather than ear training. A singer who is precisely in tune but frequently out of key has the opposite problem: good pitch control, weak harmonic awareness.
- Distinguish these two failure modes clearly, because the exercises differ. Out-of-key means ear and harmony work with a drone. Out-of-tune means support, onset and vowel work.

Be encouraging and specific to the song and key the singer chose.`

  const song = [metrics.songTitle, metrics.songArtist].filter(Boolean).join(' by ') || 'an untitled song'
  const outOfKeyNotes = Math.round(metrics.totalNotes * (1 - metrics.inKeyPercentage / 100))

  const userPrompt = `Analyse this song key training session:

SONG: ${song}
KEY: ${metrics.songKey}${metrics.songBpm ? ` at ${metrics.songBpm} BPM` : ''}
DURATION: ${Math.round(metrics.durationSeconds / 60)} minutes

RESULTS:
- In key: ${metrics.inKeyPercentage.toFixed(1)}% (${metrics.totalNotes - outOfKeyNotes}/${metrics.totalNotes} notes)
- Out of key: ${outOfKeyNotes} notes
- Average deviation: ${metrics.avgCentsDeviation.toFixed(1)} cents

${context?.previousKeys?.length ? `KEYS PRACTISED RECENTLY: ${context.previousKeys.join(', ')}` : ''}
${context?.lessonNotes?.length ? `FROM RECENT LESSONS: ${context.lessonNotes.slice(0, 3).join('; ')}` : ''}
${JSON_SHAPE_INSTRUCTION}`

  return complete(systemPrompt, userPrompt)
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

export async function analyzeScaleSession(
  metrics: ScaleSessionMetrics,
  context?: { lessonNotes?: string[] }
): Promise<PitchAnalysisResult> {
  const systemPrompt = `You are an expert vocal coach analysing a sung scale.

Two independent skills are being measured, and they must not be conflated:
- Sequence accuracy: did the singer sing the right notes in the right order? This is musical memory and harmonic knowledge.
- Pitch accuracy: were those notes in tune? This is ear and vocal control.

High sequence accuracy with low pitch accuracy means the singer knows the scale but cannot yet place it accurately. Low sequence accuracy with high pitch accuracy means good tuning but the scale shape is not internalised. Say which case this is and prescribe accordingly.

Ascending and descending have different difficulties: descending scales commonly go flat as support drops.`

  const userPrompt = `Analyse this scale training session:

SCALE: ${metrics.rootNote} ${metrics.scaleType}, ${metrics.direction}${metrics.octave ? `, octave ${metrics.octave}` : ''}
${metrics.tempoBpm ? `TEMPO: ${metrics.tempoBpm} BPM` : ''}
DURATION: ${Math.round(metrics.durationSeconds / 60)} minutes

RESULTS:
- Overall score: ${metrics.overallScore.toFixed(1)}%
- Sequence accuracy: ${metrics.sequenceAccuracy.toFixed(1)}% (${metrics.notesInCorrectOrder}/${metrics.totalNotesExpected} notes in the correct order)
- Pitch accuracy: ${metrics.pitchAccuracy.toFixed(1)}%
- Notes sung: ${metrics.totalNotesSung} of ${metrics.totalNotesExpected} expected

${context?.lessonNotes?.length ? `FROM RECENT LESSONS: ${context.lessonNotes.slice(0, 3).join('; ')}` : ''}
${JSON_SHAPE_INSTRUCTION}`

  return complete(systemPrompt, userPrompt)
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Write one feedback row. Safe to call repeatedly: checks for an existing row
 * for the same (type, reference) first, so the reconciliation cron cannot
 * create duplicates for a session the live route already handled.
 */
export async function saveTrainingFeedback(
  supabase: SupabaseClient,
  userId: string,
  feedbackType: TrainingFeedbackType,
  referenceId: string,
  analysis: PitchAnalysisResult,
  contextData?: unknown
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('pitch_training_ai_feedback')
    .select('id')
    .eq('user_id', userId)
    .eq('feedback_type', feedbackType)
    .eq('reference_id', referenceId)
    .maybeSingle()

  if (existing) return false

  const { error } = await supabase.from('pitch_training_ai_feedback').insert({
    user_id: userId,
    feedback_type: feedbackType,
    reference_id: referenceId,
    summary: analysis.summary,
    strengths: analysis.strengths,
    areas_for_improvement: analysis.areasForImprovement,
    personalized_tips: analysis.personalizedTips,
    recommended_exercises: analysis.recommendedExercises,
    context_data: contextData ?? null,
  })

  if (error) {
    console.error(`[TrainingAI] Failed to save ${feedbackType} feedback for ${referenceId}:`, error.message)
    return false
  }
  return true
}

/**
 * Recent lesson-note snippets for a student, used as coaching context so tool
 * feedback references what the teacher actually said in class.
 */
export async function fetchLessonContext(
  supabase: SupabaseClient,
  userId: string,
  limit = 3
): Promise<string[]> {
  const { data } = await supabase
    .from('notes_archive')
    .select('content')
    .eq('student_id', userId)
    .order('class_ended_at', { ascending: false })
    .limit(limit)

  return (data || [])
    .map(n => n.content?.trim())
    .filter((c): c is string => !!c && c.length > 0)
    .map(c => c.slice(0, 200))
}
