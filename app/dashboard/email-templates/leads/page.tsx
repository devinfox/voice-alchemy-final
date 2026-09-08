import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { DesktopOnly } from '@/components/desktop-only'
import { FUNNEL_TRIGGERS, type FunnelTriggerKey } from '@/lib/email-leads'
import { LeadsTable, type LeadRow } from './leads-table'

export const metadata: Metadata = { title: 'Leads', description: 'Everyone who left an email on the website, where they came from, and which funnel picked them up.' }
export const dynamic = 'force-dynamic'

// Website form names → plain labels. Anything unknown is humanised.
const SOURCE_LABELS: Record<string, string> = {
  'student-popup': 'Homepage popup · singers',
  'demo-popup': 'Homepage popup · coaches',
  'exit-intent': 'Exit-intent popup',
  'exit-intent-soft': 'Exit-intent popup (soft)',
  'final-cta': 'Bottom-of-page form',
  'coach-section': 'Coach section form',
  'mentorship-application': 'Mentorship application',
  landing: 'Landing page form',
}

const TYPE_LABELS: Record<string, string> = {
  lead: 'Left an email',
  lead_details: 'Left an email + details',
  teacher_demo: 'Requested a demo',
  teacher_demo_details: 'Requested a demo + details',
  mentorship_application: 'Applied for mentorship',
}

function humanise(s: string | null | undefined): string {
  if (!s) return 'Unknown'
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Which trigger the CRM would fire for this lead's latest submission. */
function triggerFor(type: string | null, persona: string): FunnelTriggerKey | null {
  switch (type) {
    case 'lead':
      return persona === 'coach' ? 'teacher_lead' : 'student_lead'
    case 'teacher_demo':
      return 'teacher_demo'
    case 'mentorship_application':
      return 'mentorship_application'
    default:
      return null
  }
}

export default async function LeadsPage() {
  const admin = getSupabaseAdmin()

  const [{ data: leads }, { data: funnels }, { data: phases }] = await Promise.all([
    admin.from('email_leads').select('*').order('created_at', { ascending: false }).limit(500),
    admin.from('email_funnels').select('id, name, trigger_key, status').eq('is_deleted', false),
    admin.from('email_funnel_phases').select('funnel_id'),
  ])

  const leadIds = (leads || []).map((l) => l.id as string)
  const { data: enrollments } = leadIds.length
    ? await admin
        .from('email_funnel_enrollments')
        .select('id, contact_id, funnel_id, status, current_phase, enrolled_via, enrolled_at, next_email_scheduled_at, last_email_sent_at, cancel_reason')
        .in('contact_id', leadIds)
        .order('enrolled_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>> }

  const enrollmentIds = (enrollments || []).map((e) => e.id as string)
  const { data: logs } = enrollmentIds.length
    ? await admin.from('email_funnel_logs').select('enrollment_id, status, sent_at, error_message').in('enrollment_id', enrollmentIds)
    : { data: [] as Array<Record<string, unknown>> }

  const funnelById = new Map((funnels || []).map((f) => [f.id as string, f]))
  const funnelByTrigger = new Map((funnels || []).filter((f) => f.trigger_key).map((f) => [f.trigger_key as string, f]))
  const phaseCount = new Map<string, number>()
  for (const p of phases || []) phaseCount.set(p.funnel_id as string, (phaseCount.get(p.funnel_id as string) || 0) + 1)
  const sentByEnrollment = new Map<string, { sent: number; lastError: string | null }>()
  for (const l of logs || []) {
    const id = l.enrollment_id as string
    const cur = sentByEnrollment.get(id) || { sent: 0, lastError: null }
    if (l.sent_at) cur.sent += 1
    if (l.error_message) cur.lastError = l.error_message as string
    sentByEnrollment.set(id, cur)
  }
  const latestEnrollmentByLead = new Map<string, Record<string, unknown>>()
  for (const e of enrollments || []) {
    const id = e.contact_id as string
    if (!latestEnrollmentByLead.has(id)) latestEnrollmentByLead.set(id, e)
  }
  const triggerLabel = new Map(FUNNEL_TRIGGERS.map((t) => [t.key, t.label]))

  const rows: LeadRow[] = (leads || []).map((l) => {
    const persona = (l.persona as string) || 'singer'
    const type = (l.last_type as string | null) || 'lead'
    const meta = (l.metadata || {}) as Record<string, unknown>
    const e = latestEnrollmentByLead.get(l.id as string)
    const funnel = e ? funnelById.get(e.funnel_id as string) : undefined
    const trigger = triggerFor(type, persona)
    const wouldBe = trigger ? funnelByTrigger.get(trigger) : undefined

    let note: string | null = null
    if (!e) {
      if (l.is_unsubscribed) note = 'Unsubscribed, so no emails are sent.'
      else if (!trigger) note = 'Extra details only. Their earlier submission decides the funnel.'
      else if (!wouldBe) note = `No funnel is set to start on “${triggerLabel.get(trigger) || trigger}”.`
      else if (wouldBe.status !== 'active') note = `“${wouldBe.name}” is turned off, so nothing started.`
      else note = 'Not enrolled yet.'
    }

    return {
      id: l.id as string,
      name: [l.first_name, l.last_name].filter(Boolean).join(' ') || null,
      email: l.email as string,
      persona,
      source: (l.source as string | null) || null,
      sourceLabel: SOURCE_LABELS[(l.source as string) || ''] || humanise(l.source as string | null),
      page: typeof meta.page === 'string' ? meta.page : null,
      type,
      typeLabel: TYPE_LABELS[type] || humanise(type),
      createdAt: l.created_at as string,
      updatedAt: (l.updated_at as string) || (l.created_at as string),
      hasAccount: !!l.profile_id,
      unsubscribed: !!l.is_unsubscribed,
      enrollment: e && funnel
        ? {
            id: e.id as string,
            funnelId: funnel.id as string,
            funnelName: funnel.name as string,
            status: e.status as string,
            step: (e.current_phase as number) || 1,
            totalSteps: phaseCount.get(funnel.id as string) || 0,
            nextAt: (e.next_email_scheduled_at as string | null) || null,
            lastSentAt: (e.last_email_sent_at as string | null) || null,
            sent: sentByEnrollment.get(e.id as string)?.sent || 0,
            lastError: sentByEnrollment.get(e.id as string)?.lastError || null,
            via: (e.enrolled_via as string) || 'manual',
            cancelReason: (e.cancel_reason as string | null) || null,
          }
        : null,
      note,
    }
  })

  return (
    <DesktopOnly featureName="Leads">
      <div className="space-y-5 max-w-[1600px]">
        <div>
          <Link href="/dashboard/email-templates?tab=funnels" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#CEB466] transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Emails &amp; Funnels
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-[#CEB466]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Leads</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Everyone who left an email on the website, where they came from, and which funnel picked them up.
              </p>
            </div>
          </div>
        </div>
        <LeadsTable rows={rows} />
      </div>
    </DesktopOnly>
  )
}
