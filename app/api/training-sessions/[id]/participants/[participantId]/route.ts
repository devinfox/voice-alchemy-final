import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadSession, resolveTrainingCaller } from '@/lib/training/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string; participantId: string }> }

/** PATCH — host: { admit: true } | { deny: true }; self or host: { left: boolean } */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, participantId } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { claims, isHost } = await resolveTrainingCaller(request, session)
  const isSelf = claims?.participantId === participantId
  if (!isSelf && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  const now = new Date().toISOString()
  if (isHost && body.admit === true) {
    update.admitted_at = now
    update.denied_at = null
  }
  if (isHost && body.deny === true) {
    update.denied_at = now
    update.admitted_at = null
  }
  if (body.left === true) update.left_at = now
  if (body.left === false) {
    update.left_at = null
    update.joined_at = now
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('training_session_participants')
    .update(update)
    .eq('id', participantId)
    .eq('session_id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ participant: data })
}

/** DELETE — host removes a person (invite or attendee). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id, participantId } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { isHost } = await resolveTrainingCaller(request, session)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getSupabaseAdmin()
  const { data: target } = await admin.from('training_session_participants').select('role').eq('id', participantId).eq('session_id', id).maybeSingle()
  if (target?.role === 'host') return NextResponse.json({ error: 'Cannot remove the host' }, { status: 400 })
  const { error } = await admin.from('training_session_participants').delete().eq('id', participantId).eq('session_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
