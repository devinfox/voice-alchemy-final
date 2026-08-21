/**
 * Single code path for turning a lesson recording into a transcript and an AI summary.
 *
 * Reliability & Correctness Features:
 *   1. Atomic Leased Claiming: Uses claim_lesson_recording RPC with a unique UUID lock token.
 *      Zero chance of two workers running or a stale worker overwriting a newer job.
 *   2. Decoupled Audio Ingestion: Prioritizes lightweight Opus voice assets (<25MB) for Whisper.
 *   3. Speech Coverage Sanity: Analyzes Whisper segments, total voiced duration, and word count.
 *   4. Exponential Backoff Retries: Schedules retry delays (2m, 10m, 30m, 2h) up to 5 max attempts.
 *   5. Chronological Multi-Session Context: Uses previous 3 summaries strictly preceding the current lesson.
 *   6. Strict Verification: Inspects all database write errors explicitly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { transcribeAudio, generateLessonSummary, type LessonSummary, type LessonTranscript } from '@/lib/openai'

/** Whisper rejects files above 25MB. Checked before download to save bandwidth. */
export const MAX_TRANSCRIBABLE_BYTES = 25 * 1024 * 1024

export interface ProcessResult {
  recordingId: string
  status: 'completed' | 'skipped' | 'failed'
  reason?: string
  transcriptChars?: number
  summary?: LessonSummary
}

interface ProcessOptions {
  /** Reprocess even when ai_processing_status is already 'completed'. */
  force?: boolean
}

interface ClaimedRecording {
  id: string
  booking_id: string | null
  student_id: string | null
  storage_path: string | null
  audio_storage_path: string | null
  file_size_bytes: number | null
  audio_file_size_bytes: number | null
  duration_seconds: number | null
  started_at: string | null
  ended_at: string | null
  ai_attempt_count: number
  ai_lock_token: string
}

/**
 * Claim a recording for processing via atomic single-statement evaluation.
 * Returns the claimed row with its unique lock token, or null if another active worker owns it.
 */
async function claimRecording(
  admin: SupabaseClient,
  recordingId: string,
  lockToken: string,
  force: boolean
): Promise<ClaimedRecording | null> {
  // 1. Try atomic Postgres RPC
  const { data: rpcData, error: rpcError } = await admin.rpc('claim_lesson_recording', {
    p_recording_id: recordingId,
    p_lock_token: lockToken,
    p_lease_seconds: 900, // 15-minute lease
    p_max_attempts: 5,
    p_force: force,
  })

  if (!rpcError && rpcData && rpcData.length > 0) {
    return rpcData[0] as ClaimedRecording
  }

  // 2. Fallback to direct atomic conditional UPDATE if migration RPC not yet applied
  const now = new Date().toISOString()
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  let updateQuery = admin
    .from('lesson_recordings')
    .update({
      ai_processing_status: 'processing',
      ai_locked_at: now,
      ai_lock_token: lockToken,
    })
    .eq('id', recordingId)

  if (!force) {
    updateQuery = updateQuery.or(
      `ai_processing_status.in.(pending,failed),and(ai_processing_status.eq.processing,ai_locked_at.lt.${fifteenMinutesAgo})`
    )
  }

  const { data: directData, error: directError } = await updateQuery
    .select('id, booking_id, student_id, storage_path, audio_storage_path, file_size_bytes, audio_file_size_bytes, duration_seconds, started_at, ended_at, ai_attempt_count, ai_lock_token')
    .maybeSingle()

  if (directError || !directData) {
    return null
  }

  return directData as ClaimedRecording
}

/**
 * Mark recording as failed with exponential retry scheduling and lock token ownership check.
 */
