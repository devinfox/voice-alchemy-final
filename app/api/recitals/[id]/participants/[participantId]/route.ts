import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadRecital, resolveCaller } from '@/lib/recital/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; participantId: string }> }

/** PATCH — the participant (by session token) or host updates soundcheck/left state. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, participantId } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { claims, isHost } = await resolveCaller(request, recital)
  const isSelf = claims?.participantId === participantId
  if (!isSelf && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (body.soundcheck && typeof body.soundcheck === 'object') {
    const s = body.soundcheck
    update.soundcheck = {
      rawPeakDb: Number.isFinite(s.rawPeakDb) ? s.rawPeakDb : null,
      verdict: typeof s.verdict === 'string' ? s.verdict.slice(0, 20) : null,
      trimDb: Number.isFinite(s.trimDb) ? s.trimDb : 0,
      deviceLabel: typeof s.deviceLabel === 'string' ? s.deviceLabel.slice(0, 120) : null,
      isBluetooth: !!s.isBluetooth,
      headphones: !!s.headphones,
      at: new Date().toISOString(),
    }
  }
  if (body.left === true) update.left_at = new Date().toISOString()
  if (body.left === false) {
    update.left_at = null
    update.joined_at = new Date().toISOString()
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('recital_participants')
    .update(update)
    .eq('id', participantId)
    .eq('recital_id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ participant: data })
}

/** DELETE — host removes a participant row (also unlinks their program entries). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id, participantId } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getSupabaseAdmin()
  const { data: target } = await admin
    .from('recital_participants')
    .select('role')
    .eq('id', participantId)
    .eq('recital_id', id)
    .maybeSingle()
  if (target?.role === 'host') return NextResponse.json({ error: 'Cannot remove the host' }, { status: 400 })

  const { error } = await admin.from('recital_participants').delete().eq('id', participantId).eq('recital_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
