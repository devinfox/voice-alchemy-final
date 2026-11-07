import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { enrollInFunnel, type EnrollRecipient } from '@/lib/email-leads'
import { isUuid, recipientsForTags, tagsForRecipients } from '@/lib/email-tags'

// Recipient columns on email_funnel_enrollments are named lead_id/contact_id
// (schema ported from the CRM). lead_id holds a profiles.id (email in the
// `users` mirror); contact_id holds an email_leads.id (website lead).

// POST /api/email-funnels/enroll
//   { funnel_id, student_ids?: [], website_lead_ids?: [], tag_ids?: [] }
// Enrolls accounts and/or website leads in an active funnel. `tag_ids`
// expands to everyone carrying any of those tags. The first phase is
// scheduled from now using that phase's delay; the email-queue cron sends.
export async function POST(request: NextRequest) {
  try {
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const body = await request.json()
    const funnelId: string | undefined = body.funnel_id
    const studentIds = new Set<string>(((body.student_ids || body.lead_ids || []) as unknown[]).filter(isUuid))
    const websiteLeadIds = new Set<string>(((body.website_lead_ids || []) as unknown[]).filter(isUuid))
    const tagIds: string[] = Array.isArray(body.tag_ids) ? body.tag_ids.filter(isUuid) : []

    if (!funnelId) {
      return NextResponse.json({ error: 'funnel_id is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    if (tagIds.length > 0) {
      const tagged = await recipientsForTags(admin, tagIds)
      tagged.profileIds.forEach(id => studentIds.add(id))
      tagged.leadIds.forEach(id => websiteLeadIds.add(id))
    }
    if (studentIds.size === 0 && websiteLeadIds.size === 0) {
      return NextResponse.json({ error: tagIds.length > 0 ? 'Nobody carries those tags yet' : 'Select at least one person' }, { status: 400 })
    }

    const { data: funnel, error: funnelError } = await admin
      .from('email_funnels')
      .select('id, name, status, total_enrolled, phases:email_funnel_phases(id, phase_order, delay_days, delay_hours, template_id)')
      .eq('id', funnelId)
      .eq('is_deleted', false)
      .single()

    if (funnelError || !funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
    }
    if (funnel.status !== 'active') {
      return NextResponse.json({ error: 'Activate the funnel before enrolling people' }, { status: 400 })
    }

    const phases = (funnel.phases || []).sort(
      (a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order
    )
    if (phases.length === 0) {
      return NextResponse.json({ error: 'This funnel has no phases yet' }, { status: 400 })
    }
    if (phases.some((p: { template_id: string | null }) => !p.template_id)) {
      return NextResponse.json({ error: 'Every phase needs a template before people can be enrolled' }, { status: 400 })
    }

    // Only people with an email address can be enrolled
    const recipients: EnrollRecipient[] = []
    let skippedNoEmail = 0
    let skippedUnsubscribed = 0
    if (studentIds.size > 0) {
      const { data: userRows } = await admin.from('users').select('id, email').in('id', [...studentIds])
      const withEmail = new Set((userRows || []).filter(u => !!u.email).map(u => u.id))
      for (const id of studentIds) {
        if (withEmail.has(id)) recipients.push({ profileId: id })
        else skippedNoEmail++
      }
    }
    if (websiteLeadIds.size > 0) {
      const { data: leadRows } = await admin.from('email_leads').select('id, email, is_unsubscribed').in('id', [...websiteLeadIds])
      const byId = new Map((leadRows || []).map(l => [l.id, l]))
      for (const id of websiteLeadIds) {
        const lead = byId.get(id)
        if (!lead?.email) skippedNoEmail++
        else if (lead.is_unsubscribed) skippedUnsubscribed++
        else recipients.push({ leadId: id })
      }
    }

    const funnelForEnroll = { ...funnel, phases }
    let enrolled = 0
    let alreadyEnrolled = 0
    let firstSendAt: string | undefined
    const enrollmentIds: string[] = []
    for (const r of recipients) {
      const result = await enrollInFunnel(admin, funnelForEnroll, r, { via: 'manual', enrolledBy: profile.id })
      if (result.enrolled) {
        enrolled++
        firstSendAt = firstSendAt || result.firstSendAt
        if (result.enrollmentId) enrollmentIds.push(result.enrollmentId)
      } else if (result.reason === 'Already in this funnel') {
        alreadyEnrolled++
      }
    }

    if (enrolled === 0) {
      return NextResponse.json({
        success: true,
        enrolled: 0,
        skipped_already_enrolled: alreadyEnrolled,
        skipped_no_email: skippedNoEmail,
        skipped_unsubscribed: skippedUnsubscribed,
        message: alreadyEnrolled > 0
          ? 'Everyone selected is already in this funnel'
          : skippedUnsubscribed > 0
            ? 'Everyone selected has unsubscribed'
            : 'None of the selected people have an email address on file',
      })
    }

    return NextResponse.json({
      success: true,
      enrolled,
      skipped_already_enrolled: alreadyEnrolled,
      skipped_no_email: skippedNoEmail,
      skipped_unsubscribed: skippedUnsubscribed,
      first_send_at: firstSendAt,
      enrollment_ids: enrollmentIds,
    })
  } catch (error) {
    console.error('[email-funnels/enroll] unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/email-funnels/enroll?funnel_id=...&include_staff=true&include_leads=true
// Candidate list for the enroll modal: students (plus staff and website
// leads on request) with an email address, each with its tag ids and a flag
// when they are already in the funnel.
export async function GET(request: NextRequest) {
  try {
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const funnelId = searchParams.get('funnel_id')
    const includeStaff = searchParams.get('include_staff') === 'true'
    const includeLeads = searchParams.get('include_leads') === 'true'

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

    const leads = includeLeads
      ? (await admin
          .from('email_leads')
          .select('id, first_name, last_name, email, persona')
          .eq('is_unsubscribed', false)
          .order('created_at', { ascending: false })
          .limit(1000)).data || []
      : []

    const enrolledProfiles = new Set<string>()
    const enrolledLeads = new Set<string>()
    if (funnelId) {
      const { data: enrollments } = await admin
        .from('email_funnel_enrollments')
        .select('lead_id, contact_id')
        .eq('funnel_id', funnelId)
        .in('status', ['active', 'paused', 'pending_approval'])
      for (const e of enrollments || []) {
        if (e.lead_id) enrolledProfiles.add(e.lead_id)
        if (e.contact_id) enrolledLeads.add(e.contact_id)
      }
    }

    let tagMap = { leads: new Map<string, { id: string }[]>(), profiles: new Map<string, { id: string }[]>() }
    try {
      tagMap = await tagsForRecipients(admin, { profileIds: ids, leadIds: leads.map(l => l.id) })
    } catch {
      /* tags migration not applied: pickers just show no tags */
    }
    const tagIds = (list: { id: string }[] | undefined) => (list || []).map(t => t.id)

    const data = [
      ...(candidates || [])
        .map(c => ({ ...c, email: emailById.get(c.id) || null }))
        .filter(c => !!c.email)
        .map(c => ({ ...c, already_enrolled: enrolledProfiles.has(c.id), tag_ids: tagIds(tagMap.profiles.get(c.id)) })),
      ...leads
        .filter(l => !!l.email)
        .map(l => ({
          id: l.id,
          first_name: l.first_name,
          last_name: l.last_name,
          name: null,
          role: l.persona === 'coach' ? 'coach lead' : 'lead',
          email: l.email,
          kind: 'lead' as const,
          already_enrolled: enrolledLeads.has(l.id),
          tag_ids: tagIds(tagMap.leads.get(l.id)),
        })),
    ]

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
