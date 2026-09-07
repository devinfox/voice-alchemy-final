import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadRecital, resolveCaller, sanitizeName } from '@/lib/recital/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; performanceId: string }> }

/** PATCH — host edits a program entry (name, song, composer, notes, participant, status). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, performanceId } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (typeof body.performerName === 'string') update.performer_name = sanitizeName(body.performerName, 'Performer')
  if (typeof body.songTitle === 'string' && body.songTitle.trim()) update.song_title = body.songTitle.trim().slice(0, 160)
  if (typeof body.composer === 'string') update.composer = body.composer.trim().slice(0, 160) || null
  if (typeof body.notes === 'string') update.notes = body.notes.trim().slice(0, 1000) || null
  if (body.participantId === null) update.participant_id = null
  if (typeof body.participantId === 'string') update.participant_id = body.participantId
  if (['queued', 'done', 'skipped'].includes(body.status)) {
    update.status = body.status
    if (body.status === 'queued') {
      update.started_at = null
      update.ended_at = null
    }
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('recital_performances')
    .update(update)
    .eq('id', performanceId)
    .eq('recital_id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ performance: data })
}

/** DELETE — host removes a program entry. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id, performanceId } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getSupabaseAdmin()
  if (recital.current_performance_id === performanceId) {
    await admin.from('recitals').update({ current_performance_id: null }).eq('id', id)
  }
  const { error } = await admin.from('recital_performances').delete().eq('id', performanceId).eq('recital_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
