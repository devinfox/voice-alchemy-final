import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { transcribeAudio, generateLessonSummary, LessonSummary } from '@/lib/openai'

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
    const { data: { user } } = await supabase.auth.getUser()
    const dbClient = isInternalCall ? admin : supabase

    if (!isInternalCall && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { recordingId } = body

    if (!recordingId) {
      return NextResponse.json({ error: 'recordingId is required' }, { status: 400 })
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

    // Check if already processed
    if (recording.ai_processing_status === 'completed') {
      return NextResponse.json({
        message: 'Recording already processed',
        transcript: recording.transcript,
        summary: recording.ai_summary,
      })
    }

    // Update status to processing
    await dbClient
      .from('lesson_recordings')
      .update({ ai_processing_status: 'processing' })
      .eq('id', recordingId)

    console.log(`[ProcessRecording] Starting processing for recording ${recordingId}`)

    try {
      // Download the recording from storage
      const storagePath = recording.storage_path
      if (!storagePath) {
        throw new Error('No storage path for recording')
      }

      console.log(`[ProcessRecording] Downloading from ${storagePath}`)
      const { data: fileData, error: downloadError } = await admin.storage
        .from('lesson-recordings')
        .download(storagePath)

      if (downloadError || !fileData) {
        throw new Error(`Failed to download recording: ${downloadError?.message}`)
      }

      // Convert to buffer for transcription
      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      console.log(`[ProcessRecording] Downloaded ${buffer.length} bytes, starting transcription`)

      // Transcribe the audio
      const transcript = await transcribeAudio(buffer, `${recordingId}.webm`)
      console.log(`[ProcessRecording] Transcription complete: ${transcript.text.length} chars`)

      // Get the associated notes for context
      const { data: notesArchive } = await dbClient
        .from('notes_archive')
        .select('content_html, content')
        .eq('recording_id', recordingId)
        .single()

      // Get previous lesson summaries for context
      const { data: previousRecordings } = await dbClient
        .from('lesson_recordings')
        .select('ai_summary')
        .eq('booking_id', recording.booking_id)
        .eq('ai_processing_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(3)

      const previousSummaries = previousRecordings
        ?.map(r => (r.ai_summary as LessonSummary)?.summary)
        .filter(Boolean) as string[] | undefined

      // Generate AI summary
      console.log(`[ProcessRecording] Generating AI summary`)
      const summary = await generateLessonSummary(
        transcript.text,
        notesArchive?.content || notesArchive?.content_html,
        previousSummaries
      )

      console.log(`[ProcessRecording] Summary generated successfully`)

      // Update the recording with results
      const { error: updateError } = await dbClient
        .from('lesson_recordings')
        .update({
          transcript: transcript.text,
          ai_summary: summary,
          ai_processing_status: 'completed',
          ai_processed_at: new Date().toISOString(),
          ai_processing_error: null,
        })
        .eq('id', recordingId)

      if (updateError) {
        throw new Error(`Failed to update recording: ${updateError.message}`)
      }

      // Also update the notes_archive if it exists
      if (notesArchive) {
        await dbClient
          .from('notes_archive')
          .update({ ai_summary: summary })
          .eq('recording_id', recordingId)
      }

      return NextResponse.json({
        success: true,
        transcript: transcript.text,
        summary,
      })
    } catch (processingError) {
      console.error('[ProcessRecording] Processing error:', processingError)

      // Update status to failed
      await dbClient
        .from('lesson_recordings')
        .update({
          ai_processing_status: 'failed',
          ai_processing_error: processingError instanceof Error ? processingError.message : 'Unknown error',
        })
        .eq('id', recordingId)

      return NextResponse.json({
        error: 'Processing failed',
        details: processingError instanceof Error ? processingError.message : 'Unknown error',
      }, { status: 500 })
    }
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
