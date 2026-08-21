import { NextRequest, NextResponse } from 'next/server'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { processRecording } from '@/lib/lesson-processing'

// ============================================================================
// POST - Process a recording: transcribe and generate AI summary
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId } = await params
    const supabase = await createClient()
    const admin = createSupabaseAdmin()
    const internalSecret = request.headers.get('x-internal-secret')
    const isInternalCall = !!process.env.CRON_SECRET && internalSecret === process.env.CRON_SECRET
    const profile = await getCurrentUser()
    const dbClient = isInternalCall ? admin : supabase

    if (!isInternalCall && !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { recordingId, force } = body

    if (!recordingId) {
      return NextResponse.json({ error: 'recordingId is required' }, { status: 400 })
    }

    // Check booking access if not internal call
    if (!isInternalCall && profile) {
      const { data: booking } = await admin
        .from('bookings')
        .select('student_id, instructor_id')
        .eq('id', relationshipId)
        .maybeSingle()

      const isInstructor = booking && profile.id === booking.instructor_id
      const isStudent = booking && profile.id === booking.student_id
      const isAdmin = profile.role === 'admin'

      if (!isAdmin && !isInstructor && !isStudent) {
        return NextResponse.json({ error: 'Access denied to this lesson' }, { status: 403 })
      }

      if (force && !isAdmin && !isInstructor) {
        return NextResponse.json({ error: 'Only teachers and admins can rescan recordings' }, { status: 403 })
      }
    }

    // Get the recording details
    const { data: recording, error: recordingError } = await dbClient
      .from('lesson_recordings')
      .select('*')
      .eq('id', recordingId)
      .single()

    if (recordingError || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    if (recording.booking_id !== relationshipId) {
      return NextResponse.json({ error: 'Recording does not belong to this lesson' }, { status: 400 })
    }

    // Check if already processed (skip if force=true for rescanning)
    if (recording.ai_processing_status === 'completed' && !force) {
      return NextResponse.json({
        message: 'Recording already processed',
        transcript: recording.transcript,
        summary: recording.ai_summary,
      })
    }

    // All transcribe/summarise logic lives in lib/lesson-processing so this
    // endpoint, the cron and the upload handler cannot diverge. It claims the
    // row atomically and applies the transcript sanity floor.
    const result = await processRecording(admin, recordingId, { force: !!force })

    if (result.status === 'failed') {
      return NextResponse.json(
        { error: 'Processing failed', details: result.reason },
        { status: 500 }
      )
    }

    if (result.status === 'skipped') {
      const { data: existing } = await dbClient
        .from('lesson_recordings')
        .select('transcript, ai_summary')
        .eq('id', recordingId)
        .single()

      return NextResponse.json({
        message: result.reason ?? 'Recording already processed',
        transcript: existing?.transcript,
        summary: existing?.ai_summary,
      })
    }

    return NextResponse.json({
      success: true,
      transcriptChars: result.transcriptChars,
      summary: result.summary,
    })
  } catch (err) {
    console.error('[ProcessRecording] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET - Get processing status for a recording
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const recordingId = searchParams.get('recordingId')

    if (!recordingId) {
      return NextResponse.json({ error: 'recordingId is required' }, { status: 400 })
    }

    const { data: recording, error } = await supabase
      .from('lesson_recordings')
      .select('id, ai_processing_status, ai_processed_at, ai_summary, transcript, ai_processing_error')
      .eq('id', recordingId)
      .single()

    if (error || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: recording.ai_processing_status,
      processedAt: recording.ai_processed_at,
      summary: recording.ai_summary,
      transcript: recording.transcript,
      error: recording.ai_processing_error,
    })
  } catch (err) {
    console.error('[ProcessRecording] GET Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
