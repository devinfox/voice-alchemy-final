import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { hostDisplayName, loadSession, loadTrainingParticipants, resolveTrainingCaller, stripEmail } from '@/lib/training/server'
import { resolveTrainingSettings } from '@/types/training.types'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { claims, isHost } = await resolveTrainingCaller(request, session)
  if (!isHost && !claims) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [participants, hostName] = await Promise.all([loadTrainingParticipants(id), hostDisplayName(session.host_id)])
  return NextResponse.json({
    session: { ...session, settings: resolveTrainingSettings(session.settings) },
    hostName,
    participants: isHost ? participants : participants.map(stripEmail),
    isHost,
  })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { isHost } = await resolveTrainingCaller(request, session)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim().slice(0, 120)
  if (typeof body.description === 'string') update.description = body.description.trim().slice(0, 2000) || null
  if (typeof body.scheduledAt === 'string') {
    const d = new Date(body.scheduledAt)
    if (!Number.isNaN(d.getTime())) update.scheduled_at = d.toISOString()
  }
  if (Number.isFinite(body.durationMinutes)) update.duration_minutes = Math.min(480, Math.max(15, Math.round(body.durationMinutes)))
  if (body.settings && typeof body.settings === 'object') {
    update.settings = resolveTrainingSettings({ ...resolveTrainingSettings(session.settings), ...body.settings })
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin().from('training_sessions').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { isHost } = await resolveTrainingCaller(request, session)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { error } = await getSupabaseAdmin().from('training_sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
