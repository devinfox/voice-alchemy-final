import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

interface InstructorProfile {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  avatar_url: string | null
  bio: string | null
}

// GET /api/students/my-teachers - Get all teachers for the current student.
//
// This is a pure read. It previously force-confirmed pending/cancelled
// bookings and auto-enrolled students in a hardcoded course as a side
// effect of loading the page — silently overriding the teacher's
// approve/reject decisions. Teacher relationships are now created only
// through the request flow and confirmed only by the teacher.
export async function GET() {
  try {
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (profile.role !== 'student') {
      return NextResponse.json({ error: 'Only students can access this endpoint' }, { status: 403 })
    }

    const supabase = await createClient()

    // Confirmed teacher relationships
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, status, created_at, updated_at, instructor_id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone')
      .eq('student_id', profile.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })

    if (bookingsError) {
      console.error('[my-teachers] Error fetching teachers:', bookingsError)
      return NextResponse.json({ error: 'Failed to fetch teachers', details: bookingsError.message }, { status: 500 })
    }

    // Pending requests (awaiting teacher approval)
    const { data: pendingBookings, error: pendingError } = await supabase
      .from('bookings')
      .select('id, status, created_at, updated_at, instructor_id')
      .eq('student_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (pendingError) {
      console.error('[my-teachers] Error fetching pending requests:', pendingError)
    }

    // Fetch all involved instructor profiles in one query
    const instructorIds = [
      ...new Set(
        [...(bookings || []), ...(pendingBookings || [])]
          .map((b) => b.instructor_id)
          .filter(Boolean)
      ),
    ]
    let instructorMap: Record<string, InstructorProfile> = {}

    if (instructorIds.length > 0) {
      const { data: instructors } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name, avatar_url, bio')
        .in('id', instructorIds)

      if (instructors) {
        instructorMap = Object.fromEntries(instructors.map((i) => [i.id, i]))
      }
    }

    const teachersWithInstructors = (bookings || []).map((booking) => ({
      ...booking,
      instructor: instructorMap[booking.instructor_id] || null,
    }))

    const pendingWithInstructors = (pendingBookings || []).map((booking) => ({
      ...booking,
      instructor: instructorMap[booking.instructor_id] || null,
    }))

    return NextResponse.json({
      teachers: teachersWithInstructors,
      pendingRequests: pendingWithInstructors,
    })
  } catch (error) {
    console.error('[my-teachers] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 })
  }
}
