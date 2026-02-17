import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const JULIA_SEARCH_PATTERN = '%Julia%'

// Helper to get admin client if available, otherwise use regular client
async function getSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  // If service role key is available, use admin client
  if (serviceRoleKey && supabaseUrl && serviceRoleKey.length > 10) {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    return createAdminClient(supabaseUrl, serviceRoleKey)
  }

  // Fall back to regular client
  return createClient()
}

// GET /api/students/my-teachers - Get all teachers for the current student
export async function GET() {
  try {
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[my-teachers] User profile:', { id: profile.id, role: profile.role })

    // Verify user is a student
    if (profile.role !== 'student') {
      return NextResponse.json({ error: 'Only students can access this endpoint' }, { status: 403 })
    }

    // Get Supabase client (admin if available, otherwise regular)
    const supabase = await getSupabaseClient()

    // Resolve Julia profile first (Julia should always be the teacher for students here).
    const { data: juliaProfile, error: juliaError } = await supabase
      .from('profiles')
      .select('id, name, first_name, last_name, role')
      .in('role', ['admin', 'teacher', 'instructor'])
      .or(`name.ilike.${JULIA_SEARCH_PATTERN},first_name.ilike.${JULIA_SEARCH_PATTERN}`)
      .neq('id', profile.id)
      .limit(1)
      .maybeSingle()

    if (juliaError) {
      console.error('[my-teachers] Error finding Julia profile:', juliaError)
      return NextResponse.json({
        error: 'Failed to resolve Julia teacher profile',
        details: juliaError.message,
      }, { status: 500 })
    }

    if (!juliaProfile) {
      return NextResponse.json({
        error: 'Julia teacher profile not found',
        details: 'Create a teacher/admin profile named Julia to continue.',
      }, { status: 500 })
    }

    // Ensure student has a confirmed booking with Julia
    const { data: juliaBooking, error: juliaBookingError } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('student_id', profile.id)
      .eq('instructor_id', juliaProfile.id)
      .limit(1)
      .maybeSingle()

    if (juliaBookingError) {
      console.error('[my-teachers] Error checking Julia booking:', juliaBookingError)
      return NextResponse.json({
        error: 'Database error',
        details: juliaBookingError.message,
      }, { status: 500 })
    }

    if (!juliaBooking) {
      const { error: insertError } = await supabase
        .from('bookings')
        .insert({
          student_id: profile.id,
          instructor_id: juliaProfile.id,
          status: 'confirmed',
        })

      if (insertError) {
        console.error('[my-teachers] Error creating Julia booking:', insertError)
        return NextResponse.json({
          error: 'Failed to assign Julia as teacher',
          details: insertError.message,
        }, { status: 500 })
      }
    } else if (juliaBooking.status !== 'confirmed') {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', juliaBooking.id)

      if (updateError) {
        console.error('[my-teachers] Error confirming Julia booking:', updateError)
        return NextResponse.json({
          error: 'Failed to confirm Julia booking',
          details: updateError.message,
        }, { status: 500 })
      }
    }

    // Keep check for any existing bookings to preserve prior behavior/logging.
    const { data: existingBookings, error: existingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('student_id', profile.id)
      .limit(1)

    console.log('[my-teachers] Existing bookings:', existingBookings, 'Error:', existingError)

    // If bookings table doesn't exist or there's an error, return the error
    if (existingError) {
      console.error('[my-teachers] Error checking existing bookings:', existingError)
      return NextResponse.json({
        error: 'Database error',
        details: existingError.message
      }, { status: 500 })
    }

    // Auto-enroll in the current default course if not already enrolled
    const BOB_DYLAN_COURSE_ID = 'd3fea135-27f5-4bba-9774-1cb81cd0bfea'
    const { data: existingEnrollment } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', profile.id)
      .eq('course_id', BOB_DYLAN_COURSE_ID)
      .limit(1)

    if (!existingEnrollment || existingEnrollment.length === 0) {
      const { error: enrollError } = await supabase
        .from('course_enrollments')
        .insert({
          student_id: profile.id,
          course_id: BOB_DYLAN_COURSE_ID,
        })

      if (enrollError) {
        console.log('[my-teachers] Course enrollment error:', enrollError.message)
      } else {
        console.log('[my-teachers] Auto-enrolled student in default course')
      }
    }

    // Get Julia confirmed booking (including schedule fields)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, status, created_at, updated_at, instructor_id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone')
      .eq('student_id', profile.id)
      .eq('instructor_id', juliaProfile.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })

    console.log('[my-teachers] Fetched bookings:', bookings?.length, 'Error:', bookingsError)

    if (bookingsError) {
      console.error('[Students API] Error fetching teachers:', bookingsError)
      return NextResponse.json({ error: 'Failed to fetch teachers', details: bookingsError.message }, { status: 500 })
    }

    // Fetch instructor profiles separately
    const instructorIds = bookings?.map(b => b.instructor_id).filter(Boolean) || []
    let instructorMap: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null; avatar_url: string | null; bio: string | null }> = {}

    if (instructorIds.length > 0) {
      const { data: instructors } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name, avatar_url, bio')
        .in('id', instructorIds)

      if (instructors) {
        instructorMap = Object.fromEntries(instructors.map(i => [i.id, i]))
      }
    }

    // Combine bookings with instructor data
    const teachersWithInstructors = bookings?.map(booking => ({
      ...booking,
      instructor: instructorMap[booking.instructor_id] || null
    })) || []

    // Get pending requests only for Julia
    const { data: pendingBookings, error: pendingError } = await supabase
      .from('bookings')
      .select('id, status, created_at, updated_at, instructor_id')
      .eq('student_id', profile.id)
      .eq('instructor_id', juliaProfile.id)
      .eq('status', 'pending')

    if (pendingError) {
      console.error('[Students API] Error fetching pending requests:', pendingError)
    }

    // Fetch pending instructor profiles
    const pendingInstructorIds = pendingBookings?.map(b => b.instructor_id).filter(Boolean) || []
    let pendingInstructorMap: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null; avatar_url: string | null; bio: string | null }> = {}

    if (pendingInstructorIds.length > 0) {
      const { data: pendingInstructors } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name, avatar_url, bio')
        .in('id', pendingInstructorIds)

      if (pendingInstructors) {
        pendingInstructorMap = Object.fromEntries(pendingInstructors.map(i => [i.id, i]))
      }
    }

    const pendingWithInstructors = pendingBookings?.map(booking => ({
      ...booking,
      instructor: pendingInstructorMap[booking.instructor_id] || null
    })) || []

    return NextResponse.json({
      teachers: teachersWithInstructors,
      pendingRequests: pendingWithInstructors,
    })
  } catch (error) {
    console.error('[Students API] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('[Students API] Error stack:', errorStack)
    return NextResponse.json({
      error: 'Internal server error',
      details: errorMessage
    }, { status: 500 })
  }
}
