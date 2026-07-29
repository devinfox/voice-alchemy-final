import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { processRecording } from '@/lib/lesson-processing'

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

    // Link recording to notes.
    //
    // This previously swallowed its error, which hid a constraint violation for
    // the entire life of the app: notes_archive.recording_id had a FK to
    // meeting_recordings, so writing a lesson_recordings id here always failed
    // and every note stayed unlinked. Errors are now logged explicitly so a
    // recurrence is visible instead of silent.
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
        const { error: linkUpdateError } = await supabaseAdmin
          .from('notes_archive')
          .update({ recording_id: recording.id })
          .eq('id', bookingNote.id)
          .is('recording_id', null)

        if (linkUpdateError) {
          console.error(
            `[Recording Complete] FAILED to link recording ${recording.id} to notes_archive ` +
            `${bookingNote.id}: ${linkUpdateError.code} ${linkUpdateError.message}. ` +
            `Lesson summaries will lose handwritten-note context until this is fixed.`
          )
        } else {
          console.log(`[Recording Complete] Linked recording ${recording.id} to notes_archive ${bookingNote.id}`)
        }
      } else {
        console.log(`[Recording Complete] No unlinked note found for booking ${bookingId}`)
      }
    } catch (linkError) {
      console.error('[Recording Complete] Failed to auto-link recording:', linkError)
    }

    // Kick off transcription + summarisation. Shared with the cron and the
    // manual reprocess endpoint via lib/lesson-processing, so all three apply
    // the same transcript sanity floor and the same note/context lookups.
    //
    // Fire-and-forget is best-effort only: serverless can freeze the moment the
    // response is returned. The cron at /api/cron/process-pending-recordings is
    // the actual guarantee, picking up anything still 'pending' after 5 minutes.
    void processRecording(supabaseAdmin, recording.id).catch(err =>
      console.error('[Recording Complete] Background processing failed:', err)
    )

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
