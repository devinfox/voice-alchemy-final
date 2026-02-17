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

// POST /api/lessons/[relationshipId]/start-class - Start the class (teacher only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    console.log('[Start Class API] Starting class for booking:', bookingId)

    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      console.log('[Start Class API] Unauthorized - no profile')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Start Class API] User:', profile.id, profile.role)

    // Get the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, instructor_id, student_id, status')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      console.log('[Start Class API] Booking not found:', bookingError)
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    console.log('[Start Class API] Booking found:', booking.id, 'instructor:', booking.instructor_id)

    // Only teachers can start class
    if (profile.id !== booking.instructor_id) {
      console.log('[Start Class API] Not instructor:', profile.id, '!=', booking.instructor_id)
      return NextResponse.json({ error: 'Only teachers can start class' }, { status: 403 })
    }

    if (booking.status !== 'confirmed') {
      console.log('[Start Class API] Booking not confirmed:', booking.status)
      return NextResponse.json({ error: 'Lesson is not active' }, { status: 400 })
    }

    // Calculate current week dates
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + mondayOffset)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    console.log('[Start Class API] Week:', weekStartStr, '-', weekEndStr)

    // Use admin client to bypass RLS for session notes operations
    const adminClient = await getAdminClient()
    const dbClient = adminClient || supabase

    // Get or create session notes for this week
    // eslint-disable-next-line prefer-const -- notesError not reassigned but notes is
    let { data: notes, error: notesError } = await dbClient
      .from('session_notes')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('week_start', weekStartStr)
      .single()

    console.log('[Start Class API] Existing notes:', notes?.id, 'Error:', notesError?.code)

    if (notesError && notesError.code === 'PGRST116') {
      // Create new notes for this week
      console.log('[Start Class API] Creating new session notes...')
      const { data: newNotes, error: createError } = await dbClient
        .from('session_notes')
        .insert({
          booking_id: bookingId,
          week_start: weekStartStr,
          week_end: weekEndStr,
          content: '',
          content_html: '',
          class_active: true,
          class_started_at: new Date().toISOString(),
          is_locked: false,
        })
        .select()
        .single()

      if (createError) {
        console.error('[Start Class API] Error creating notes:', createError)
        return NextResponse.json({ error: 'Failed to create session', details: createError.message }, { status: 500 })
      }

      console.log('[Start Class API] Created notes:', newNotes?.id)
      notes = newNotes
    } else if (notes) {
      // Update existing notes to mark class as active
      console.log('[Start Class API] Updating existing notes to active...')
      const { data: updatedNotes, error: updateError } = await dbClient
        .from('session_notes')
        .update({
          class_active: true,
          class_started_at: new Date().toISOString(),
          is_locked: false,
        })
        .eq('id', notes.id)
        .select()
        .single()

      if (updateError) {
        console.error('[Start Class API] Error updating notes:', updateError)
        return NextResponse.json({ error: 'Failed to start class', details: updateError.message }, { status: 500 })
      }

      console.log('[Start Class API] Updated notes, class_active:', updatedNotes?.class_active)
      notes = updatedNotes
    } else if (notesError) {
      console.error('[Start Class API] Unexpected notes error:', notesError)
      return NextResponse.json({ error: 'Database error', details: notesError.message }, { status: 500 })
    }

    console.log('[Start Class API] Success! Notes:', notes?.id, 'class_active:', notes?.class_active)

    return NextResponse.json({
      success: true,
      message: 'Class started',
      notes,
    })
  } catch (error) {
    console.error('[Start Class API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
