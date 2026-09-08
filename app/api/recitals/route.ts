import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthedUser, isTeachingRole } from '@/lib/recital/server'
import { generateJoinCode } from '@/lib/recital/join-code'
import { resolveSettings } from '@/types/recital.types'

export const dynamic = 'force-dynamic'

/** GET /api/recitals — recitals visible to the current user (RLS decides). */
export async function GET() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recitals')
    .select('*, host:profiles!recitals_host_id_fkey(name, first_name, last_name)')
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = Record<string, unknown> & {
    host_id: string
    host?: { name: string | null; first_name: string | null; last_name: string | null } | null
  }
  const recitals = ((data || []) as Row[]).map(({ host, ...r }) => ({
    ...r,
    host_name: host?.name || [host?.first_name, host?.last_name].filter(Boolean).join(' ') || 'Host',
    is_host: r.host_id === user.id || user.role === 'admin',
  }))

  return NextResponse.json({ recitals })
}

/** POST /api/recitals — create a recital (teachers/admins). */
export async function POST(request: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeachingRole(user.role)) {
    return NextResponse.json({ error: 'Only teachers can host recitals' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : null
  const scheduledAt = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null
  const durationMinutes = Number.isFinite(body.durationMinutes) ? Math.min(480, Math.max(15, Math.round(body.durationMinutes))) : 90

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'A valid date and time is required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // Retry on the (very unlikely) join-code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const join_code = generateJoinCode()
    const { data: recital, error } = await admin
      .from('recitals')
      .insert({
        host_id: user.id,
        title,
        description,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: durationMinutes,
        join_code,
        settings: resolveSettings(body.settings),
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') continue
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // The host is always a participant row so the program can reference them.
    await admin.from('recital_participants').insert({
      recital_id: recital.id,
      profile_id: user.id,
      display_name: user.name,
      email: user.email,
      role: 'host',
    })

    return NextResponse.json({ recital }, { status: 201 })
  }

  return NextResponse.json({ error: 'Could not allocate a join code' }, { status: 500 })
}
