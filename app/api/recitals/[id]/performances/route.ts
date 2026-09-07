import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadRecital, loadPerformances, resolveCaller, sanitizeName } from '@/lib/recital/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/recitals/[id]/performances — host adds a program entry. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const performerName = sanitizeName(body.performerName, '')
  const songTitle = typeof body.songTitle === 'string' ? body.songTitle.trim().slice(0, 160) : ''
  if (!performerName || !songTitle) {
    return NextResponse.json({ error: 'Performer and song are required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const existing = await loadPerformances(id)
  const nextIndex = existing.length ? Math.max(...existing.map((p) => p.order_index)) + 1 : 0

  let participantId: string | null = null
  if (typeof body.participantId === 'string') {
    const { data } = await admin
      .from('recital_participants')
      .select('id')
      .eq('id', body.participantId)
      .eq('recital_id', id)
      .maybeSingle()
    participantId = data?.id ?? null
  }

  const { data, error } = await admin
    .from('recital_performances')
    .insert({
      recital_id: id,
      participant_id: participantId,
      performer_name: performerName,
      song_title: songTitle,
      composer: typeof body.composer === 'string' ? body.composer.trim().slice(0, 160) || null : null,
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) || null : null,
      order_index: nextIndex,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ performance: data }, { status: 201 })
}

/** PATCH /api/recitals/[id]/performances — host reorders: { order: [ids...] } */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const order: unknown = body.order
  if (!Array.isArray(order) || !order.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: 'order must be an array of ids' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const existing = await loadPerformances(id)
  const known = new Set(existing.map((p) => p.id))
  const ordered = (order as string[]).filter((pid) => known.has(pid))

  await Promise.all(
    ordered.map((pid, index) =>
      admin.from('recital_performances').update({ order_index: index }).eq('id', pid).eq('recital_id', id)
    )
  )

  return NextResponse.json({ performances: await loadPerformances(id) })
}
