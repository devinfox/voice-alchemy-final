/**
 * Single code path for turning a lesson recording into a transcript and an AI
 * summary.
 *
 * This logic previously existed in four near-identical copies:
 *   app/api/lessons/[relationshipId]/recordings/complete/route.ts
 *   app/api/lessons/[relationshipId]/recordings/route.ts
 *   app/api/lessons/[relationshipId]/process-recording/route.ts
 *   app/api/cron/process-pending-recordings/route.ts
 *   app/api/admin/process-all-recordings/route.ts
 * They had drifted (different note lookups, different context depth, different
 * error handling), so a recording could be summarised differently depending on
 * which path happened to pick it up. Everything now calls processRecording().
 *
 * Two behaviours this adds over the originals:
 *
 *   1. A transcript sanity floor. Recordings whose audio is effectively silent
 *      were still being sent to the summariser, which dutifully produced
 *      confident lesson summaries from as little as 3 characters. Those are
 *      fabrications. Below MIN_USABLE_TRANSCRIPT_CHARS we now fail loudly with
 *      a diagnosable reason instead of writing fiction into the student record.
 *
 *   2. Real note context. The summariser prompt is built around the handwritten
 *      class notes, but the old lookup was `.eq('recording_id', id)` only,
 *      which never matched because the notes_archive FK pointed at the wrong
 *      table. We now look up by recording_id and fall back to booking_id, so
 *      context works even when linking has not happened yet.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { transcribeAudio, generateLessonSummary, type LessonSummary } from '@/lib/openai'

/**
 * Minimum transcript length we will summarise.
 *
 * Calibrated against the existing corpus: real lessons produce thousands of
 * characters, whereas the known-bad recordings produced 3, 12, 23 and 46. A
 * genuine but very short lesson clip will be rejected too, which is the correct
 * trade: a missing summary is recoverable, an invented one is not.
 */
export const MIN_USABLE_TRANSCRIPT_CHARS = 200

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

/**
 * Claim a recording for processing. Returns false when another worker already
 * has it, which is what stops the cron, the upload handler and the end-class
 * backup trigger from transcribing the same file three times.
 */
async function claimRecording(
  admin: SupabaseClient,
  recordingId: string,
  force: boolean
): Promise<boolean> {
  const query = admin
    .from('lesson_recordings')
    .update({ ai_processing_status: 'processing' })
    .eq('id', recordingId)
    .select('id')

  // Without force, only claim rows that are genuinely waiting. The .in() filter
  // is the atomic part: two concurrent callers cannot both match.
  const { data } = force
    ? await query.maybeSingle()
    : await query.in('ai_processing_status', ['pending', 'failed']).maybeSingle()

  return !!data
}

async function markFailed(admin: SupabaseClient, recordingId: string, reason: string) {
  await admin
    .from('lesson_recordings')
    .update({ ai_processing_status: 'failed', ai_processing_error: reason })
    .eq('id', recordingId)
}

/**
 * The handwritten notes for a recording.
 *
 * Prefers the linked note, falls back to the most recent archived note for the
 * same booking. The fallback matters: notes_archive.recording_id was unusable
 * until the FK was repointed, so linking may be absent for historical rows.
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
 * Prior lesson summaries for continuity, scoped to the STUDENT rather than the
 * booking.
 *
 * The original implementation filtered by booking_id, which meant a student who
 * moved between teachers, or whose relationship row was recreated, lost their
 * entire history and every lesson read as their first. Continuity should follow
 * the person.
 */
async function fetchPreviousSummaries(
  admin: SupabaseClient,
  studentId: string | null,
  excludeRecordingId: string,
  limit = 3
): Promise<string[]> {
  if (!studentId) return []

  const { data } = await admin
    .from('lesson_recordings')
    .select('id, ai_summary, created_at')
    .eq('student_id', studentId)
    .eq('ai_processing_status', 'completed')
    .neq('id', excludeRecordingId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || [])
    .map(r => (r.ai_summary as LessonSummary | null)?.summary)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
}

/**
 * Download, transcribe and summarise one recording. Idempotent and safe to call
 * concurrently from multiple triggers.
 */
