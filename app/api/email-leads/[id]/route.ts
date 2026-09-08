import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireEmailAccess } from '@/lib/email-access-server'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/email-leads/[id] — remove a website lead.
 * Stops any funnel they are in (their send history goes with the enrollment)
 * and deletes the lead row. Julia-only, like the rest of the email tools.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  const { data: lead } = await admin.from('email_leads').select('id, email').eq('id', id).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Enrollments reference the lead by contact_id (no FK), so clear them first.
  const { error: enrollError } = await admin.from('email_funnel_enrollments').delete().eq('contact_id', id)
  if (enrollError) return NextResponse.json({ error: enrollError.message }, { status: 500 })

  const { error } = await admin.from('email_leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
