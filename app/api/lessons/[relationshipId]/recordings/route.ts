import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { transcribeAudio, generateLessonSummary } from '@/lib/openai'

function getSchemaHint(errorMessage?: string) {
  if (!errorMessage) return null
  if (
    errorMessage.includes('relation "lesson_recordings" does not exist') ||
    errorMessage.includes("Could not find the table 'public.lesson_recordings'")
  ) {
    return 'Database schema missing: run Supabase migration 00009_ai_lesson_summaries.sql'
  }
  return null
}

// POST /api/lessons/[relationshipId]/recordings - Upload a lesson recording
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

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('recording') as File
    const roomName = formData.get('roomName') as string
    const classStartedAt = formData.get('classStartedAt') as string

    if (!file) {
      return NextResponse.json(
        { error: 'Recording file is required' },
        { status: 400 }
      )
    }

    // Verify booking exists and user has access
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id')
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
        { error: 'Only the instructor can upload recordings' },
        { status: 403 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error: missing Supabase admin credentials' },
        { status: 500 }
      )
    }

    // Create admin client for storage and DB operations
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `lesson-${bookingId}-${timestamp}.webm`
    const storagePath = `${bookingId}/${filename}`

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase storage (lesson-recordings bucket)
    const { error: uploadError } = await supabaseAdmin.storage
      .from('lesson-recordings')
      .upload(storagePath, buffer, {
        contentType: 'video/webm',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading recording:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload recording', details: uploadError.message },
        { status: 500 }
      )
    }

    // Get signed URL (bucket is private)
    const { data: urlData } = await supabaseAdmin.storage
      .from('lesson-recordings')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7) // 7 days

    // Create recording record in lesson_recordings table
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
        file_size_bytes: file.size,
        format: 'webm',
        started_at: classStartedAt || new Date().toISOString(),
        ended_at: new Date().toISOString(),
        ai_processing_status: 'pending',
      })
      .select()
      .single()

    if (recordingError) {
      console.error('Error creating recording record:', recordingError)
      await supabaseAdmin.storage.from('lesson-recordings').remove([storagePath])
      return NextResponse.json(
        {
          error: 'Failed to create recording database entry',
          details: recordingError.message,
          hint: getSchemaHint(recordingError.message),
        },
        { status: 500 }
      )
    }

    // Best-effort: link this recording to the most recent unlinked archived note for this student.
    // This handles race conditions where class is ended before upload completes.
    try {
      const { data: unlinkedNotes } = await supabaseAdmin
        .from('notes_archive')
        .select('id, class_started_at, class_ended_at, recording_id')
        .eq('student_id', booking.student_id)
        .is('recording_id', null)
        .order('class_ended_at', { ascending: false })
        .limit(10)

      const recordingStartMs = new Date(classStartedAt || recording.started_at || new Date().toISOString()).getTime()

      const bestNote = (unlinkedNotes || [])
        .map((note) => {
          const noteStartMs = note.class_started_at ? new Date(note.class_started_at).getTime() : null
          const noteEndMs = note.class_ended_at ? new Date(note.class_ended_at).getTime() : null
          const deltaStart = noteStartMs ? Math.abs(noteStartMs - recordingStartMs) : Number.POSITIVE_INFINITY
          const deltaEnd = noteEndMs ? Math.abs(noteEndMs - recordingStartMs) : Number.POSITIVE_INFINITY
          return {
            id: note.id,
            deltaMs: Math.min(deltaStart, deltaEnd),
          }
        })
        .sort((a, b) => a.deltaMs - b.deltaMs)[0]

      // Only auto-link when times are reasonably close (3 hours).
      if (bestNote && bestNote.deltaMs <= 3 * 60 * 60 * 1000) {
        await supabaseAdmin
          .from('notes_archive')
          .update({ recording_id: recording.id })
          .eq('id', bestNote.id)
      }
    } catch (linkError) {
      console.warn('[Recording Upload] Failed to auto-link recording to notes_archive:', linkError)
    }

    // Process AI analysis directly (more reliable than fire-and-forget HTTP calls)
    // This runs in the background using setImmediate/setTimeout pattern
    const processAIAnalysis = async () => {
      try {
        console.log(`[Recording Upload] Starting AI processing for recording ${recording.id}`)

        // Update status to processing
        await supabaseAdmin
          .from('lesson_recordings')
          .update({ ai_processing_status: 'processing' })
          .eq('id', recording.id)

        // Download the recording
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from('lesson-recordings')
          .download(storagePath)

        if (downloadError || !fileData) {
          throw new Error(`Failed to download recording: ${downloadError?.message}`)
        }

        // Convert to buffer for transcription
        const recordingBuffer = Buffer.from(await fileData.arrayBuffer())
        console.log(`[Recording Upload] Downloaded ${recordingBuffer.length} bytes, starting transcription`)

        // Transcribe the audio
        const transcript = await transcribeAudio(recordingBuffer, `${recording.id}.webm`)
        console.log(`[Recording Upload] Transcription complete: ${transcript.text.length} chars`)

        // Get associated notes for context
        const { data: notesArchive } = await supabaseAdmin
          .from('notes_archive')
          .select('content_html, content')
          .eq('recording_id', recording.id)
          .maybeSingle()

        // Get previous lesson summaries for context
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

        // Generate AI summary
        console.log(`[Recording Upload] Generating AI summary`)
        const summary = await generateLessonSummary(
          transcript.text,
          notesArchive?.content || notesArchive?.content_html,
          previousSummaries
        )

        console.log(`[Recording Upload] Summary generated successfully`)

        // Update the recording with results
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

        // Also update the notes_archive if it exists
        if (notesArchive) {
          await supabaseAdmin
            .from('notes_archive')
            .update({ ai_summary: summary })
            .eq('recording_id', recording.id)
        }

        console.log(`[Recording Upload] AI processing completed for recording ${recording.id}`)
      } catch (processingError) {
        console.error('[Recording Upload] AI processing error:', processingError)

        // Update status to failed
        await supabaseAdmin
          .from('lesson_recordings')
          .update({
            ai_processing_status: 'failed',
            ai_processing_error: processingError instanceof Error ? processingError.message : 'Unknown error',
          })
          .eq('id', recording.id)
      }
    }

    // Run AI processing in background (non-blocking)
    // Use setTimeout to ensure the response is sent first
    setTimeout(() => {
      processAIAnalysis().catch(err => {
        console.error('[Recording Upload] Background AI processing failed:', err)
      })
    }, 100)

    console.log(`[Recording Upload] Success - lesson recording ${recording.id} uploaded for booking ${bookingId}`)
    return NextResponse.json({
      success: true,
      recording: {
        id: recording.id,
        url: urlData?.signedUrl,
        size: file.size,
        bookingId,
      },
    })
  } catch (error) {
    console.error('Error in POST /api/lessons/[relationshipId]/recordings:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// GET /api/lessons/[relationshipId]/recordings - Get recordings for a lesson
export async function GET(
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

    // Verify booking exists and user has access
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Check if user is participant
    const isParticipant = booking.student_id === user.id || booking.instructor_id === user.id

    // Also check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!isParticipant && profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Not authorized to view recordings' },
        { status: 403 }
      )
    }

    // Create admin client for signed URLs
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get recordings for this lesson from lesson_recordings table
    const { data: recordings, error: recordingsError } = await supabaseAdmin
      .from('lesson_recordings')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })

    if (recordingsError) {
      console.error('Error fetching recordings:', recordingsError)
      return NextResponse.json(
        { error: 'Failed to fetch recordings', details: recordingsError.message },
        { status: 500 }
      )
    }

    // Refresh signed URLs for all recordings
    const recordingsWithUrls = await Promise.all(
      (recordings || []).map(async (recording) => {
        if (recording.storage_path) {
          const { data: urlData } = await supabaseAdmin.storage
            .from('lesson-recordings')
            .createSignedUrl(recording.storage_path, 60 * 60) // 1 hour

          return {
            ...recording,
            storage_url: urlData?.signedUrl || recording.storage_url,
          }
        }
        return recording
      })
    )

    return NextResponse.json({
      recordings: recordingsWithUrls,
      bookingId,
    })
  } catch (error) {
    console.error('Error in GET /api/lessons/[relationshipId]/recordings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
