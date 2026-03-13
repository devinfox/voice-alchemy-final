import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { transcribeAudio, generateLessonSummary } from '@/lib/openai'

// POST /api/lessons/[relationshipId]/recordings/complete - Register a recording after direct upload
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { storagePath, fileSize, roomName, classStartedAt } = body

    if (!storagePath) {
      return NextResponse.json({ error: 'storagePath is required' }, { status: 400 })
    }

    // Verify booking exists and user has access
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id, status')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Check if user is the instructor (host)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()

    const isInstructor = booking.instructor_id === user.id || profile?.role === 'admin'
    if (!isInstructor) {
      return NextResponse.json(
        { error: 'Only the instructor can register recordings' },
        { status: 403 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Create admin client
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Verify the file exists in storage
    const { data: fileData, error: fileError } = await supabaseAdmin.storage
      .from('lesson-recordings')
      .list(bookingId, { search: storagePath.split('/').pop() })

    if (fileError || !fileData || fileData.length === 0) {
      return NextResponse.json(
        { error: 'Recording file not found in storage' },
        { status: 404 }
      )
    }

    // Get signed URL
    const { data: urlData } = await supabaseAdmin.storage
      .from('lesson-recordings')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7) // 7 days

    const timestamp = Date.now()

    // Create recording record
    const { data: recording, error: recordingError } = await supabaseAdmin
      .from('lesson_recordings')
      .insert({
        booking_id: bookingId,
        student_id: booking.student_id,
        recording_id: `lesson-${bookingId}-${timestamp}`,
        room_name: roomName || `lesson-${bookingId}`,
        status: 'ready',
        upload_status: 'completed',
        storage_provider: 'supabase',
        storage_path: storagePath,
        storage_url: urlData?.signedUrl,
        file_size_bytes: fileSize || fileData[0]?.metadata?.size,
        format: 'webm',
        started_at: classStartedAt || new Date().toISOString(),
        ended_at: new Date().toISOString(),
        ai_processing_status: 'pending',
      })
      .select()
      .single()

    if (recordingError) {
      console.error('Error creating recording record:', recordingError)
      return NextResponse.json(
        { error: 'Failed to create recording record', details: recordingError.message },
        { status: 500 }
      )
    }

    // Link recording to notes
    try {
      const { data: bookingNote } = await supabaseAdmin
        .from('notes_archive')
        .select('id')
        .eq('booking_id', bookingId)
        .is('recording_id', null)
        .order('class_ended_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (bookingNote) {
        await supabaseAdmin
          .from('notes_archive')
          .update({ recording_id: recording.id })
          .eq('id', bookingNote.id)
          .is('recording_id', null)
        console.log(`[Recording Complete] Linked recording ${recording.id} to notes_archive ${bookingNote.id}`)
      }
    } catch (linkError) {
      console.warn('[Recording Complete] Failed to auto-link recording:', linkError)
    }

    // Process AI analysis in background
    const processAIAnalysis = async () => {
      try {
        console.log(`[Recording Complete] Starting AI processing for recording ${recording.id}`)

        const { data: currentRecord } = await supabaseAdmin
          .from('lesson_recordings')
          .select('ai_processing_status')
          .eq('id', recording.id)
          .single()

        if (currentRecord?.ai_processing_status !== 'pending') {
          return
        }

        const { data: updatedRecord } = await supabaseAdmin
          .from('lesson_recordings')
          .update({ ai_processing_status: 'processing' })
          .eq('id', recording.id)
          .eq('ai_processing_status', 'pending')
          .select('id')
          .maybeSingle()

        if (!updatedRecord) return

        // Download the recording
        const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
          .from('lesson-recordings')
          .download(storagePath)

        if (downloadError || !downloadData) {
          throw new Error(`Failed to download: ${downloadError?.message}`)
        }

        const recordingBuffer = Buffer.from(await downloadData.arrayBuffer())
        console.log(`[Recording Complete] Downloaded ${recordingBuffer.length} bytes`)

        // Transcribe
        const transcript = await transcribeAudio(recordingBuffer, `${recording.id}.webm`)
        console.log(`[Recording Complete] Transcription complete: ${transcript.text.length} chars`)

        // Get notes for context
        const { data: notesArchive } = await supabaseAdmin
          .from('notes_archive')
          .select('content_html, content')
          .eq('recording_id', recording.id)
          .maybeSingle()

        // Get previous summaries
        const { data: previousRecordings } = await supabaseAdmin
          .from('lesson_recordings')
          .select('ai_summary')
          .eq('booking_id', bookingId)
          .eq('ai_processing_status', 'completed')
          .order('created_at', { ascending: false })
          .limit(3)

        const previousSummaries = previousRecordings
          ?.map(r => (r.ai_summary as { summary?: string })?.summary)
          .filter(Boolean) as string[] | undefined

        // Generate summary
        const summary = await generateLessonSummary(
          transcript.text,
          notesArchive?.content || notesArchive?.content_html,
          previousSummaries
        )

        // Update with results
        await supabaseAdmin
          .from('lesson_recordings')
          .update({
            transcript: transcript.text,
            ai_summary: summary,
            ai_processing_status: 'completed',
            ai_processed_at: new Date().toISOString(),
            ai_processing_error: null,
          })
          .eq('id', recording.id)

        if (notesArchive) {
          await supabaseAdmin
            .from('notes_archive')
            .update({ ai_summary: summary })
            .eq('recording_id', recording.id)
        }

        console.log(`[Recording Complete] AI processing completed for ${recording.id}`)
      } catch (processingError) {
        console.error('[Recording Complete] AI processing error:', processingError)
        await supabaseAdmin
          .from('lesson_recordings')
          .update({
            ai_processing_status: 'failed',
            ai_processing_error: processingError instanceof Error ? processingError.message : 'Unknown error',
          })
          .eq('id', recording.id)
      }
    }

    setTimeout(() => processAIAnalysis().catch(console.error), 100)

    console.log(`[Recording Complete] Success - recording ${recording.id} for booking ${bookingId}`)
    return NextResponse.json({
      success: true,
      recording: {
        id: recording.id,
        url: urlData?.signedUrl,
        bookingId,
      },
    })
  } catch (error) {
    console.error('Error in POST /api/lessons/[relationshipId]/recordings/complete:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
