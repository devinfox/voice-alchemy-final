import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isTagColor, isUuid, listTags, normalizeTagName } from '@/lib/email-tags'

export const dynamic = 'force-dynamic'

// PATCH /api/email-tags/[id]  { name?, color?, description? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = normalizeTagName(String(body.name || ''))
    if (!name) return NextResponse.json({ error: 'Give the tag a name' }, { status: 400 })
    patch.name = name
  }
  if (body.color !== undefined) {
    if (!isTagColor(body.color)) return NextResponse.json({ error: 'Unknown colour' }, { status: 400 })
    patch.color = body.color
  }
  if (body.description !== undefined) patch.description = body.description ? String(body.description).trim().slice(0, 500) : null
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const admin = getSupabaseAdmin()
  if (typeof patch.name === 'string') {
    const dup = (await listTags(admin)).find(t => t.id !== id && t.name.toLowerCase() === (patch.name as string).toLowerCase())
    if (dup) return NextResponse.json({ error: `A tag called "${dup.name}" already exists` }, { status: 409 })
  }

  const { data, error } = await admin
    .from('email_tags')
    .update(patch)
    .eq('id', id)
    .eq('is_deleted', false)
    .select('id, name, color, description, created_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/email-tags/[id] - remove the tag from everyone and any funnel hook
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  const admin = getSupabaseAdmin()

  // Assignments go with it (so counts stay honest) and funnels stop listening to it.
  const { error: unassignError } = await admin.from('email_contact_tags').delete().eq('tag_id', id)
  if (unassignError) return NextResponse.json({ error: unassignError.message }, { status: 500 })

  const { data: funnels } = await admin
    .from('email_funnels')
    .select('id, trigger_tag_ids, exit_tag_ids, complete_tag_ids')
    .or(`trigger_tag_ids.cs.{${id}},exit_tag_ids.cs.{${id}},complete_tag_ids.cs.{${id}}`)
  for (const f of funnels || []) {
    const strip = (arr: string[] | null) => (arr || []).filter(x => x !== id)
    await admin
      .from('email_funnels')
      .update({ trigger_tag_ids: strip(f.trigger_tag_ids), exit_tag_ids: strip(f.exit_tag_ids), complete_tag_ids: strip(f.complete_tag_ids) })
      .eq('id', f.id)
  }

  const { error } = await admin.from('email_tags').update({ is_deleted: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
