import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Helper to calculate minutes until next lesson
function getMinutesUntilNextLesson(dayOfWeek: number | null, time: string | null): number {
  if (dayOfWeek === null || !time) return Number.MAX_SAFE_INTEGER // No schedule = sort last

  const now = new Date()
  const currentDay = now.getDay()
  const [hours, minutes] = time.split(':').map(Number)

  // Calculate days until next lesson
  let daysUntil = dayOfWeek - currentDay
  if (daysUntil < 0) daysUntil += 7
  if (daysUntil === 0) {
    // Same day - check if time has passed
    const lessonMinutes = hours * 60 + minutes
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    if (lessonMinutes <= currentMinutes) {
      daysUntil = 7 // Already passed today, next week
    }
  }

  // Calculate total minutes until next lesson
  const lessonDate = new Date(now)
  lessonDate.setDate(now.getDate() + daysUntil)
  lessonDate.setHours(hours, minutes, 0, 0)

  return Math.floor((lessonDate.getTime() - now.getTime()) / (1000 * 60))
}

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
    const search = searchParams.get('search')?.trim().toLowerCase() || ''
    const sortBy = searchParams.get('sortBy') || 'schedule' // 'schedule' | 'name' | 'recent'
    const offset = (page - 1) * limit

    if (isAdmin) {
      // ADMIN VIEW: Show ALL students from profiles table
      // First fetch all students for search/sort (we'll paginate after)
      let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, name, avatar_url, bio, created_at')
        .eq('role', 'student')

      // Apply search filter if provided
      if (search) {
        query = query.or(`name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
      }

      const { data: allStudents, error } = await query

      if (error) {
        console.error('[Teachers API] Error fetching students:', error)
        return NextResponse.json({ error: 'Failed to fetch students', details: error.message }, { status: 500 })
      }

      // Get booking info for all students
      const studentIds = allStudents?.map(s => s.id) || []
      let bookingMap: Record<string, { id: string; lesson_day_of_week: number | null; lesson_time: string | null; lesson_duration_minutes: number | null; instructor_id: string }> = {}

      if (studentIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, student_id, instructor_id, lesson_day_of_week, lesson_time, lesson_duration_minutes')
          .in('student_id', studentIds)
          .eq('status', 'confirmed')

        if (bookings) {
          bookings.forEach(b => {
            if (!bookingMap[b.student_id]) {
              bookingMap[b.student_id] = b
            }
          })
        }
      }

      // Format and add schedule info
      let studentsWithBookings = allStudents?.map(student => {
        const booking = bookingMap[student.id]
        return {
          id: booking?.id || `profile-${student.id}`,
          student_id: student.id,
          status: booking ? 'confirmed' : null,
          lesson_day_of_week: booking?.lesson_day_of_week ?? null,
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
          },
          _minutesUntilNext: getMinutesUntilNextLesson(booking?.lesson_day_of_week ?? null, booking?.lesson_time || null)
        }
      }) || []

      // Sort based on sortBy parameter
      if (sortBy === 'schedule') {
        studentsWithBookings.sort((a, b) => a._minutesUntilNext - b._minutesUntilNext)
      } else if (sortBy === 'name') {
        studentsWithBookings.sort((a, b) => {
          const nameA = a.student.name || `${a.student.first_name || ''} ${a.student.last_name || ''}`.trim()
          const nameB = b.student.name || `${b.student.first_name || ''} ${b.student.last_name || ''}`.trim()
          return nameA.localeCompare(nameB)
        })
      }
      // 'recent' keeps the default order (by created_at desc)

      // Apply pagination after sorting
      const total = studentsWithBookings.length
      const paginatedStudents = studentsWithBookings.slice(offset, offset + limit)

      // Remove internal sorting field
      const cleanedStudents = paginatedStudents.map(({ _minutesUntilNext, ...rest }) => rest)

      return NextResponse.json({
        students: cleanedStudents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    } else {
      // TEACHER VIEW: Show only their students via bookings
      // Fetch all bookings first (for search/sort), then paginate
      const { data: allBookings, error } = await supabase
        .from('bookings')
        .select('id, status, created_at, updated_at, student_id, instructor_id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone')
        .eq('instructor_id', profile.id)
        .eq('status', 'confirmed')

      if (error) {
        console.error('[Teachers API] Error fetching students:', error)
        return NextResponse.json({ error: 'Failed to fetch students', details: error.message }, { status: 500 })
      }

      // Fetch student profiles
      const studentIds = allBookings?.map(b => b.student_id).filter(Boolean) || []
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

      // Combine bookings with student data and add sorting info
      let studentsWithProfiles = allBookings?.map(booking => {
        const student = studentMap[booking.student_id] || null
        return {
          ...booking,
          student,
          _minutesUntilNext: getMinutesUntilNextLesson(booking.lesson_day_of_week, booking.lesson_time)
        }
      }) || []

      // Apply search filter
      if (search && studentsWithProfiles.length > 0) {
        studentsWithProfiles = studentsWithProfiles.filter(item => {
          if (!item.student) return false
          const name = (item.student.name || `${item.student.first_name || ''} ${item.student.last_name || ''}`).toLowerCase()
          return name.includes(search)
        })
      }

      // Sort based on sortBy parameter
      if (sortBy === 'schedule') {
        studentsWithProfiles.sort((a, b) => a._minutesUntilNext - b._minutesUntilNext)
      } else if (sortBy === 'name') {
        studentsWithProfiles.sort((a, b) => {
          const nameA = a.student?.name || `${a.student?.first_name || ''} ${a.student?.last_name || ''}`.trim()
          const nameB = b.student?.name || `${b.student?.first_name || ''} ${b.student?.last_name || ''}`.trim()
          return nameA.localeCompare(nameB)
        })
      }
      // 'recent' keeps the default order

      // Apply pagination after sorting
      const total = studentsWithProfiles.length
      const paginatedStudents = studentsWithProfiles.slice(offset, offset + limit)

      // Remove internal sorting field
      const cleanedStudents = paginatedStudents.map(({ _minutesUntilNext, ...rest }) => rest)

      return NextResponse.json({
        students: cleanedStudents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    }
  } catch (error) {
    console.error('[Teachers API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