export async function processRecording(
  admin: SupabaseClient,
  recordingId: string,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const { force = false } = options

  const { data: recording, error: fetchError } = await admin
    .from('lesson_recordings')
    .select('id, booking_id, student_id, storage_path, file_size_bytes, ai_processing_status')
    .eq('id', recordingId)
    .single()

  if (fetchError || !recording) {
    return { recordingId, status: 'failed', reason: 'Recording not found' }
  }

  if (recording.ai_processing_status === 'completed' && !force) {
    return { recordingId, status: 'skipped', reason: 'Already processed' }
  }

  if (!recording.storage_path) {
    await markFailed(admin, recordingId, 'No storage path on recording')
    return { recordingId, status: 'failed', reason: 'No storage path' }
  }

  if (recording.file_size_bytes && recording.file_size_bytes > MAX_TRANSCRIBABLE_BYTES) {
    const mb = (recording.file_size_bytes / 1024 / 1024).toFixed(1)
    const reason = `Recording is ${mb}MB, above Whisper's 25MB limit. Needs audio extraction or chunking before transcription.`
    await markFailed(admin, recordingId, reason)
    return { recordingId, status: 'failed', reason }
  }

  if (!(await claimRecording(admin, recordingId, force))) {
    return { recordingId, status: 'skipped', reason: 'Already claimed by another worker' }
  }

  try {
    const { data: file, error: downloadError } = await admin.storage
      .from('lesson-recordings')
      .download(recording.storage_path)

    if (downloadError || !file) {
      throw new Error(`Download failed: ${downloadError?.message ?? 'unknown error'}`)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    console.log(`[LessonProcessing] ${recordingId}: downloaded ${buffer.length} bytes`)

    const transcript = await transcribeAudio(buffer, `${recordingId}.webm`)
    const transcriptText = (transcript.text || '').trim()
    console.log(`[LessonProcessing] ${recordingId}: transcript ${transcriptText.length} chars`)

    // Sanity floor. Store the transcript we did get so the failure is
    // diagnosable, but refuse to summarise from it.
    if (transcriptText.length < MIN_USABLE_TRANSCRIPT_CHARS) {
      const reason =
        `Transcript too short to summarise (${transcriptText.length} chars, ` +
        `minimum ${MIN_USABLE_TRANSCRIPT_CHARS}). The recording's audio track is ` +
        `likely silent or missing - check microphone capture and that remote ` +
        `participant audio is mixed into the recorded stream.`

      await admin
        .from('lesson_recordings')
        .update({
          transcript: transcriptText || null,
          ai_processing_status: 'failed',
          ai_processing_error: reason,
        })
        .eq('id', recordingId)

      console.warn(`[LessonProcessing] ${recordingId}: ${reason}`)
      return { recordingId, status: 'failed', reason, transcriptChars: transcriptText.length }
    }

    const notes = await fetchNoteContext(admin, recordingId, recording.booking_id)
    const previousSummaries = await fetchPreviousSummaries(admin, recording.student_id, recordingId)

    console.log(
      `[LessonProcessing] ${recordingId}: notes ${notes.text ? notes.text.length + ' chars' : 'none'}, ` +
      `${previousSummaries.length} prior summaries for continuity`
    )

    const summary = await generateLessonSummary(transcriptText, notes.text ?? undefined, previousSummaries)

    await admin
      .from('lesson_recordings')
      .update({
        transcript: transcriptText,
        ai_summary: summary,
        ai_processing_status: 'completed',
        ai_processed_at: new Date().toISOString(),
        ai_processing_error: null,
      })
      .eq('id', recordingId)

    // Mirror onto the note, and repair the link while we are here.
    if (notes.noteId) {
      await admin
        .from('notes_archive')
        .update({ ai_summary: summary, recording_id: recordingId })
        .eq('id', notes.noteId)
    }

    console.log(`[LessonProcessing] ${recordingId}: completed`)
    return {
      recordingId,
      status: 'completed',
      transcriptChars: transcriptText.length,
      summary,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error'
    await markFailed(admin, recordingId, reason)
    console.error(`[LessonProcessing] ${recordingId}: failed -`, reason)
    return { recordingId, status: 'failed', reason }
  }
}
