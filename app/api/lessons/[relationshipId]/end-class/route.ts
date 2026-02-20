import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Helper to get admin client for bypassing RLS
async function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (serviceRoleKey && supabaseUrl && serviceRoleKey.length > 10) {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    return createAdminClient(supabaseUrl, serviceRoleKey)
  }

  return null
}

// POST /api/lessons/[relationshipId]/end-class - End the class, archive notes, lock session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, instructor_id, student_id, status')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Only teachers can end class
    if (profile.id !== booking.instructor_id) {
      return NextResponse.json({ error: 'Only teachers can end class' }, { status: 403 })
    }

    // Use admin client to bypass RLS for all DB operations
    const adminClient = await getAdminClient()
    const dbClient = adminClient || supabase

    // Read the note content sent directly from the editor
    let body: { contentHtml?: string; classStartedAt?: string } = {}
    try {
      body = await request.json()
    } catch {
      // no body — fall back to reading from DB
    }

    let contentHtml = body.contentHtml ?? ''
    const classStartedAt = body.classStartedAt ?? new Date().toISOString()

    // Fallback: if frontend didn't send content, try reading from lesson_current_notes
    if (!contentHtml) {
      const { data: liveNote } = await dbClient
        .from('lesson_current_notes')
        .select('content')
        .eq('student_id', booking.student_id)
        .maybeSingle()
      contentHtml = liveNote?.content ?? ''
    }

    const plainText = contentHtml.replace(/<[^>]*>/g, '').trim()

    console.log('[End Class API] bookingId:', bookingId, 'studentId:', booking.student_id)
    console.log('[End Class API] Content HTML length:', contentHtml.length, 'Plain text length:', plainText.length)

    // --- Archive to notes_archive (this is what "Past Classes" reads from) ---
    const { data: archivedNote, error: archiveError } = await dbClient
      .from('notes_archive')
      .insert({
        student_id: booking.student_id,
        content: plainText,
        content_html: contentHtml,
        class_started_at: classStartedAt,
        class_ended_at: new Date().toISOString(),
        published: true,
      })
      .select('id, class_started_at, class_ended_at')
      .single()

    if (archiveError) {
      console.error('[End Class API] Error archiving note:', archiveError)
      return NextResponse.json({ error: 'Failed to archive notes', details: archiveError.message }, { status: 500 })
    }

    console.log('[End Class API] Archived note:', archivedNote?.id)

    // --- Link the latest recording to this archived note and trigger AI processing ---
    const { data: latestRecording } = await dbClient
      .from('lesson_recordings')
      .select('id')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestRecording && archivedNote) {
      // Update the archived note with the recording ID
      await dbClient
        .from('notes_archive')
        .update({ recording_id: latestRecording.id })
        .eq('id', archivedNote.id)

      console.log('[End Class API] Linked recording', latestRecording.id, 'to archived note', archivedNote.id)

      // Check if AI processing needs to be triggered
      // Note: AI processing is now primarily handled by the recordings upload route
      // This serves as a backup in case the upload route's processing failed
      const { data: recordingStatus } = await dbClient
        .from('lesson_recordings')
        .select('ai_processing_status')
        .eq('id', latestRecording.id)
        .single()

      if (recordingStatus?.ai_processing_status === 'pending' || recordingStatus?.ai_processing_status === 'failed') {
        console.log('[End Class API] Recording not yet processed, triggering AI processing as backup')
        // Trigger AI processing via HTTP call as backup
        const rawBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        const baseUrl = rawBaseUrl
          ? (rawBaseUrl.startsWith('http://') || rawBaseUrl.startsWith('https://') ? rawBaseUrl : `https://${rawBaseUrl}`)
          : 'http://localhost:3000'
        const processingHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (process.env.CRON_SECRET) {
          processingHeaders['x-internal-secret'] = process.env.CRON_SECRET
        }
        const cookieHeader = request.headers.get('cookie')
        if (cookieHeader) {
          processingHeaders.cookie = cookieHeader
        }
        fetch(`${baseUrl}/api/lessons/${bookingId}/process-recording`, {
          method: 'POST',
          headers: processingHeaders,
          body: JSON.stringify({ recordingId: latestRecording.id }),
        }).catch(err => {
          console.error('[End Class API] Failed to trigger AI processing:', err)
        })
      } else {
        console.log('[End Class API] AI processing already', recordingStatus?.ai_processing_status, 'for recording', latestRecording.id)
      }
    }

    // --- Also update session_notes if it exists (non-blocking) ---
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + mondayOffset)
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    const { data: notes } = await dbClient
      .from('session_notes')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('week_start', weekStartStr)
      .maybeSingle()

    if (notes) {
      await dbClient
        .from('session_notes')
        .update({
          class_active: false,
          class_ended_at: new Date().toISOString(),
          is_locked: true,
          content: plainText,
          content_html: contentHtml,
        })
        .eq('id', notes.id)

      await dbClient
        .from('session_note_history')
        .insert({
          session_note_id: notes.id,
          content: plainText,
          content_html: contentHtml,
          archived_by: profile.id,
        })
    }

    return NextResponse.json({
      success: true,
      message: 'Class ended and notes archived',
      archivedNote,
    })
  } catch (error) {
    console.error('[End Class API] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
