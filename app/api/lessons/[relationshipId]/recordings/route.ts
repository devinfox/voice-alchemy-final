import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { transcribeAudio, generateLessonSummary } from '@/lib/openai'
import {
  transcribeWithDiarization,
  formatDiarizedTranscript,
  isAssemblyAIAvailable,
  type DiarizedTranscript,
} from '@/lib/assemblyai'

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

    // FIX #3: Verify booking exists, is confirmed, and user has access
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id, status')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Only allow recording upload for confirmed bookings
    if (booking.status !== 'confirmed') {
      console.warn(`[Recording Upload] Rejected - booking ${bookingId} status is "${booking.status}", not "confirmed"`)
      return NextResponse.json(
        { error: 'Recording upload only allowed for confirmed bookings' },
        { status: 400 }
      )
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

    // FIX #2 & #5: Improved recording-notes linking with atomic update and tighter time window
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

      // FIX #5: Tightened from 3 hours to 1 hour for more precise matching
      const ONE_HOUR_MS = 60 * 60 * 1000
      if (bestNote && bestNote.deltaMs <= ONE_HOUR_MS) {
        // FIX #2: Atomic update - only update if recording_id is still NULL (prevents race condition)
        const { data: updatedNote, error: linkError } = await supabaseAdmin
          .from('notes_archive')
          .update({ recording_id: recording.id })
          .eq('id', bestNote.id)
          .is('recording_id', null)  // Only update if not already linked (atomic check)
          .select('id')
          .maybeSingle()

        if (updatedNote) {
          console.log(`[Recording Upload] ✅ Linked recording ${recording.id} to notes_archive ${bestNote.id} (delta: ${Math.round(bestNote.deltaMs / 1000)}s)`)
        } else if (linkError) {
          console.warn(`[Recording Upload] ⚠️ Failed to link recording:`, linkError.message)
        } else {
          console.log(`[Recording Upload] ℹ️ Note ${bestNote.id} was already linked by another process`)
        }
      } else if (bestNote) {
        console.log(`[Recording Upload] ℹ️ Closest note too far away (delta: ${Math.round(bestNote.deltaMs / 1000 / 60)} min, limit: 60 min)`)
      }
    } catch (linkError) {
      console.warn('[Recording Upload] Failed to auto-link recording to notes_archive:', linkError)
    }

    // Process AI analysis directly (more reliable than fire-and-forget HTTP calls)
    // This runs in the background using setImmediate/setTimeout pattern
    const processAIAnalysis = async () => {
      const startTime = Date.now()
      try {
        console.log(`\n${'='.repeat(60)}`)
        console.log(`[Recording AI] ▶️ STARTING AI PROCESSING`)
        console.log(`[Recording AI] Recording ID: ${recording.id}`)
        console.log(`[Recording AI] Booking ID: ${bookingId}`)
        console.log(`[Recording AI] Storage Path: ${storagePath}`)
        console.log(`${'='.repeat(60)}\n`)

        // FIX #1: Idempotency check - skip if already processing or completed
        const { data: currentRecord } = await supabaseAdmin
          .from('lesson_recordings')
          .select('ai_processing_status, ai_processed_at')
          .eq('id', recording.id)
          .single()

        if (currentRecord?.ai_processing_status === 'completed') {
          console.log(`[Recording AI] ⏭️ Skipping - already completed at ${currentRecord.ai_processed_at}`)
          return
        }

        if (currentRecord?.ai_processing_status === 'processing') {
          console.log(`[Recording AI] ⏭️ Skipping - already being processed by another worker`)
          return
        }

        // FIX #4: Check for and cleanup stuck recordings (processing > 10 minutes)
        const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        const { data: stuckRecordings } = await supabaseAdmin
          .from('lesson_recordings')
          .select('id')
          .eq('ai_processing_status', 'processing')
          .lt('updated_at', TEN_MINUTES_AGO)
          .limit(10)

        if (stuckRecordings && stuckRecordings.length > 0) {
          console.log(`[Recording AI] ⚠️ Found ${stuckRecordings.length} stuck recording(s) - marking as failed`)
          await supabaseAdmin
            .from('lesson_recordings')
            .update({
              ai_processing_status: 'failed',
              ai_processing_error: 'Processing timeout after 10 minutes',
            })
            .in('id', stuckRecordings.map(r => r.id))
        }

        // Update status to processing (with atomic check to prevent race condition)
        const { data: updatedRecord, error: updateStatusError } = await supabaseAdmin
          .from('lesson_recordings')
          .update({ ai_processing_status: 'processing' })
          .eq('id', recording.id)
          .eq('ai_processing_status', 'pending')  // Only update if still pending
          .select('id')
          .maybeSingle()

        if (!updatedRecord) {
          console.log(`[Recording AI] ⏭️ Skipping - status was changed by another process`)
          return
        }
        console.log(`[Recording AI] ✅ Status updated to 'processing' in DB`)

        // Download the recording
        console.log(`[Recording AI] 📥 Downloading recording from Supabase Storage...`)
        const downloadStart = Date.now()
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from('lesson-recordings')
          .download(storagePath)

        if (downloadError || !fileData) {
          throw new Error(`Failed to download recording: ${downloadError?.message}`)
        }

        // Convert to buffer for transcription
        const recordingBuffer = Buffer.from(await fileData.arrayBuffer())
        console.log(`[Recording AI] ✅ Download complete in ${Date.now() - downloadStart}ms`)
        console.log(`[Recording AI] 📊 File size: ${(recordingBuffer.length / 1024 / 1024).toFixed(2)} MB`)

        // Transcribe the audio - prefer AssemblyAI for diarization, fallback to Whisper
        let transcriptText: string
        let diarizedTranscript: DiarizedTranscript | null = null

        console.log(`\n[Recording AI] 🎤 TRANSCRIPTION PHASE`)
        console.log(`[Recording AI] AssemblyAI available: ${isAssemblyAIAvailable()}`)

        if (isAssemblyAIAvailable()) {
          console.log(`[Recording AI] 🔊 Using AssemblyAI for speaker diarization...`)
          const transcribeStart = Date.now()
          try {
            diarizedTranscript = await transcribeWithDiarization(recordingBuffer)
            transcriptText = diarizedTranscript.text
            console.log(`[Recording AI] ✅ AssemblyAI transcription complete in ${Date.now() - transcribeStart}ms`)
            console.log(`[Recording AI] 📝 Transcript length: ${transcriptText.length} chars`)
            console.log(`[Recording AI] 👥 Speakers detected: ${diarizedTranscript.utterances.length} utterances`)
            console.log(`[Recording AI] 🎓 Teacher words: ${diarizedTranscript.speakerWordCounts.teacher}`)
            console.log(`[Recording AI] 🧑‍🎓 Student words: ${diarizedTranscript.speakerWordCounts.student}`)

            // Log first few utterances as sample
            console.log(`[Recording AI] 📜 Sample utterances:`)
            diarizedTranscript.utterances.slice(0, 3).forEach((u, i) => {
              console.log(`   ${i + 1}. [${u.speaker}]: "${u.text.slice(0, 100)}${u.text.length > 100 ? '...' : ''}"`)
            })
          } catch (assemblyError) {
            console.warn(`[Recording AI] ⚠️ AssemblyAI failed after ${Date.now() - transcribeStart}ms:`, assemblyError)
            console.log(`[Recording AI] 🔄 Falling back to Whisper...`)
            const whisperStart = Date.now()
            const whisperTranscript = await transcribeAudio(recordingBuffer, `${recording.id}.webm`)
            transcriptText = whisperTranscript.text
            console.log(`[Recording AI] ✅ Whisper transcription complete in ${Date.now() - whisperStart}ms`)
          }
        } else {
          console.log(`[Recording AI] ⚠️ ASSEMBLYAI_API_KEY not set - using Whisper (no speaker diarization)`)
          const whisperStart = Date.now()
          const whisperTranscript = await transcribeAudio(recordingBuffer, `${recording.id}.webm`)
          transcriptText = whisperTranscript.text
          console.log(`[Recording AI] ✅ Whisper transcription complete in ${Date.now() - whisperStart}ms`)
          console.log(`[Recording AI] 📝 Transcript length: ${transcriptText.length} chars`)
        }

        // Get associated notes for context
        console.log(`\n[Recording AI] 📋 FETCHING CONTEXT`)
        const { data: notesArchive } = await supabaseAdmin
          .from('notes_archive')
          .select('content_html, content')
          .eq('recording_id', recording.id)
          .maybeSingle()
        console.log(`[Recording AI] Notes archive found: ${!!notesArchive}`)
        if (notesArchive) {
          console.log(`[Recording AI] Notes content length: ${(notesArchive.content || notesArchive.content_html || '').length} chars`)
        }

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
        console.log(`[Recording AI] Previous summaries found: ${previousSummaries?.length || 0}`)

        // Generate AI summary with diarized transcript if available
        console.log(`\n[Recording AI] 🤖 GENERATING AI SUMMARY`)
        console.log(`[Recording AI] Using diarized transcript: ${!!diarizedTranscript}`)
        const summaryStart = Date.now()
        const summary = await generateLessonSummary(
          transcriptText,
          notesArchive?.content || notesArchive?.content_html,
          previousSummaries,
          diarizedTranscript ? {
            text: diarizedTranscript.text,
            utterances: diarizedTranscript.utterances.map(u => ({
              speaker: u.speaker,
              text: u.text,
            })),
          } : undefined
        )
        console.log(`[Recording AI] ✅ Summary generated in ${Date.now() - summaryStart}ms`)
        console.log(`[Recording AI] 📊 Summary details:`)
        console.log(`   - Topics covered: ${summary.keyTopicsCovered?.length || 0}`)
        console.log(`   - Exercises: ${summary.exercisesPracticed?.length || 0}`)
        console.log(`   - Feedback points: ${summary.teacherFeedback?.length || 0}`)
        console.log(`   - Homework items: ${summary.homeworkAssignments?.length || 0}`)

        // Update the recording with results (including diarized transcript if available)
        console.log(`\n[Recording AI] 💾 SAVING TO DATABASE`)
        const { error: updateError } = await supabaseAdmin
          .from('lesson_recordings')
          .update({
            transcript: transcriptText,
            transcript_diarized: diarizedTranscript,
            ai_summary: summary,
            ai_processing_status: 'completed',
            ai_processed_at: new Date().toISOString(),
            ai_processing_error: null,
          })
          .eq('id', recording.id)

        if (updateError) {
          console.error(`[Recording AI] ❌ Failed to update lesson_recordings:`, updateError)
        } else {
          console.log(`[Recording AI] ✅ lesson_recordings table updated`)
        }

        // Also update the notes_archive if it exists
        if (notesArchive) {
          const { error: archiveError } = await supabaseAdmin
            .from('notes_archive')
            .update({ ai_summary: summary })
            .eq('recording_id', recording.id)

          if (archiveError) {
            console.error(`[Recording AI] ❌ Failed to update notes_archive:`, archiveError)
          } else {
            console.log(`[Recording AI] ✅ notes_archive table updated`)
          }
        }

        const totalTime = Date.now() - startTime
        console.log(`\n${'='.repeat(60)}`)
        console.log(`[Recording AI] ✅ AI PROCESSING COMPLETE`)
        console.log(`[Recording AI] Recording ID: ${recording.id}`)
        console.log(`[Recording AI] Total time: ${(totalTime / 1000).toFixed(1)}s`)
        console.log(`${'='.repeat(60)}\n`)
      } catch (processingError) {
        const totalTime = Date.now() - startTime
        console.error(`\n${'='.repeat(60)}`)
        console.error(`[Recording AI] ❌ AI PROCESSING FAILED`)
        console.error(`[Recording AI] Recording ID: ${recording.id}`)
        console.error(`[Recording AI] Error after ${(totalTime / 1000).toFixed(1)}s:`, processingError)
        console.error(`${'='.repeat(60)}\n`)

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

    // Refresh signed URLs for all recordings (4 hours for better playback experience)
    const recordingsWithUrls = await Promise.all(
      (recordings || []).map(async (recording) => {
        if (recording.storage_path) {
          const { data: urlData } = await supabaseAdmin.storage
            .from('lesson-recordings')
            .createSignedUrl(recording.storage_path, 60 * 60 * 4) // 4 hours

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
