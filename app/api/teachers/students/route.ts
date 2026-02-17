import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/teachers/students - Get all students for the current teacher/instructor
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a teacher/instructor/admin
    const isTeacher = profile.role === 'teacher' || profile.role === 'instructor'
    const isAdmin = profile.role === 'admin'

    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: 'Only teachers can access this endpoint' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const offset = (page - 1) * limit

    if (isAdmin) {
      // ADMIN VIEW: Show ALL students from profiles table
      const { data: students, error, count } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name, avatar_url, bio, created_at', { count: 'exact' })
        .eq('role', 'student')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('[Teachers API] Error fetching students:', error)
        return NextResponse.json({ error: 'Failed to fetch students', details: error.message }, { status: 500 })
      }

      // Get booking info for these students (to show schedule if they have one)
      const studentIds = students?.map(s => s.id) || []
      let bookingMap: Record<string, { id: string; lesson_day_of_week: number | null; lesson_time: string | null; lesson_duration_minutes: number | null; instructor_id: string }> = {}

      if (studentIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, student_id, instructor_id, lesson_day_of_week, lesson_time, lesson_duration_minutes')
          .in('student_id', studentIds)
          .eq('status', 'confirmed')

        if (bookings) {
          // Use first booking per student for display
          bookings.forEach(b => {
            if (!bookingMap[b.student_id]) {
              bookingMap[b.student_id] = b
            }
          })
        }
      }

      // Format response to match expected structure
      const studentsWithBookings = students?.map(student => {
        const booking = bookingMap[student.id]
        return {
          id: booking?.id || `profile-${student.id}`, // Use booking ID if exists, else profile ID
          student_id: student.id,
          status: booking ? 'confirmed' : null,
          lesson_day_of_week: booking?.lesson_day_of_week || null,
          lesson_time: booking?.lesson_time || null,
          lesson_duration_minutes: booking?.lesson_duration_minutes || null,
          created_at: student.created_at,
          student: {
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            name: student.name,
            avatar_url: student.avatar_url,
            bio: student.bio,
          }
        }
      }) || []

      return NextResponse.json({
        students: studentsWithBookings,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      })
    } else {
      // TEACHER VIEW: Show only their students via bookings
      const { data: bookings, error, count } = await supabase
        .from('bookings')
        .select('id, status, created_at, updated_at, student_id, instructor_id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone', { count: 'exact' })
        .eq('instructor_id', profile.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('[Teachers API] Error fetching students:', error)
        return NextResponse.json({ error: 'Failed to fetch students', details: error.message }, { status: 500 })
      }

      // Fetch student profiles separately
      const studentIds = bookings?.map(b => b.student_id).filter(Boolean) || []
      let studentMap: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null; avatar_url: string | null; bio: string | null }> = {}

      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, name, avatar_url, bio')
          .in('id', studentIds)

        if (students) {
          studentMap = Object.fromEntries(students.map(s => [s.id, s]))
        }
      }

      // Combine bookings with student data
      const studentsWithProfiles = bookings?.map(booking => ({
        ...booking,
        student: studentMap[booking.student_id] || null
      })) || []

      return NextResponse.json({
        students: studentsWithProfiles,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      })
    }
  } catch (error) {
    console.error('[Teachers API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
