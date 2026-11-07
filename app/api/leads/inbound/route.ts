import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  cancelEnrollments,
  enrollByTrigger,
  upsertLead,
  type FunnelTriggerKey,
} from '@/lib/email-leads'
import { normalizeEmail } from '@/lib/email-unsubscribe'
import { addTags, getOrCreateTags } from '@/lib/email-tags'

export const runtime = 'nodejs'

/**
 * POST /api/leads/inbound
 *
 * Receives every form submission from the marketing site (vaa-website
 * `lib/crm.ts`), stores the person as a lead, and enrolls them in the funnel
 * wired to the matching trigger. Authenticated with a shared secret:
 *
 *   Authorization: Bearer <LEAD_INTAKE_SECRET>
 *
 * Body: { type, email, first_name, last_name, persona, source, page?, metadata?, tags? }
 *   type: lead | lead_details | teacher_demo | teacher_demo_details | mentorship_application
 *   tags: optional tag names; unknown ones are created. Tags wired to a funnel
 *         start (or stop) it for this person, on top of the type trigger.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LEAD_TYPES = ['lead', 'lead_details', 'teacher_demo', 'teacher_demo_details', 'mentorship_application'] as const
type LeadType = (typeof LEAD_TYPES)[number]

function triggerFor(type: LeadType, persona: 'singer' | 'coach'): FunnelTriggerKey | null {
  switch (type) {
    case 'lead':
      return persona === 'coach' ? 'teacher_lead' : 'student_lead'
    case 'teacher_demo':
      return 'teacher_demo'
    case 'mentorship_application':
      return 'mentorship_application'
    default:
      return null // *_details submissions only enrich the lead
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.LEAD_INTAKE_SECRET
  const auth = request.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const type = (LEAD_TYPES as readonly string[]).includes(String(body.type)) ? (body.type as LeadType) : 'lead'
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 422 })
  }
  const persona: 'singer' | 'coach' = body.persona === 'coach' ? 'coach' : 'singer'
  const metadata = (body.metadata && typeof body.metadata === 'object') ? (body.metadata as Record<string, unknown>) : {}
  if (typeof body.page === 'string') metadata.page = body.page

  const admin = getSupabaseAdmin()

  try {
    const lead = await upsertLead(admin, {
      email,
      first_name: typeof body.first_name === 'string' ? body.first_name : null,
      last_name: typeof body.last_name === 'string' ? body.last_name : null,
      persona,
      source: typeof body.source === 'string' ? body.source : null,
      type,
      metadata,
    })

    // Link the lead to an existing account when the email matches, purely for
    // reporting. Having an account does NOT stop the lead funnel: anyone who
    // asks for the guide gets the guide.
    const { data: userRow } = await admin.from('users').select('id').ilike('email', email).limit(1).maybeSingle()
    if (userRow && !lead.profile_id) {
      await admin.from('email_leads').update({ profile_id: userRow.id }).eq('id', lead.id)
    }

    // Tags from the form (e.g. "Summer 2026 workshop"). Added before the type
    // trigger so a tag-driven funnel and a type-driven funnel can both start.
    let tagsApplied: string[] = []
    const tagNames = Array.isArray(body.tags) ? body.tags.filter((t: unknown): t is string => typeof t === 'string') : []
    if (tagNames.length > 0 && !lead.is_unsubscribed) {
      try {
        const tags = await getOrCreateTags(admin, tagNames)
        await addTags(admin, { leadIds: [lead.id] }, tags.map(t => t.id), { via: 'website' })
        tagsApplied = tags.map(t => t.name)
      } catch (tagErr) {
        // Tagging must never block the lead or its funnel.
        console.error('[leads/inbound] tagging failed:', tagErr)
      }
    }

    const trigger = triggerFor(type, persona)
    if (!trigger) {
      return NextResponse.json({ ok: true, lead_id: lead.id, enrolled: false, funnel: null, reason: 'details only', tags: tagsApplied })
    }
    if (lead.is_unsubscribed) {
      return NextResponse.json({ ok: true, lead_id: lead.id, enrolled: false, funnel: null, reason: 'unsubscribed' })
    }

    // A demo request supersedes the softer coach-lead track.
    if (trigger === 'teacher_demo') {
      await cancelEnrollments(admin, { leadId: lead.id }, 'Requested a demo', ['teacher_lead'])
    }

    const result = await enrollByTrigger(admin, trigger, { leadId: lead.id }, { via: 'website' })
    return NextResponse.json({
      ok: true,
      lead_id: lead.id,
      enrolled: result.enrolled,
      funnel: result.funnelName || null,
      reason: result.enrolled ? undefined : result.reason,
      first_send_at: result.firstSendAt,
      tags: tagsApplied,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[leads/inbound] failed:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