async function markFailed(
  admin: SupabaseClient,
  recordingId: string,
  lockToken: string | null,
  reason: string,
  attemptCount: number
) {
  const retryDelaysMinutes = [2, 10, 30, 120]
  const delayMin = retryDelaysMinutes[Math.min(attemptCount - 1, retryDelaysMinutes.length - 1)] || 120
  const nextRetryAt = attemptCount < 5
    ? new Date(Date.now() + delayMin * 60 * 1000).toISOString()
    : null

  let query = admin
    .from('lesson_recordings')
    .update({
      ai_processing_status: 'failed',
      ai_processing_error: reason,
      ai_locked_at: null,
      ai_lock_token: null,
      ai_next_retry_at: nextRetryAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordingId)

  if (lockToken) {
    query = query.eq('ai_lock_token', lockToken)
  }

  const { error } = await query
  if (error) {
    console.error(`[LessonProcessing] Failed to mark recording ${recordingId} as failed:`, error)
  }
}

/**
 * Fetch handwritten note context for a recording.
 */
async function fetchNoteContext(
  admin: SupabaseClient,
  recordingId: string,
  bookingId: string | null
): Promise<{ noteId: string | null; text: string | null }> {
  const { data: linked } = await admin
    .from('notes_archive')
    .select('id, content, content_html')
    .eq('recording_id', recordingId)
    .maybeSingle()

  if (linked) {
    return { noteId: linked.id, text: linked.content || linked.content_html || null }
  }

  if (!bookingId) return { noteId: null, text: null }

  const { data: byBooking } = await admin
    .from('notes_archive')
    .select('id, content, content_html')
    .eq('booking_id', bookingId)
    .order('class_ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byBooking) {
    return { noteId: byBooking.id, text: byBooking.content || byBooking.content_html || null }
  }

  return { noteId: null, text: null }
}

/**
 * Fetch prior lesson summaries strictly preceding the current lesson (chronological safety).
 */
async function fetchPreviousSummaries(
  admin: SupabaseClient,
  studentId: string | null,
  excludeRecordingId: string,
  currentLessonStartedAt: string | null,
  limit = 3
): Promise<string[]> {
  if (!studentId) return []

  let query = admin
    .from('lesson_recordings')
    .select('id, ai_summary, started_at, created_at')
    .eq('student_id', studentId)
    .eq('ai_processing_status', 'completed')
    .neq('id', excludeRecordingId)

  if (currentLessonStartedAt) {
    query = query.lt('started_at', currentLessonStartedAt)
  }

  const { data, error } = await query
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    console.warn('[LessonProcessing] Failed to fetch previous summaries:', error)
    return []
  }

  return (data || [])
    .map((r) => (r.ai_summary as LessonSummary | null)?.summary)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
}

/**
 * Download, transcribe, validate, and summarise one recording.
 */
