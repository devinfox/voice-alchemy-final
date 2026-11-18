import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// One-off changes to a weekly lesson (cancel or move a single date).
// Note: as in the sibling schedule route, [studentId] is the booking ID.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/

// Postgres "relation does not exist" / PostgREST "table not in schema cache".
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

const NOT_SET_UP = NextResponse.json(
  { error: 'Single-date changes are not switched on yet (database update pending).' },
  { status: 503 }
)

async function authorize(bookingId: string) {
  const supabase = await createClient()
  const profile = await getCurrentUser()
  if (!profile) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const isAdmin = profile.role === 'admin'
  const isTeacher = isAdmin || profile.role === 'teacher' || profile.role === 'instructor'
  if (!isTeacher) {
    return { error: NextResponse.json({ error: 'Only teachers can change lessons' }, { status: 403 }) }
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, instructor_id')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: NextResponse.json({ error: 'Booking not found' }, { status: 404 }) }
  if (!isAdmin && booking.instructor_id !== profile.id) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
  }
  return { supabase, profile }
}

// POST: cancel or move one date. Replaces any earlier change for that date.
export async function POST(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId: bookingId } = await params
    const body = await request.json()
    const { originalDate, kind, newDate, newTime, newDurationMinutes, note } = body ?? {}

    if (typeof originalDate !== 'string' || !DATE_RE.test(originalDate)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    if (kind !== 'cancelled' && kind !== 'rescheduled') {
      return NextResponse.json({ error: 'Invalid change type' }, { status: 400 })
    }
    if (kind === 'rescheduled') {
      if (typeof newDate !== 'string' || !DATE_RE.test(newDate)) {
        return NextResponse.json({ error: 'Choose the new date' }, { status: 400 })
      }
      if (typeof newTime !== 'string' || !TIME_RE.test(newTime)) {
        return NextResponse.json({ error: 'Choose the new start time' }, { status: 400 })
      }
      if (newDurationMinutes != null && (newDurationMinutes < 15 || newDurationMinutes > 180)) {
        return NextResponse.json({ error: 'Invalid length (15 to 180 minutes)' }, { status: 400 })
      }
    }

    const auth = await authorize(bookingId)
    if ('error' in auth) return auth.error

    const { data, error } = await auth.supabase
      .from('lesson_exceptions')
      .upsert(
        {
          booking_id: bookingId,
          original_date: originalDate,
          kind,
          new_date: kind === 'rescheduled' ? newDate : null,
          new_time: kind === 'rescheduled' ? (newTime.split(':').length === 2 ? `${newTime}:00` : newTime) : null,
          new_duration_minutes: kind === 'rescheduled' ? newDurationMinutes ?? null : null,
          note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null,
          created_by: auth.profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'booking_id,original_date' }
      )
      .select('id, booking_id, original_date, kind, new_date, new_time, new_duration_minutes, note')
      .single()

    if (error) {
      if (isMissingTable(error)) return NOT_SET_UP
      console.error('[Lesson exceptions] Save error:', error)
      return NextResponse.json({ error: 'Failed to save the change' }, { status: 500 })
    }
    return NextResponse.json({ success: true, exception: data })
  } catch (error) {
    console.error('[Lesson exceptions] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE ?date=YYYY-MM-DD: put that date back to the usual weekly time.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId: bookingId } = await params
    const date = new URL(request.url).searchParams.get('date') || ''
    if (!DATE_RE.test(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

    const auth = await authorize(bookingId)
    if ('error' in auth) return auth.error

    const { error } = await auth.supabase
      .from('lesson_exceptions')
      .delete()
      .eq('booking_id', bookingId)
      .eq('original_date', date)

    if (error) {
      if (isMissingTable(error)) return NOT_SET_UP
      console.error('[Lesson exceptions] Delete error:', error)
      return NextResponse.json({ error: 'Failed to restore the lesson' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Lesson exceptions] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
