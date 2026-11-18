import type { Metadata } from 'next'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { CalendarView } from './calendar-view'

export const metadata: Metadata = { title: 'Calendar', description: 'Upcoming lessons and availability.' }

export default async function CalendarPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  // For teachers: get bookings where they are the instructor
  // For students: get bookings where they are the student
  const isTeacher = currentUser.role === 'teacher' || currentUser.role === 'instructor' || currentUser.role === 'admin'

  // Fetch bookings with schedule data (without join syntax to avoid schema cache issues)
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select('id, status, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone, student_id, instructor_id')
    .eq(isTeacher ? 'instructor_id' : 'student_id', currentUser.id)
    .eq('status', 'confirmed')
    .limit(200)


  // Fetch related profiles separately
  const studentIds = rawBookings?.map(b => b.student_id).filter(Boolean) || []
  const instructorIds = rawBookings?.map(b => b.instructor_id).filter(Boolean) || []
  const allProfileIds = [...new Set([...studentIds, ...instructorIds])]

  let profileMap: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null }> = {}

  if (allProfileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name')
      .in('id', allProfileIds)

    if (profiles) {
      profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
    }
  }

  // Combine bookings with profile data
  const bookings = rawBookings?.map(b => ({
    ...b,
    student: profileMap[b.student_id] || null,
    instructor: profileMap[b.instructor_id] || null,
  })) || []


  // One-off changes (a cancelled or moved date). The table may not exist yet
  // on a database that has not had the migration applied: treat as "none".
  const bookingIds = bookings.map((b) => b.id)
  let exceptions: {
    booking_id: string
    original_date: string
    kind: 'cancelled' | 'rescheduled'
    new_date: string | null
    new_time: string | null
    new_duration_minutes: number | null
  }[] = []
  if (bookingIds.length > 0) {
    const { data: exceptionRows } = await supabase
      .from('lesson_exceptions')
      .select('booking_id, original_date, kind, new_date, new_time, new_duration_minutes')
      .in('booking_id', bookingIds)
    exceptions = exceptionRows || []
  }

  return (
    <CalendarView
      exceptions={exceptions}
      bookings={bookings || []}
      currentUser={{
        id: currentUser.id,
        first_name: currentUser.first_name || '',
        last_name: currentUser.last_name || '',
        name: currentUser.name || '',
        role: currentUser.role || '',
      }}
      userTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      isTeacher={isTeacher}
    />
  )
}
