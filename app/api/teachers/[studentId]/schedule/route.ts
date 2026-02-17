import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/teachers/[studentId]/schedule - Update lesson schedule for a booking
// Note: studentId here refers to the booking ID
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId: bookingId } = await params
    const body = await request.json()
    const { lessonDayOfWeek, lessonTime, durationMinutes, timezone } = body

    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a teacher/instructor/admin
    const isTeacher = profile.role === 'teacher' || profile.role === 'instructor' || profile.role === 'admin'
    if (!isTeacher) {
      return NextResponse.json({ error: 'Only teachers can update schedules' }, { status: 403 })
    }

    // Validate day of week
    if (lessonDayOfWeek !== undefined && lessonDayOfWeek !== null) {
      if (lessonDayOfWeek < 0 || lessonDayOfWeek > 6) {
        return NextResponse.json({ error: 'Invalid day of week (must be 0-6)' }, { status: 400 })
      }
    }

    // Validate duration
    if (durationMinutes !== undefined && durationMinutes !== null) {
      if (durationMinutes < 15 || durationMinutes > 180) {
        return NextResponse.json({ error: 'Invalid duration (must be 15-180 minutes)' }, { status: 400 })
      }
    }

    // Validate time format (HH:MM or HH:MM:SS)
    if (lessonTime !== undefined && lessonTime !== null && lessonTime !== '') {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/
      if (!timeRegex.test(lessonTime)) {
        return NextResponse.json({ error: 'Invalid time format (use HH:MM)' }, { status: 400 })
      }
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

    // Verify this booking belongs to the current instructor OR user is admin
    const isAdmin = profile.role === 'admin'
    if (!isAdmin && booking.instructor_id !== profile.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (booking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Booking is not confirmed' }, { status: 400 })
    }

    // Build update object
    const updateData: Record<string, unknown> = {}

    if (lessonDayOfWeek !== undefined) {
      updateData.lesson_day_of_week = lessonDayOfWeek
    }

    if (lessonTime !== undefined) {
      // Convert to proper TIME format (ensure HH:MM:SS)
      updateData.lesson_time = lessonTime ? (lessonTime.includes(':') && lessonTime.split(':').length === 2 ? `${lessonTime}:00` : lessonTime) : null
    }

    if (durationMinutes !== undefined) {
      updateData.lesson_duration_minutes = durationMinutes
    }

    if (timezone !== undefined) {
      updateData.lesson_timezone = timezone || 'America/New_York'
    }

    // Update the booking
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select('id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone')
      .single()

    if (updateError) {
      console.error('[Schedule API] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Schedule updated successfully',
      schedule: updatedBooking,
    })
  } catch (error) {
    console.error('[Schedule API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/teachers/[studentId]/schedule - Get lesson schedule for a booking
export async function GET(
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

    // Get the booking with schedule
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id, status, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Verify user is part of this booking OR is admin
    const isAdmin = profile.role === 'admin'
    if (!isAdmin && booking.instructor_id !== profile.id && booking.student_id !== profile.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({
      schedule: {
        lessonDayOfWeek: booking.lesson_day_of_week,
        lessonTime: booking.lesson_time,
        durationMinutes: booking.lesson_duration_minutes,
        timezone: booking.lesson_timezone,
      },
    })
  } catch (error) {
    console.error('[Schedule API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
