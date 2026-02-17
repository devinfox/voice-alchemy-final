import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/teachers/[studentId]/reject - Reject a booking request
// Note: studentId here refers to the booking ID for simplicity
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId: bookingId } = await params
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a teacher (admin role)
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can reject requests' }, { status: 403 })
    }

    // Get the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, instructor_id')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Verify this booking belongs to the current instructor
    if (booking.instructor_id !== profile.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (booking.status !== 'pending') {
      return NextResponse.json({ error: 'Request is not pending' }, { status: 400 })
    }

    // Update the booking to cancelled (rejected)
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)

    if (updateError) {
      console.error('[Teachers API] Error rejecting request:', updateError)
      return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Request rejected',
    })
  } catch (error) {
    console.error('[Teachers API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
