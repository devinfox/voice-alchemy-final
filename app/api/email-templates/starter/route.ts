import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { STARTER_TEMPLATES, getStarterTemplate, starterTemplateRow } from '@/lib/email-templates/starter-templates'

// GET /api/email-templates/starter
// Lists the code-defined starter templates and whether each is installed
// (matched by name among non-deleted templates).
export async function GET() {
  const profile = await requireEmailAccess()
  if (!profile) {
    return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()
  const { data: existing, error } = await admin
    .from('email_templates')
    .select('id, name')
    .eq('is_deleted', false)
    .in('name', STARTER_TEMPLATES.map(t => t.name))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const byName = new Map((existing || []).map(t => [t.name, t.id]))
  return NextResponse.json({
    data: STARTER_TEMPLATES.map(t => ({
      key: t.key,
      name: t.name,
      subject: t.subject,
      description: t.description,
      category: t.category,
      installed_template_id: byName.get(t.name) || null,
    })),
  })
}

// POST /api/email-templates/starter  { key: 'vaa-intro' }
// Installs one starter template. Idempotent: returns the existing row when a
// non-deleted template with the same name already exists.
export async function POST(request: NextRequest) {
  const profile = await requireEmailAccess()
  if (!profile) {
    return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
  }

  let key = 'vaa-intro'
  try {
    const body = await request.json()
    if (body?.key) key = String(body.key)
  } catch {
    // no body: install the default intro template
  }

  const starter = getStarterTemplate(key)
  if (!starter) {
    return NextResponse.json({ error: `Unknown starter template: ${key}` }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: existing } = await admin
    .from('email_templates')
    .select('*')
    .eq('is_deleted', false)
    .eq('name', starter.name)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ data: existing, created: false })
  }

  const { data: created, error } = await admin
    .from('email_templates')
    .insert({ ...starterTemplateRow(starter), created_by: profile.id })
    .select()
    .single()

  if (error) {
    console.error('[email-templates/starter] insert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: created, created: true })
}
