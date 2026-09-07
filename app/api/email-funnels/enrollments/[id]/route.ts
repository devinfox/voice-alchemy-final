import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

type Action = 'approve' | 'reject' | 'pause' | 'resume' | 'cancel'

// PATCH /api/email-funnels/enrollments/[id]  { action }
//   approve  pending_approval -> active (first phase scheduled from now)
//   reject   pending_approval -> rejected
//   pause    active -> paused (keeps its place in the sequence)
//   resume   paused -> active (next email goes out on the next cron run)
//   cancel   any -> cancelled
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const body = await request.json()
    const action = body.action as Action | undefined
    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { data: enrollment, error: fetchError } = await admin
      .from('email_funnel_enrollments')
      .select('*, funnel:email_funnels(id, name, total_enrolled, phases:email_funnel_phases(phase_order, delay_days, delay_hours))')
      .eq('id', id)
      .single()

    if (fetchError || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const updates: Record<string, unknown> = { updated_at: nowIso }

    switch (action) {
      case 'approve': {
        if (enrollment.status !== 'pending_approval') {
          return NextResponse.json({ error: 'Only pending enrollments can be approved' }, { status: 400 })
        }
        const phases = (enrollment.funnel?.phases || []).sort(
          (a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order
        )
        const first = phases[0]
        const delayMs = first ? (((first.delay_days || 0) * 24 + (first.delay_hours || 0)) * 60) * 60 * 1000 : 0
        Object.assign(updates, {
          status: 'active',
          current_phase: 1,
          enrolled_at: nowIso,
          enrolled_by: profile.id,
          approved_at: nowIso,
          approved_by: profile.id,
          next_email_scheduled_at: new Date(Date.now() + delayMs).toISOString(),
        })
        break
      }
      case 'reject':
        if (enrollment.status !== 'pending_approval') {
          return NextResponse.json({ error: 'Only pending enrollments can be rejected' }, { status: 400 })
        }
        Object.assign(updates, {
          status: 'rejected',
          rejected_at: nowIso,
          rejected_by: profile.id,
          next_email_scheduled_at: null,
        })
        break
      case 'pause':
        if (enrollment.status !== 'active') {
          return NextResponse.json({ error: 'Only active enrollments can be paused' }, { status: 400 })
        }
        Object.assign(updates, { status: 'paused', paused_at: nowIso })
        break
      case 'resume':
        if (enrollment.status !== 'paused') {
          return NextResponse.json({ error: 'Only paused enrollments can be resumed' }, { status: 400 })
        }
        Object.assign(updates, {
          status: 'active',
          paused_at: null,
          // Anything that came due while paused goes out on the next run
          next_email_scheduled_at: enrollment.next_email_scheduled_at && enrollment.next_email_scheduled_at > nowIso
            ? enrollment.next_email_scheduled_at
            : nowIso,
        })
        break
      case 'cancel':
        if (['cancelled', 'completed', 'rejected'].includes(enrollment.status)) {
          return NextResponse.json({ error: 'This enrollment is already finished' }, { status: 400 })
        }
        Object.assign(updates, {
          status: 'cancelled',
          cancelled_at: nowIso,
          cancel_reason: body.reason || 'Removed by teacher',
          next_email_scheduled_at: null,
        })
        break
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    // approved_* / rejected_* columns exist in the CRM schema but not in every
    // VAA database; strip them if the update fails on a missing column.
    let { error: updateError } = await admin.from('email_funnel_enrollments').update(updates).eq('id', id)
    if (updateError && /column .* does not exist/i.test(updateError.message)) {
      for (const col of ['approved_at', 'approved_by', 'rejected_at', 'rejected_by']) delete updates[col]
      ;({ error: updateError } = await admin.from('email_funnel_enrollments').update(updates).eq('id', id))
    }
    if (updateError) {
      console.error('[enrollments] update failed:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (action === 'approve' && enrollment.funnel) {
      await admin
        .from('email_funnels')
        .update({ total_enrolled: (enrollment.funnel.total_enrolled || 0) + 1 })
        .eq('id', enrollment.funnel_id)
    }

    return NextResponse.json({ success: true, enrollment_id: id, status: updates.status })
  } catch (error) {
    console.error('[enrollments] PATCH failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/email-funnels/enrollments/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const admin = getSupabaseAdmin()
    const { data: enrollment, error } = await admin
      .from('email_funnel_enrollments')
      .select('*, funnel:email_funnels(id, name, description, tags), logs:email_funnel_logs(*)')
      .eq('id', id)
      .single()

    if (error || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    let student: { id: string; first_name: string | null; last_name: string | null; name: string | null; email: string | null; is_lead?: boolean } | null = null
    if (enrollment.lead_id) {
      const [{ data: p }, { data: u }] = await Promise.all([
        admin.from('profiles').select('id, first_name, last_name, name').eq('id', enrollment.lead_id).maybeSingle(),
        admin.from('users').select('id, email').eq('id', enrollment.lead_id).maybeSingle(),
      ])
      if (p || u) {
        student = {
          id: enrollment.lead_id,
          first_name: p?.first_name || null,
          last_name: p?.last_name || null,
          name: p?.name || null,
          email: u?.email || null,
        }
      }
    } else if (enrollment.contact_id) {
      // A website lead (email_leads) rather than an account
      const { data: l } = await admin.from('email_leads').select('id, first_name, last_name, email').eq('id', enrollment.contact_id).maybeSingle()
      if (l) student = { id: l.id, first_name: l.first_name, last_name: l.last_name, name: null, email: l.email, is_lead: true }
    }

    return NextResponse.json({ data: { ...enrollment, student } })
  } catch (error) {
    console.error('[enrollments] GET failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
