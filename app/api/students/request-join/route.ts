import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/students/request-join - Request to join a teacher
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teacherId } = body

    if (!teacherId) {
      return NextResponse.json({ error: 'Teacher ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a student
    if (profile.role !== 'student') {
      return NextResponse.json({ error: 'Only students can request to join teachers' }, { status: 403 })
    }

    // Verify the teacher exists and is a teacher/instructor
    const { data: teacher, error: teacherError } = await supabase
      .from('profiles')
      .select('id, role, first_name, last_name, name')
      .eq('id', teacherId)
      .single()

    if (teacherError || !teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    if (!['admin', 'teacher', 'instructor'].includes(teacher.role)) {
      return NextResponse.json({ error: 'User is not a teacher' }, { status: 400 })
    }

    // Check if a booking already exists
    const { data: existingBooking, error: existingError } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('instructor_id', teacherId)
      .eq('student_id', profile.id)
      .maybeSingle()

    if (existingError) {
      console.error('[Students API] Error checking existing booking:', existingError)
      return NextResponse.json({ error: 'Failed to check existing relationship' }, { status: 500 })
    }

    const teacherName = teacher.name || `${teacher.first_name} ${teacher.last_name}`

    if (existingBooking) {
      if (existingBooking.status === 'confirmed') {
        return NextResponse.json({ error: 'You are already enrolled with this teacher' }, { status: 400 })
      }
      if (existingBooking.status === 'pending') {
        return NextResponse.json({ error: 'You already have a pending request with this teacher' }, { status: 400 })
      }
      if (existingBooking.status === 'cancelled') {
        // Allow re-requesting after cancellation by updating the existing record
        const { error: updateError } = await supabase
          .from('bookings')
          .update({
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingBooking.id)

        if (updateError) {
          console.error('[Students API] Error updating request:', updateError)
          return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: `Request sent to ${teacherName}`,
        })
      }
    }

    // Create new booking
    const { error: insertError } = await supabase
      .from('bookings')
      .insert({
        instructor_id: teacherId,
        student_id: profile.id,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('[Students API] Error creating request:', insertError)
      return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Request sent to ${teacherName}`,
    })
  } catch (error) {
    console.error('[Students API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
