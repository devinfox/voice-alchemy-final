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

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdmin()

    // Find recordings that are:
    // 1. Status 'pending' and older than 5 minutes (fire-and-forget likely failed)
    // 2. Status 'processing' and older than 15 minutes (stuck)
    // 3. Status 'failed' and older than 1 hour (retry failed ones periodically)
    const now = new Date().toISOString()
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    // 1. Pending recordings older than 5 minutes
    const { data: pendingRecordings } = await admin
      .from('lesson_recordings')
      .select('id')
      .eq('ai_processing_status', 'pending')
      .lt('created_at', fiveMinutesAgo)
      .limit(5)

    // 2. Stuck processing recordings with expired 15-minute lease
    const { data: stuckRecordings } = await admin
      .from('lesson_recordings')
      .select('id')
      .eq('ai_processing_status', 'processing')
      .lt('ai_locked_at', fifteenMinutesAgo)
      .limit(3)

    // 3. Failed recordings whose scheduled retry backoff has elapsed (ai_next_retry_at <= now)
    const { data: retryableRecordings } = await admin
      .from('lesson_recordings')
      .select('id, ai_attempt_count')
      .eq('ai_processing_status', 'failed')
      .lte('ai_next_retry_at', now)
      .lt('ai_attempt_count', 5)
      .limit(5)

    const toProcess = [
      ...(pendingRecordings || []),
      ...(stuckRecordings || []),
      ...(retryableRecordings || []),
    ].slice(0, 8)

    if (toProcess.length === 0) {
      return NextResponse.json({
        message: 'No pending recordings to process',
        checked: {
          pending: pendingRecordings?.length || 0,
          stuck: stuckRecordings?.length || 0,
          retryable: retryableRecordings?.length || 0,
        },
      })
    }

    console.log(`[Cron] Processing ${toProcess.length} recordings`)

    const results = []
    for (const recording of toProcess) {
      results.push(await processRecording(admin, recording.id, { force: false }))
    }

    return NextResponse.json({
      message: `Processed ${results.length} recordings`,
      results,
    })
  } catch (err) {
    console.error('[Cron] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
