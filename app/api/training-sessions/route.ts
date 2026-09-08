import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthedUser, isTeachingRole } from '@/lib/training/server'
import { generateJoinCode } from '@/lib/recital/join-code'
import { resolveTrainingSettings } from '@/types/training.types'

export const dynamic = 'force-dynamic'

/** GET /api/training-sessions — sessions the current user hosts (RLS). */
export async function GET() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data || [] })
}

/** POST /api/training-sessions — create (teachers/admins). */
export async function POST(request: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeachingRole(user.role)) return NextResponse.json({ error: 'Only teachers can host sessions' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) || null : null
  const scheduledAt = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null
  const durationMinutes = Number.isFinite(body.durationMinutes) ? Math.min(480, Math.max(15, Math.round(body.durationMinutes))) : 60
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: 'A valid date and time is required' }, { status: 400 })

  const admin = getSupabaseAdmin()
  for (let attempt = 0; attempt < 5; attempt++) {
    const join_code = generateJoinCode()
    const { data: session, error } = await admin
      .from('training_sessions')
      .insert({
        host_id: user.id,
        title,
        description,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: durationMinutes,
        join_code,
        settings: resolveTrainingSettings(body.settings),
      })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') continue
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const [first, ...rest] = user.name.split(' ')
    await admin.from('training_session_participants').insert({
      session_id: session.id,
      profile_id: user.id,
      first_name: first || user.name,
      last_name: rest.join(' '),
      email: user.email,
      role: 'host',
      admitted_at: new Date().toISOString(),
    })
    return NextResponse.json({ session }, { status: 201 })
  }
  return NextResponse.json({ error: 'Could not allocate a join code' }, { status: 500 })
}
