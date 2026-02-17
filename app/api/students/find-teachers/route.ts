import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/students/find-teachers - Search for teachers
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a student
    if (profile.role !== 'student') {
      return NextResponse.json({ error: 'Only students can search for teachers' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''

    // Get all teachers
    let teacherQuery = supabase
      .from('profiles')
      .select('id, first_name, last_name, name, avatar_url, bio')
      .in('role', ['admin', 'teacher', 'instructor'])
      .order('first_name', { ascending: true })
      .limit(50)

    // Add search filter if query provided
    if (query.trim()) {
      teacherQuery = teacherQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,name.ilike.%${query}%`)
    }

    const { data: teachers, error: teachersError } = await teacherQuery

    if (teachersError) {
      console.error('[Students API] Error fetching teachers:', teachersError)
      return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 })
    }

    // Get existing bookings for the current student
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('instructor_id, status')
      .eq('student_id', profile.id)

    if (bookingsError) {
      console.error('[Students API] Error fetching bookings:', bookingsError)
    }

    // Create a map of teacher ID to booking status
    const bookingMap = new Map<string, string>()
    if (bookings) {
      bookings.forEach((booking) => {
        bookingMap.set(booking.instructor_id, booking.status)
      })
    }

    // Add booking status to each teacher
    const teachersWithStatus =
      teachers?.map((teacher) => ({
        ...teacher,
        relationshipStatus: bookingMap.get(teacher.id) || null,
      })) || []

    return NextResponse.json({ teachers: teachersWithStatus })
  } catch (error) {
    console.error('[Students API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
