import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/lessons/[relationshipId]/notes - Get all notes for a lesson (including archived)
export async function GET(
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

    // Verify user has access to this booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, instructor_id, student_id')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    if (profile.id !== booking.instructor_id && profile.id !== booking.student_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get all notes for this booking
    const { data: notes, error: notesError } = await supabase
      .from('session_notes')
      .select('id, week_start, week_end, content, content_html, is_archived, created_at, updated_at')
      .eq('booking_id', bookingId)
      .order('week_start', { ascending: false })

    if (notesError) {
      console.error('[Notes API] Error fetching notes:', notesError)
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
    }

    return NextResponse.json({ notes: notes || [] })
  } catch (error) {
    console.error('[Notes API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
