import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/lessons/[relationshipId] - Get lesson page data
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

    // Get the booking with schedule
    // eslint-disable-next-line prefer-const -- bookingError not reassigned but booking is
    let { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, created_at, updated_at, instructor_id, student_id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone')
      .eq('id', bookingId)
      .single()

    if (bookingError) {
      console.error('[Lessons API] Booking query error:', bookingError)
      // If the error is about missing columns, try without schedule columns
      if (bookingError.message?.includes('column') || bookingError.code === '42703') {
        const { data: bookingBasic, error: basicError } = await supabase
          .from('bookings')
          .select('id, status, created_at, updated_at, instructor_id, student_id')
          .eq('id', bookingId)
          .single()
        if (basicError || !bookingBasic) {
          return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
        }
        // Add null schedule fields
        booking = {
          ...bookingBasic,
          lesson_day_of_week: null,
          lesson_time: null,
          lesson_duration_minutes: 60,
          lesson_timezone: 'America/New_York'
        }
      } else {
        return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
      }
    }

    if (!booking) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Verify user is either the instructor, student, or an admin
    const isInstructor = profile.id === booking.instructor_id
    const isStudent = profile.id === booking.student_id
    const isAdmin = profile.role === 'admin'

    if (!isInstructor && !isStudent && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch instructor and student profiles separately
    const { data: instructorProfile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name, avatar_url')
      .eq('id', booking.instructor_id)
      .single()

    const { data: studentProfile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name, avatar_url')
      .eq('id', booking.student_id)
      .single()

    const instructor = instructorProfile || { id: booking.instructor_id, first_name: null, last_name: null, name: 'Teacher', avatar_url: null }
    const student = studentProfile || { id: booking.student_id, first_name: null, last_name: null, name: 'Student', avatar_url: null }

    if (booking.status !== 'confirmed') {
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

    // Get the current note for the student from lesson_current_notes
    // eslint-disable-next-line prefer-const -- notesError not reassigned but notes is
    let { data: notes, error: notesError } = await supabase
        .from('lesson_current_notes')
        .select('*')
        .eq('student_id', booking.student_id)
        .maybeSingle();

    if (notesError) {
        console.error('[Lessons API] Error fetching lesson_current_notes:', notesError);
        // Do not block, just return null notes
        notes = null;
    }
    
    // Get count of archived notes for this student
    const { count: notesCount } = await supabase
      .from('notes_archive')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', booking.student_id)

    const userName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User'

    // Build relationship object with instructor and student
    const relationshipWithUsers = {
      ...booking,
      instructor,
      student,
    }

    return NextResponse.json({
      relationship: relationshipWithUsers,
      currentNotes: notes,
      currentWeek: {
        start: weekStartStr,
        end: weekEnd.toISOString().split('T')[0],
      },
      archivedNotesCount: Math.max(0, (notesCount || 1) - 1),
      isTeacher: profile.id === instructor.id || profile.role === 'admin',
      currentUser: {
        id: profile.id,
        name: userName,
      },
    })
  } catch (error) {
    console.error('[Lessons API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
