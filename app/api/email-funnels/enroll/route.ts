import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// Recipient columns on email_funnel_enrollments are named lead_id/contact_id
// (schema ported from the CRM). In this app lead_id always holds a
// profiles.id; the person's email lives in the `users` mirror table.

function phaseDelayMs(phase: { delay_days?: number | null; delay_hours?: number | null }): number {
  return (((phase.delay_days || 0) * 24 + (phase.delay_hours || 0)) * 60) * 60 * 1000
}

// POST /api/email-funnels/enroll  { funnel_id, student_ids: [] }
// Enrolls students in an active funnel. The first phase is scheduled from
// now using that phase's delay; the email-queue cron does the sending.
export async function POST(request: NextRequest) {
  try {
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const body = await request.json()
    const funnelId: string | undefined = body.funnel_id
    const studentIds: string[] = body.student_ids || body.lead_ids || []

    if (!funnelId) {
      return NextResponse.json({ error: 'funnel_id is required' }, { status: 400 })
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one student' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    const { data: funnel, error: funnelError } = await admin
      .from('email_funnels')
      .select('id, status, total_enrolled, phases:email_funnel_phases(id, phase_order, delay_days, delay_hours, template_id)')
      .eq('id', funnelId)
      .eq('is_deleted', false)
      .single()

    if (funnelError || !funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
    }
    if (funnel.status !== 'active') {
      return NextResponse.json({ error: 'Activate the funnel before enrolling students' }, { status: 400 })
    }

    const phases = (funnel.phases || []).sort(
      (a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order
    )
    if (phases.length === 0) {
      return NextResponse.json({ error: 'This funnel has no phases yet' }, { status: 400 })
    }
    if (phases.some((p: { template_id: string | null }) => !p.template_id)) {
      return NextResponse.json({ error: 'Every phase needs a template before students can be enrolled' }, { status: 400 })
    }

    // Only people with an email address can be enrolled
    const { data: userRows } = await admin.from('users').select('id, email').in('id', studentIds)
    const withEmail = new Set((userRows || []).filter(u => !!u.email).map(u => u.id))
    const noEmailIds = studentIds.filter(id => !withEmail.has(id))

    // Skip anyone already in the funnel (active, paused, or awaiting approval)
    const { data: existing } = await admin
      .from('email_funnel_enrollments')
      .select('lead_id')
      .eq('funnel_id', funnelId)
      .in('lead_id', studentIds)
      .in('status', ['active', 'paused', 'pending_approval'])
    const alreadyEnrolled = new Set((existing || []).map(e => e.lead_id))

    const newIds = studentIds.filter(id => withEmail.has(id) && !alreadyEnrolled.has(id))

    if (newIds.length === 0) {
      return NextResponse.json({
        success: true,
        enrolled: 0,
        skipped_already_enrolled: alreadyEnrolled.size,
        skipped_no_email: noEmailIds.length,
        message: alreadyEnrolled.size > 0
          ? 'Everyone selected is already in this funnel'
          : 'None of the selected students have an email address on file',
      })
    }

    const now = new Date()
    const firstSendAt = new Date(now.getTime() + phaseDelayMs(phases[0])).toISOString()

    const rows = newIds.map(id => ({
      funnel_id: funnelId,
      lead_id: id,
      status: 'active',
      current_phase: 1,
      enrolled_at: now.toISOString(),
      enrolled_by: profile.id,
      next_email_scheduled_at: firstSendAt,
    }))

    const { data: inserted, error: insertError } = await admin
      .from('email_funnel_enrollments')
      .insert(rows)
      .select()

    if (insertError) {
      console.error('[email-funnels/enroll] insert failed:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    await admin
      .from('email_funnels')
      .update({ total_enrolled: (funnel.total_enrolled || 0) + rows.length, updated_at: now.toISOString() })
      .eq('id', funnelId)

    return NextResponse.json({
      success: true,
      enrolled: rows.length,
      skipped_already_enrolled: alreadyEnrolled.size,
      skipped_no_email: noEmailIds.length,
      first_send_at: firstSendAt,
      enrollments: inserted,
    })
  } catch (error) {
    console.error('[email-funnels/enroll] unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/email-funnels/enroll?funnel_id=...&include_staff=true
// Candidate list for the enroll modal: students (plus staff on request) with
// an email address, flagged when they are already in the funnel.
export async function GET(request: NextRequest) {
  try {
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const funnelId = searchParams.get('funnel_id')
    const includeStaff = searchParams.get('include_staff') === 'true'

    const admin = getSupabaseAdmin()

    let query = admin
      .from('profiles')
      .select('id, first_name, last_name, name, role')
      .order('first_name', { ascending: true })
      .limit(1000)
    if (!includeStaff) query = query.eq('role', 'student')

    const { data: candidates, error: candidatesError } = await query
    if (candidatesError) {
      return NextResponse.json({ error: candidatesError.message }, { status: 500 })
    }

    const ids = (candidates || []).map(c => c.id)
    const emailById = new Map<string, string>()
    if (ids.length > 0) {
      const { data: userRows } = await admin.from('users').select('id, email').in('id', ids)
      for (const row of userRows || []) if (row.email) emailById.set(row.id, row.email)
    }

    const enrolledIds = new Set<string>()
    if (funnelId) {
      const { data: enrollments } = await admin
        .from('email_funnel_enrollments')
        .select('lead_id')
        .eq('funnel_id', funnelId)
        .in('status', ['active', 'paused', 'pending_approval'])
        .not('lead_id', 'is', null)
      for (const e of enrollments || []) enrolledIds.add(e.lead_id)
    }

    const data = (candidates || [])
      .map(c => ({ ...c, email: emailById.get(c.id) || null }))
      .filter(c => !!c.email)
      .map(c => ({ ...c, already_enrolled: enrolledIds.has(c.id) }))

    return NextResponse.json({
      data,
      total: data.length,
      already_enrolled: data.filter(c => c.already_enrolled).length,
    })
  } catch (error) {
    console.error('[email-funnels/enroll] GET failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
