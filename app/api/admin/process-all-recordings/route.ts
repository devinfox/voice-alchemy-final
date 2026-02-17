import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { transcribeAudio, generateLessonSummary } from '@/lib/openai'

// POST /api/admin/process-all-recordings - Process all unprocessed recordings
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Missing Supabase admin credentials' },
      { status: 500 }
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

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
      status: 'success' | 'failed'
      error?: string
      bookingId?: string
      linkedNoteId?: string
    }> = []

    for (const recording of recordings) {
      try {
        console.log(`[ProcessAll] Processing recording ${recording.id}...`)

        // Update status to processing
        await supabaseAdmin
          .from('lesson_recordings')
          .update({ ai_processing_status: 'processing' })
          .eq('id', recording.id)

        // Download the recording
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from('lesson-recordings')
          .download(recording.storage_path)

        if (downloadError || !fileData) {
          throw new Error(`Failed to download: ${downloadError?.message}`)
        }

        const recordingBuffer = Buffer.from(await fileData.arrayBuffer())
        console.log(`[ProcessAll] Downloaded ${recordingBuffer.length} bytes for recording ${recording.id}`)

        // Transcribe the audio
        const transcript = await transcribeAudio(recordingBuffer, `${recording.id}.webm`)
        console.log(`[ProcessAll] Transcription complete: ${transcript.text.length} chars`)

        // Try to link to notes_archive if not already linked
        let linkedNoteId = null
        if (!recording.recording_id) {
          // Try to find an unlinked note for this student around the same time
          const recordingStartMs = new Date(recording.started_at || recording.created_at).getTime()

          const { data: unlinkedNotes } = await supabaseAdmin
            .from('notes_archive')
            .select('id, class_started_at, class_ended_at, recording_id, content, content_html')
            .eq('student_id', recording.student_id)
            .is('recording_id', null)
            .order('class_ended_at', { ascending: false })
            .limit(10)

          // Find the best matching note (within 3 hours)
          const bestNote = (unlinkedNotes || [])
            .map((note) => {
              const noteStartMs = note.class_started_at ? new Date(note.class_started_at).getTime() : null
              const noteEndMs = note.class_ended_at ? new Date(note.class_ended_at).getTime() : null
              const deltaStart = noteStartMs ? Math.abs(noteStartMs - recordingStartMs) : Number.POSITIVE_INFINITY
              const deltaEnd = noteEndMs ? Math.abs(noteEndMs - recordingStartMs) : Number.POSITIVE_INFINITY
              return {
                ...note,
                deltaMs: Math.min(deltaStart, deltaEnd),
              }
            })
            .sort((a, b) => a.deltaMs - b.deltaMs)[0]

          if (bestNote && bestNote.deltaMs <= 3 * 60 * 60 * 1000) {
            // Link the recording to this note
            await supabaseAdmin
              .from('notes_archive')
              .update({ recording_id: recording.id })
              .eq('id', bestNote.id)

            linkedNoteId = bestNote.id
            console.log(`[ProcessAll] Linked recording ${recording.id} to note ${bestNote.id}`)
          }
        }

        // Get the linked note content for context
        let noteContent = null
        const noteIdToUse = linkedNoteId || recording.recording_id

        if (noteIdToUse) {
          const { data: linkedNote } = await supabaseAdmin
            .from('notes_archive')
            .select('content, content_html')
            .eq(linkedNoteId ? 'id' : 'recording_id', linkedNoteId || recording.id)
            .maybeSingle()

          noteContent = linkedNote?.content || linkedNote?.content_html
        }

        // Get previous lesson summaries for context
        const { data: previousRecordings } = await supabaseAdmin
          .from('lesson_recordings')
          .select('ai_summary')
          .eq('booking_id', recording.booking_id)
          .eq('ai_processing_status', 'completed')
          .neq('id', recording.id)
          .order('created_at', { ascending: false })
          .limit(3)

        const previousSummaries = previousRecordings
          ?.map(r => (r.ai_summary as { summary?: string })?.summary)
          .filter(Boolean) as string[] | undefined

        // Generate AI summary
        console.log(`[ProcessAll] Generating AI summary for recording ${recording.id}`)
        const summary = await generateLessonSummary(
          transcript.text,
          noteContent || undefined,
          previousSummaries
        )

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

        // Also update the notes_archive if linked
        if (linkedNoteId || noteIdToUse) {
          await supabaseAdmin
            .from('notes_archive')
            .update({ ai_summary: summary })
            .eq(linkedNoteId ? 'id' : 'recording_id', linkedNoteId || recording.id)
        }

        console.log(`[ProcessAll] Successfully processed recording ${recording.id}`)
        results.push({
          id: recording.id,
          status: 'success',
          bookingId: recording.booking_id,
          linkedNoteId: linkedNoteId || undefined,
        })

      } catch (err) {
        console.error(`[ProcessAll] Error processing recording ${recording.id}:`, err)

        // Update status to failed
        await supabaseAdmin
          .from('lesson_recordings')
          .update({
            ai_processing_status: 'failed',
            ai_processing_error: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', recording.id)

        results.push({
          id: recording.id,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      message: `Processed ${recordings.length} recordings: ${successCount} succeeded, ${failedCount} failed`,
      processed: recordings.length,
      success: successCount,
      failed: failedCount,
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Missing Supabase admin credentials' },
      { status: 500 }
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

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
