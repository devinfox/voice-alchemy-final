import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadSession, resolveTrainingCaller } from '@/lib/training/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

/** POST — host: { action: 'start' | 'end' } */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { isHost } = await resolveTrainingCaller(request, session)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()
  if (body.action === 'start') {
    if (session.status === 'ended') return NextResponse.json({ error: 'Session already ended' }, { status: 400 })
    await admin.from('training_sessions').update({ status: 'live', started_at: session.started_at ?? now }).eq('id', id)
  } else if (body.action === 'end') {
    await admin.from('training_sessions').update({ status: 'ended', ended_at: now }).eq('id', id)
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  return NextResponse.json({ session: await loadSession(id) })
}

/** GET — durable status for token holders. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { claims, isHost } = await resolveTrainingCaller(request, session)
  if (!claims && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ session })
}
