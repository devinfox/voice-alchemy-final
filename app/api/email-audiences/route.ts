import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const MIGRATION_HINT = 'Run migration 20260907000002_email_audiences.sql first.'

function missingTable(message: string) {
  return /email_audiences|audience_id/.test(message) && /does not exist|schema cache/i.test(message)
}

// GET /api/email-audiences - list user types in display order
export async function GET() {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const { data, error } = await getSupabaseAdmin()
    .from('email_audiences')
    .select('id, key, name, description, sort_order')
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message, hint: missingTable(error.message) ? MIGRATION_HINT : undefined }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// POST /api/email-audiences  { name, description? } - create a custom user type
export async function POST(request: NextRequest) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const description = body.description ? String(body.description).trim() : null
  if (!name) return NextResponse.json({ error: 'Give the user type a name' }, { status: 400 })
  if (name.length > 100) return NextResponse.json({ error: 'Name is too long (100 characters max)' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: existing } = await admin
    .from('email_audiences')
    .select('id')
    .eq('is_deleted', false)
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: `A user type called "${name}" already exists` }, { status: 409 })

  const { data: last } = await admin.from('email_audiences').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await admin
    .from('email_audiences')
    .insert({ name, description, sort_order: (last?.sort_order || 100) + 10 })
    .select('id, key, name, description, sort_order')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, hint: missingTable(error.message) ? MIGRATION_HINT : undefined }, { status: 500 })
  }
  return NextResponse.json({ data })
}
