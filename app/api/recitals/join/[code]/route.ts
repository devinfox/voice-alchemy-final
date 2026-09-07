import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  getAuthedUser,
  hostDisplayName,
  isHostOf,
  loadParticipants,
  loadPerformances,
  loadRecitalByCode,
  sanitizeName,
} from '@/lib/recital/server'
import { normalizeJoinCode } from '@/lib/recital/join-code'
import { signRecitalSession } from '@/lib/recital/session-token'
import { resolveSettings, type RecitalJoinGrant } from '@/types/recital.types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ code: string }> }

/** GET /api/recitals/join/[code] — public summary for the join screen. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { code } = await params
  const recital = await loadRecitalByCode(normalizeJoinCode(code))
  if (!recital || recital.status === 'cancelled') {
    return NextResponse.json({ error: 'Recital not found' }, { status: 404 })
  }
  const user = await getAuthedUser()
  const hostName = await hostDisplayName(recital.host_id)
  return NextResponse.json({
    recital: {
      id: recital.id,
      title: recital.title,
      description: recital.description,
      scheduled_at: recital.scheduled_at,
      duration_minutes: recital.duration_minutes,
      status: recital.status,
    },
    hostName,
    viewer: user ? { name: user.name, isHost: await isHostOf(recital, user) } : null,
  })
}

/**
 * POST /api/recitals/join/[code] — enter the recital.
 * Body: { displayName?: string, email?: string }
 * Logged-in users are matched to their account; guests get a fresh row.
 * Returns a session token for participant-scoped endpoints.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params
  const recital = await loadRecitalByCode(normalizeJoinCode(code))
  if (!recital || recital.status === 'cancelled') {
    return NextResponse.json({ error: 'Recital not found' }, { status: 404 })
  }
  if (recital.status === 'ended') {
    return NextResponse.json({ error: 'This recital has ended' }, { status: 410 })
  }

  const body = await request.json().catch(() => ({}))
  const user = await getAuthedUser()
  const isHost = await isHostOf(recital, user)
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()

  let participantId: string
  let displayName: string

  if (user) {
    displayName = sanitizeName(body.displayName, user.name)
    const { data: existing } = await admin
      .from('recital_participants')
      .select('id, role')
      .eq('recital_id', recital.id)
      .eq('profile_id', user.id)
      .maybeSingle()

    if (existing) {
      participantId = existing.id
      await admin
        .from('recital_participants')
        .update({ display_name: displayName, joined_at: now, left_at: null, role: isHost ? 'host' : existing.role })
        .eq('id', existing.id)
    } else {
      const { data: created, error } = await admin
        .from('recital_participants')
        .insert({
          recital_id: recital.id,
          profile_id: user.id,
          display_name: displayName,
          email: user.email,
          role: isHost ? 'host' : 'audience',
          joined_at: now,
        })
        .select('id')
        .single()
      if (error || !created) return NextResponse.json({ error: error?.message || 'Join failed' }, { status: 500 })
      participantId = created.id
    }
  } else {
    displayName = sanitizeName(body.displayName, '')
    if (!displayName) return NextResponse.json({ error: 'Please tell us your name' }, { status: 400 })
    const email = typeof body.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? body.email.trim().toLowerCase() : null

    // Returning guest (same browser) can reuse their row via a prior participantId.
    let reused: string | null = null
    if (typeof body.participantId === 'string') {
      const { data } = await admin
        .from('recital_participants')
        .select('id')
        .eq('id', body.participantId)
        .eq('recital_id', recital.id)
        .is('profile_id', null)
        .maybeSingle()
      if (data) {
        reused = data.id
        await admin
          .from('recital_participants')
          .update({ display_name: displayName, email: email ?? undefined, joined_at: now, left_at: null })
          .eq('id', data.id)
      }
    }

    if (reused) {
      participantId = reused
    } else {
      const { data: created, error } = await admin
        .from('recital_participants')
        .insert({
          recital_id: recital.id,
          display_name: displayName,
          email,
          role: 'audience',
          joined_at: now,
        })
        .select('id')
        .single()
      if (error || !created) return NextResponse.json({ error: error?.message || 'Join failed' }, { status: 500 })
      participantId = created.id
    }
  }

  const role = isHost ? 'host' : 'audience'
  const [token, performances, participants, hostName] = await Promise.all([
    signRecitalSession({ recitalId: recital.id, participantId, role }),
    loadPerformances(recital.id),
    loadParticipants(recital.id),
    hostDisplayName(recital.host_id),
  ])

  const grant: RecitalJoinGrant = {
    token,
    participantId,
    role,
    displayName,
    recital: { ...recital, settings: resolveSettings(recital.settings) },
    hostName,
    performances,
    participants: participants.map(({ email: _e, ...rest }) => rest),
  }
  return NextResponse.json(grant)
}
