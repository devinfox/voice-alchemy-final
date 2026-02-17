import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/teachers/pending-requests - Get pending booking requests
export async function GET() {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a teacher (admin role)
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can access this endpoint' }, { status: 403 })
    }

    // Get all pending bookings
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, created_at, student_id')
      .eq('instructor_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[Teachers API] Error fetching pending requests:', error)
      return NextResponse.json({ error: 'Failed to fetch requests', details: error.message }, { status: 500 })
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
    const requests = bookings?.map(booking => ({
      ...booking,
      student: studentMap[booking.student_id] || null
    })) || []

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('[Teachers API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
