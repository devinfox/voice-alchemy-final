import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isMissingTagsTable, isTagColor, listTags, normalizeTagName, nextTagColor, TAGS_MIGRATION_HINT } from '@/lib/email-tags'

export const dynamic = 'force-dynamic'

function fail(message: string, status = 500) {
  return NextResponse.json({ error: message, hint: isMissingTagsTable(message) ? TAGS_MIGRATION_HINT : undefined }, { status })
}

// GET /api/email-tags?counts=true - every tag, alphabetical
export async function GET(request: NextRequest) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const withCounts = new URL(request.url).searchParams.get('counts') === 'true'
  try {
    const data = await listTags(getSupabaseAdmin(), { withCounts })
    return NextResponse.json({ data })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not load tags')
  }
}

// POST /api/email-tags  { name, color?, description? } - create a tag
export async function POST(request: NextRequest) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const name = normalizeTagName(String(body.name || ''))
  if (!name) return NextResponse.json({ error: 'Give the tag a name' }, { status: 400 })
  const description = body.description ? String(body.description).trim().slice(0, 500) : null

  const admin = getSupabaseAdmin()
  try {
    const existing = await listTags(admin)
    const dup = existing.find(t => t.name.toLowerCase() === name.toLowerCase())
    if (dup) return NextResponse.json({ error: `A tag called "${dup.name}" already exists`, data: dup }, { status: 409 })

    const color = isTagColor(body.color) ? body.color : nextTagColor(existing)
    const { data, error } = await admin
      .from('email_tags')
      .insert({ name, color, description, created_by: profile.id })
      .select('id, name, color, description, created_at')
      .single()
    if (error) return fail(error.message)
    return NextResponse.json({ data: { ...data, count: 0 } })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not create tag')
  }
}
