import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/lessons/[relationshipId]/notes/archive - Get all past notes (archived)
// Note: relationshipId here refers to the booking ID
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

    // Get the booking to verify access
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

    // Get all past notes from notes_archive (where end-class writes to)
    const { data: archivedNotes, error: notesError } = await supabase
      .from('notes_archive')
      .select(`
        id,
        content,
        content_html,
        class_started_at,
        class_ended_at,
        published,
        created_at
      `)
      .eq('student_id', booking.student_id)
      .order('class_started_at', { ascending: false })

    if (notesError) {
      console.error('[Lessons API] Error fetching archived notes:', notesError)
      return NextResponse.json({ error: 'Failed to fetch archived notes' }, { status: 500 })
    }

    return NextResponse.json({ archivedNotes })
  } catch (error) {
    console.error('[Lessons API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/lessons/[relationshipId]/notes/archive - This is kept for compatibility
// but since we don't have an is_archived column, this just returns success
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

    // Get the booking to verify access
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, instructor_id, student_id')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Only instructors can archive notes
    if (profile.id !== booking.instructor_id) {
      return NextResponse.json({ error: 'Only teachers can archive notes' }, { status: 403 })
    }

    // Since the existing schema doesn't have archive functionality,
    // we just return success (notes are already persisted by week)
    return NextResponse.json({
      success: true,
      message: 'Notes saved successfully',
    })
  } catch (error) {
    console.error('[Lessons API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
