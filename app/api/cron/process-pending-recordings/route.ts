import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { processRecording } from '@/lib/lesson-processing'

// ============================================================================
// Cron job to process pending recordings that may have been missed
// Runs every 5 minutes via Vercel cron
//
// The transcribe/summarise logic lives in lib/lesson-processing so this job,
// the upload handler and the manual reprocess endpoint all behave identically.
// processRecording() claims each row atomically, so overlapping runs cannot
// double-transcribe the same file.
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sends this automatically)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

    const { data: pendingRecordings } = await admin
      .from('lesson_recordings')
      .select('id')
      .eq('ai_processing_status', 'pending')
      .lt('created_at', fiveMinutesAgo)
      .limit(5) // Process up to 5 at a time to avoid timeout

    const { data: stuckRecordings } = await admin
      .from('lesson_recordings')
      .select('id')
      .eq('ai_processing_status', 'processing')
      .lt('created_at', fifteenMinutesAgo)
      .limit(3)

    // Only retry failures that are worth retrying. A transcript-too-short or
    // over-size failure will fail identically every run, so retrying it just
    // burns Whisper spend on every cron tick.
    const { data: failedRecordings } = await admin
      .from('lesson_recordings')
      .select('id, ai_processing_error')
      .eq('ai_processing_status', 'failed')
      .lt('created_at', oneHourAgo)
      .limit(5)

    const retryableFailed = (failedRecordings || []).filter(r => {
      const err = r.ai_processing_error || ''
      return !err.includes('too short to summarise') && !err.includes('above Whisper')
    })

    const permanentlyFailed = (failedRecordings || []).length - retryableFailed.length

    const toProcess = [
      ...(pendingRecordings || []),
      ...(stuckRecordings || []),
      ...retryableFailed,
    ].slice(0, 8)

    if (toProcess.length === 0) {
      return NextResponse.json({
        message: 'No pending recordings to process',
        checked: {
          pending: pendingRecordings?.length || 0,
          stuck: stuckRecordings?.length || 0,
          failedRetryable: retryableFailed.length,
          failedPermanent: permanentlyFailed,
        },
      })
    }

    console.log(`[Cron] Processing ${toProcess.length} recordings`)

    const results = []
    for (const recording of toProcess) {
      // 'processing' rows here are stuck, not in flight, so force past the
      // claim check rather than skipping them forever.
      results.push(await processRecording(admin, recording.id, { force: true }))
    }

    return NextResponse.json({
      message: `Processed ${results.length} recordings`,
      skippedPermanentFailures: permanentlyFailed,
      results,
    })
  } catch (err) {
    console.error('[Cron] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
