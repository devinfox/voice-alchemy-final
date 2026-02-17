import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { transcribeAudio, generateLessonSummary, LessonSummary } from '@/lib/openai'

// ============================================================================
// Cron job to process pending recordings that may have been missed
// Runs every 5 minutes via Vercel cron
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sends this automatically)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdmin()

    // Find recordings that are:
    // 1. Status 'pending' and older than 5 minutes (fire-and-forget likely failed)
    // 2. Status 'processing' and older than 15 minutes (stuck)
    // 3. Status 'failed' and older than 1 hour (retry failed ones periodically)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    // Get pending recordings older than 5 minutes
    const { data: pendingRecordings } = await admin
      .from('lesson_recordings')
      .select('id, booking_id, storage_path, created_at')
      .eq('ai_processing_status', 'pending')
      .lt('created_at', fiveMinutesAgo)
      .limit(5) // Process up to 5 at a time to avoid timeout

    // Get stuck 'processing' recordings older than 15 minutes
    const { data: stuckRecordings } = await admin
      .from('lesson_recordings')
      .select('id, booking_id, storage_path, created_at')
      .eq('ai_processing_status', 'processing')
      .lt('created_at', fifteenMinutesAgo)
      .limit(3)

    // Get failed recordings older than 1 hour (for retry)
    const { data: failedRecordings } = await admin
      .from('lesson_recordings')
      .select('id, booking_id, storage_path, created_at, ai_processing_error')
      .eq('ai_processing_status', 'failed')
      .lt('created_at', oneHourAgo)
      .limit(2)

    const toProcess = [
      ...(pendingRecordings || []),
      ...(stuckRecordings || []),
      ...(failedRecordings || []),
    ]

    if (toProcess.length === 0) {
      return NextResponse.json({
        message: 'No pending recordings to process',
        checked: {
          pending: pendingRecordings?.length || 0,
          stuck: stuckRecordings?.length || 0,
          failed: failedRecordings?.length || 0,
        }
      })
    }

    console.log(`[Cron] Processing ${toProcess.length} recordings`)

    const results = []

    for (const recording of toProcess) {
      try {
        console.log(`[Cron] Processing recording ${recording.id}`)

        // Update status to processing
        await admin
          .from('lesson_recordings')
          .update({ ai_processing_status: 'processing' })
          .eq('id', recording.id)

        // Download the recording
        if (!recording.storage_path) {
          throw new Error('No storage path')
        }

        const { data: fileData, error: downloadError } = await admin.storage
          .from('lesson-recordings')
          .download(recording.storage_path)

        if (downloadError || !fileData) {
          throw new Error(`Download failed: ${downloadError?.message}`)
        }

        const buffer = Buffer.from(await fileData.arrayBuffer())
        console.log(`[Cron] Downloaded ${buffer.length} bytes for ${recording.id}`)

        // Transcribe
        const transcript = await transcribeAudio(buffer, `${recording.id}.webm`)
        console.log(`[Cron] Transcribed ${recording.id}: ${transcript.text.length} chars`)

        // Get context for summary
        const { data: notesArchive } = await admin
          .from('notes_archive')
          .select('content_html, content')
          .eq('recording_id', recording.id)
          .single()

        const { data: previousRecordings } = await admin
          .from('lesson_recordings')
          .select('ai_summary')
          .eq('booking_id', recording.booking_id)
          .eq('ai_processing_status', 'completed')
          .order('created_at', { ascending: false })
          .limit(3)

        const previousSummaries = previousRecordings
          ?.map(r => (r.ai_summary as LessonSummary)?.summary)
          .filter(Boolean) as string[] | undefined

        // Generate summary
        const summary = await generateLessonSummary(
          transcript.text,
          notesArchive?.content || notesArchive?.content_html,
          previousSummaries
        )

        // Update with results
        await admin
          .from('lesson_recordings')
          .update({
            transcript: transcript.text,
            ai_summary: summary,
            ai_processing_status: 'completed',
            ai_processed_at: new Date().toISOString(),
            ai_processing_error: null,
          })
          .eq('id', recording.id)

        // Update notes_archive if linked
        if (notesArchive) {
          await admin
            .from('notes_archive')
            .update({ ai_summary: summary })
            .eq('recording_id', recording.id)
        }

        console.log(`[Cron] Successfully processed ${recording.id}`)
        results.push({ id: recording.id, status: 'completed' })

      } catch (err) {
        console.error(`[Cron] Failed to process ${recording.id}:`, err)

        await admin
          .from('lesson_recordings')
          .update({
            ai_processing_status: 'failed',
            ai_processing_error: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', recording.id)

        results.push({
          id: recording.id,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      message: `Processed ${results.length} recordings`,
      results,
    })

  } catch (err) {
    console.error('[Cron] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