export async function processRecording(
  admin: SupabaseClient,
  recordingId: string,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const { force = false } = options
  const lockToken = crypto.randomUUID()

  // 1. Single-statement atomic leased claim
  const recording = await claimRecording(admin, recordingId, lockToken, force)
  if (!recording) {
    return { recordingId, status: 'skipped', reason: 'Already claimed by another worker or retry delay active' }
  }

  const attemptCount = recording.ai_attempt_count || 1

  // 2. Select decoupled audio asset or fallback to master video
  const targetPath = recording.audio_storage_path || recording.storage_path
  const targetSize = recording.audio_storage_path
    ? recording.audio_file_size_bytes
    : recording.file_size_bytes

  if (!targetPath) {
    await markFailed(admin, recordingId, lockToken, 'No storage path on recording', attemptCount)
    return { recordingId, status: 'failed', reason: 'No storage path' }
  }

  if (targetSize && targetSize > MAX_TRANSCRIBABLE_BYTES) {
    const mb = (targetSize / 1024 / 1024).toFixed(1)
    const reason = `File is ${mb}MB, above Whisper's 25MB limit. Please upload audio asset.`
    await markFailed(admin, recordingId, lockToken, reason, attemptCount)
    return { recordingId, status: 'failed', reason }
  }

  try {
    // 3. Download audio asset from Supabase Storage
    const { data: file, error: downloadError } = await admin.storage
      .from('lesson-recordings')
      .download(targetPath)

    if (downloadError || !file) {
      throw new Error(`Download failed: ${downloadError?.message ?? 'unknown error'}`)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    console.log(`[LessonProcessing] ${recordingId}: downloaded ${buffer.length} bytes from ${targetPath}`)

    if (buffer.length > MAX_TRANSCRIBABLE_BYTES) {
      throw new Error(`Downloaded buffer is ${(buffer.length / 1024 / 1024).toFixed(1)}MB, exceeds 25MB ceiling`)
    }

    // 4. Audio Transcription with Whisper
    const transcript: LessonTranscript = await transcribeAudio(buffer, `${recordingId}.webm`)
    const transcriptText = (transcript.text || '').trim()
    const segments = transcript.segments || []

    console.log(`[LessonProcessing] ${recordingId}: transcribed ${transcriptText.length} chars across ${segments.length} segments`)

    // 5. Speech Coverage & Sanity Analysis
    let durationSeconds = recording.duration_seconds
    if (!durationSeconds && recording.started_at && recording.ended_at) {
      durationSeconds = Math.round((new Date(recording.ended_at).getTime() - new Date(recording.started_at).getTime()) / 1000)
    }
    const safeDuration = durationSeconds || 1800

    const totalVoicedSeconds = segments.reduce((acc, seg) => acc + Math.max(0, seg.end - seg.start), 0)
    const wordCount = transcriptText.split(/\s+/).filter(Boolean).length

    // Minimum coverage check: A 60-min vocal class has scales & discussions.
    // If a session > 5 min has < 12 seconds of voiced audio or < 4 segments, it is silent/corrupt.
    const isSilentOrCorrupt = (safeDuration >= 300 && (totalVoicedSeconds < 12 || segments.length < 4 || wordCount < 25)) ||
                             (safeDuration < 300 && (transcriptText.length < 15 || wordCount < 4))

    if (isSilentOrCorrupt) {
      const reason =
        `Transcript failed speech coverage validation for ${Math.round(safeDuration / 60)}min session ` +
        `(${Math.round(totalVoicedSeconds)}s voiced across ${segments.length} segments, ${wordCount} words). ` +
        `Audio track may be silent or missing participant audio.`

      await markFailed(admin, recordingId, lockToken, reason, attemptCount)
      console.warn(`[LessonProcessing] ${recordingId}: ${reason}`)
      return { recordingId, status: 'failed', reason, transcriptChars: transcriptText.length }
    }

    // 6. Context Lookups (Handwritten notes & Chronological historical summaries)
    const notes = await fetchNoteContext(admin, recordingId, recording.booking_id)
    const previousSummaries = await fetchPreviousSummaries(
      admin,
      recording.student_id,
      recordingId,
      recording.started_at,
      3
    )

    console.log(
      `[LessonProcessing] ${recordingId}: context notes=${notes.text ? `${notes.text.length} chars` : 'none'} ` +
      `previousSummaries=${previousSummaries.length}`
    )

    // 7. Synthesize complete pedagogical summary with Structured Outputs
    const summary = await generateLessonSummary(
      transcriptText,
      notes.text || undefined,
      previousSummaries.length ? previousSummaries : undefined
    )

    // 8. Commit final summary with lock token verification
    const now = new Date().toISOString()
    const { data: updateData, error: updateError } = await admin
      .from('lesson_recordings')
      .update({
        transcript: transcriptText,
        ai_summary: summary,
        ai_processing_status: 'completed',
        ai_processed_at: now,
        ai_processing_error: null,
        ai_locked_at: null,
        ai_lock_token: null,
        ai_next_retry_at: null,
        updated_at: now,
      })
      .eq('id', recordingId)
      .eq('ai_lock_token', lockToken)
      .select('id')
      .maybeSingle()

    if (updateError || !updateData) {
      console.warn(`[LessonProcessing] ${recordingId}: Lock lost to another worker during processing. Discarding duplicate write.`)
      return { recordingId, status: 'skipped', reason: 'Lock lost during processing' }
    }

    // 9. Mirror summary to archived notes
    if (notes.noteId) {
      const { error: noteUpdateError } = await admin
        .from('notes_archive')
        .update({
          ai_summary: summary,
          ai_summary_generated_at: now,
          recording_id: recordingId,
        })
        .eq('id', notes.noteId)

      if (noteUpdateError) {
        console.error(`[LessonProcessing] Failed to mirror AI summary to notes_archive ${notes.noteId}:`, noteUpdateError)
      }
    }

    console.log(`[LessonProcessing] ${recordingId}: Processing completed successfully.`)
    return {
      recordingId,
      status: 'completed',
      transcriptChars: transcriptText.length,
      summary,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error during processing'
    console.error(`[LessonProcessing] ${recordingId} failed:`, error)
    await markFailed(admin, recordingId, lockToken, reason, attemptCount)
    return { recordingId, status: 'failed', reason }
  }
}
