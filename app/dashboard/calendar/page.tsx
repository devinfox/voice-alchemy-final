import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { CalendarView } from './calendar-view'

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
  const { data: rawBookings, error } = await supabase
    .from('bookings')
    .select('id, status, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone, student_id, instructor_id')
    .eq(isTeacher ? 'instructor_id' : 'student_id', currentUser.id)
    .eq('status', 'confirmed')
    .limit(200)

  // Debug logging
  console.log('[Calendar Debug] User ID:', currentUser.id, 'isTeacher:', isTeacher)
  console.log('[Calendar Debug] Query error:', error)
  console.log('[Calendar Debug] Bookings count:', rawBookings?.length)

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

  bookings.forEach((b, i) => {
    console.log(`[Calendar Debug] Booking ${i}:`, b.id, 'day:', b.lesson_day_of_week, 'time:', b.lesson_time)
  })

  return (
    <CalendarView
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
