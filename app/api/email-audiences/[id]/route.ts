import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// PATCH /api/email-audiences/[id]  { name?, description?, sort_order? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    updates.name = name
  }
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim() : null
  if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order) || 0
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('email_audiences')
    .update(updates)
    .eq('id', id)
    .eq('is_deleted', false)
    .select('id, key, name, description, sort_order')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'User type not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/email-audiences/[id] - soft delete; its funnels become unassigned
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const { id } = await params
  const admin = getSupabaseAdmin()
  const { data: audience } = await admin.from('email_audiences').select('id, key').eq('id', id).eq('is_deleted', false).maybeSingle()
  if (!audience) return NextResponse.json({ error: 'User type not found' }, { status: 404 })

  await admin.from('email_funnels').update({ audience_id: null }).eq('audience_id', id)
  const { error } = await admin.from('email_audiences').update({ is_deleted: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
