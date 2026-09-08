import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  loadRecital,
  loadParticipants,
  loadPerformances,
  hostDisplayName,
  resolveCaller,
  withoutEmail,
  RECORDINGS_BUCKET,
} from '@/lib/recital/server'
import { resolveSettings } from '@/types/recital.types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/recitals/[id] — full detail for the host or any participant. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { claims, isHost, user } = await resolveCaller(request, recital)
  const participants = await loadParticipants(id)
  const isMember = !!claims || (!!user && participants.some((p) => p.profile_id === user.id))
  if (!isHost && !isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [performances, hostName] = await Promise.all([loadPerformances(id), hostDisplayName(recital.host_id)])

  return NextResponse.json({
    recital: { ...recital, settings: resolveSettings(recital.settings) },
    hostName,
    participants: isHost ? participants : participants.map(withoutEmail),
    performances,
    isHost,
  })
}

/** PATCH /api/recitals/[id] — host edits details/settings. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim().slice(0, 120)
  if (typeof body.description === 'string') update.description = body.description.trim().slice(0, 2000) || null
  if (typeof body.scheduledAt === 'string') {
    const d = new Date(body.scheduledAt)
    if (!Number.isNaN(d.getTime())) update.scheduled_at = d.toISOString()
  }
  if (Number.isFinite(body.durationMinutes)) {
    update.duration_minutes = Math.min(480, Math.max(15, Math.round(body.durationMinutes)))
  }
  if (body.settings && typeof body.settings === 'object') {
    update.settings = resolveSettings({ ...resolveSettings(recital.settings), ...body.settings })
  }
  if (body.status === 'cancelled' && recital.status !== 'ended') update.status = 'cancelled'

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('recitals').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ recital: data })
}

/** DELETE /api/recitals/[id] — host deletes (cascades participants/program, removes recordings). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getSupabaseAdmin()

  // Remove recording files first; the rows cascade with the recital.
  const { data: recordings } = await admin.from('recital_recordings').select('storage_path').eq('recital_id', id)
  const paths = (recordings || []).map((r) => r.storage_path as string).filter(Boolean)
  if (paths.length > 0) {
    const { error: storageError } = await admin.storage.from(RECORDINGS_BUCKET).remove(paths)
    if (storageError) console.warn('[recitals] could not remove recording files:', storageError.message)
  }

  const { error } = await admin.from('recitals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
