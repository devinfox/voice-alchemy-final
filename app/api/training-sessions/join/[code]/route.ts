import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  getAuthedUser,
  hostDisplayName,
  isSessionHost,
  loadSessionByCode,
  normalizeEmail,
  sanitizeName,
} from '@/lib/training/server'
import { normalizeJoinCode } from '@/lib/recital/join-code'
import { signRecitalSession } from '@/lib/recital/session-token'
import { resolveTrainingSettings, type TrainingJoinGrant } from '@/types/training.types'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ code: string }> }

/** GET — public summary for the lobby. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { code } = await params
  const session = await loadSessionByCode(normalizeJoinCode(code))
  if (!session || session.status === 'cancelled') return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const user = await getAuthedUser()
  const hostName = await hostDisplayName(session.host_id)
  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title,
      description: session.description,
      scheduled_at: session.scheduled_at,
      duration_minutes: session.duration_minutes,
      status: session.status,
      waitingRoom: resolveTrainingSettings(session.settings).waitingRoom,
    },
    hostName,
    viewer: user ? { name: user.name, email: user.email, isHost: isSessionHost(session, user) } : null,
  })
}

/**
 * POST — ask to join. Body: { firstName, lastName, email, participantId? }
 * Invited emails (and hosts) are admitted immediately; everyone else waits
 * unless the host turned the waiting room off.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params
  const session = await loadSessionByCode(normalizeJoinCode(code))
  if (!session || session.status === 'cancelled') return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status === 'ended') return NextResponse.json({ error: 'This session has ended' }, { status: 410 })

  const settings = resolveTrainingSettings(session.settings)
  const body = await request.json().catch(() => ({}))
  const user = await getAuthedUser()
  const isHost = isSessionHost(session, user)
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()

  const firstName = sanitizeName(body.firstName, user ? user.name.split(' ')[0] : '')
  const lastName = sanitizeName(body.lastName, user ? user.name.split(' ').slice(1).join(' ') : '')
  const email = normalizeEmail(body.email) ?? (user?.email ? user.email.toLowerCase() : null)
  if (!firstName) return NextResponse.json({ error: 'Please enter your first name' }, { status: 400 })
  if (!user && !email) return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 })

  // Find an existing row: by account, by remembered id, or by invited email.
  let existing: { id: string; role: string; invited: boolean; admitted_at: string | null; denied_at: string | null } | null = null
  if (user) {
    const { data } = await admin
      .from('training_session_participants')
      .select('id, role, invited, admitted_at, denied_at')
      .eq('session_id', session.id)
      .eq('profile_id', user.id)
      .maybeSingle()
    existing = data
  }
  if (!existing && typeof body.participantId === 'string') {
    const { data } = await admin
      .from('training_session_participants')
      .select('id, role, invited, admitted_at, denied_at')
      .eq('id', body.participantId)
      .eq('session_id', session.id)
      .maybeSingle()
    existing = data
  }
  if (!existing && email) {
    const { data } = await admin
      .from('training_session_participants')
      .select('id, role, invited, admitted_at, denied_at')
      .eq('session_id', session.id)
      .ilike('email', email)
      .maybeSingle()
    existing = data
  }

  const admitted = isHost || !settings.waitingRoom || !!existing?.invited || (!!existing?.admitted_at && !existing?.denied_at)
  let participantId: string

  if (existing) {
    participantId = existing.id
    await admin
      .from('training_session_participants')
      .update({
        first_name: firstName,
        last_name: lastName,
        email: email ?? undefined,
        profile_id: user?.id ?? undefined,
        role: isHost ? 'host' : existing.role,
        joined_at: now,
        left_at: null,
        admitted_at: admitted ? existing.admitted_at ?? now : existing.admitted_at,
      })
      .eq('id', existing.id)
  } else {
    const { data: created, error } = await admin
      .from('training_session_participants')
      .insert({
        session_id: session.id,
        profile_id: user?.id ?? null,
        first_name: firstName,
        last_name: lastName,
        email,
        role: isHost ? 'host' : 'attendee',
        joined_at: now,
        admitted_at: admitted ? now : null,
      })
      .select('id')
      .single()
    if (error || !created) return NextResponse.json({ error: error?.message || 'Join failed' }, { status: 500 })
    participantId = created.id
  }

  const role = isHost ? 'host' : 'attendee'
  const [token, hostName] = await Promise.all([
    signRecitalSession({ recitalId: session.id, participantId, role: isHost ? 'host' : 'audience' }),
    hostDisplayName(session.host_id),
  ])

  const grant: TrainingJoinGrant = {
    token,
    participantId,
    role,
    displayName: [firstName, lastName].filter(Boolean).join(' '),
    admitted,
    session: { ...session, settings },
    hostName,
  }
  return NextResponse.json(grant)
}
