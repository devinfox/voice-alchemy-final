import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { processRecording } from '@/lib/lesson-processing'

// POST /api/admin/process-all-recordings - Process all unprocessed recordings
export async function POST(request: NextRequest) {
  // SECURITY: Require admin authentication OR internal secret
  const internalSecret = request.headers.get('x-internal-secret')
  const cronSecret = process.env.CRON_SECRET

  // Check if request is from internal cron job
  const isInternalRequest = cronSecret && internalSecret === cronSecret

  if (!isInternalRequest) {
    // Must be authenticated admin user
    const profile = await getCurrentUser()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
  }

  let supabaseAdmin
  try {
    supabaseAdmin = createSupabaseAdmin()
  } catch {
    return NextResponse.json(
      { error: 'Missing Supabase admin credentials' },
      { status: 500 }
    )
  }

  // Optional: limit processing (default 10, max 50)
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50)
  const forceReprocess = url.searchParams.get('force') === 'true'

  try {
    // Find recordings that need processing
    let query = supabaseAdmin
      .from('lesson_recordings')
      .select('*')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (forceReprocess) {
      // Process all recordings, even completed ones
      query = query.or('ai_processing_status.eq.pending,ai_processing_status.eq.failed,ai_processing_status.eq.completed,ai_processing_status.is.null')
    } else {
      // Only process pending/failed/null
      query = query.or('ai_processing_status.eq.pending,ai_processing_status.eq.failed,ai_processing_status.is.null')
    }

    const { data: recordings, error: fetchError } = await query

    if (fetchError) {
      console.error('[ProcessAll] Error fetching recordings:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!recordings || recordings.length === 0) {
      return NextResponse.json({
        message: 'No recordings need processing',
        processed: 0,
        results: []
      })
    }

    console.log(`[ProcessAll] Found ${recordings.length} recordings to process`)

    const results: Array<{
      id: string
      status: 'success' | 'failed' | 'skipped'
      error?: string
      transcriptChars?: number
    }> = []

    for (const recording of recordings) {
      // Shared pipeline: same transcript floor, note lookup and per-student
      // continuity as the cron and the upload handler. force=true because this
      // endpoint exists specifically to reprocess.
      const result = await processRecording(supabaseAdmin, recording.id, { force: true })

      results.push(
        result.status === 'completed'
          ? { id: recording.id, status: 'success', transcriptChars: result.transcriptChars }
          : { id: recording.id, status: result.status, error: result.reason }
      )
    }

    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length
    const skippedCount = results.filter(r => r.status === 'skipped').length

    return NextResponse.json({
      message: `Processed ${recordings.length} recordings: ${successCount} succeeded, ${failedCount} failed, ${skippedCount} skipped`,
      processed: recordings.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results,
    })
  } catch (error) {
    console.error('[ProcessAll] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/admin/process-all-recordings - Get processing status
export async function GET() {
  // SECURITY: Require admin authentication
  const profile = await getCurrentUser()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let supabaseAdmin
  try {
    supabaseAdmin = createSupabaseAdmin()
  } catch {
    return NextResponse.json(
      { error: 'Missing Supabase admin credentials' },
      { status: 500 }
    )
  }

  try {
    // Get counts by status
    const { data: recordings, error } = await supabaseAdmin
      .from('lesson_recordings')
      .select('id, ai_processing_status, storage_path')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const withStorage = recordings?.filter(r => r.storage_path) || []
    const stats = {
      total: withStorage.length,
      pending: withStorage.filter(r => r.ai_processing_status === 'pending' || !r.ai_processing_status).length,
      processing: withStorage.filter(r => r.ai_processing_status === 'processing').length,
      completed: withStorage.filter(r => r.ai_processing_status === 'completed').length,
      failed: withStorage.filter(r => r.ai_processing_status === 'failed').length,
    }

    return NextResponse.json({
      message: 'Recording processing status',
      stats,
      needsProcessing: stats.pending + stats.failed,
    })

  } catch (error) {
    console.error('[ProcessAll] Error getting status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
