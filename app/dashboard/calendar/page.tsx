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

  // Names and one-off changes (a cancelled or moved date) load together.
  // The lesson_exceptions table may not exist yet on a database that has not
  // had the migration applied: treat that as "none".
  const bookingIds = (rawBookings || []).map((b) => b.id)
  const [{ data: profiles }, { data: exceptionRows }] = await Promise.all([
    allProfileIds.length > 0
      ? supabase.from('profiles').select('id, first_name, last_name, name').in('id', allProfileIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; name: string | null }[] }),
    bookingIds.length > 0
      ? supabase
          .from('lesson_exceptions')
          .select('booking_id, original_date, kind, new_date, new_time, new_duration_minutes')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null }> =
    Object.fromEntries((profiles || []).map((p) => [p.id, p]))
  const exceptions = (exceptionRows || []) as {
    booking_id: string
    original_date: string
    kind: 'cancelled' | 'rescheduled'
    new_date: string | null
    new_time: string | null
    new_duration_minutes: number | null
  }[]

  // Combine bookings with profile data
  const bookings = rawBookings?.map(b => ({
    ...b,
    student: profileMap[b.student_id] || null,
    instructor: profileMap[b.instructor_id] || null,
  })) || []


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
