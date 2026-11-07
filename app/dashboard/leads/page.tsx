import type { Metadata } from 'next'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { DesktopOnly } from '@/components/desktop-only'
import { FUNNEL_TRIGGERS, type FunnelTriggerKey } from '@/lib/email-leads'
import { tagsForRecipients, type EmailTag } from '@/lib/email-tags'
import { LeadsTable, type LeadRow } from './leads-table'
import { ImportLeads } from './import-leads'

export const metadata: Metadata = { title: 'Leads', description: 'Your Voice Alchemy Academy community, from website signups to imported contacts.' }
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
  csv_import: 'Imported from CSV',
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

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams
  const page = Math.max(1, Math.floor(Number(params.page) || 1))
  const pageSize = 500
  const admin = getSupabaseAdmin()

  const [{ data: leads, count: totalLeads }, { data: funnels }, { data: phases }] = await Promise.all([
    admin.from('email_leads').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize - 1),
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

  // Contact tags. Tolerates migration 20261107000001_email_tags.sql not being applied.
  let tagsByLead = new Map<string, EmailTag[]>()
  let tagsError: string | null = null
  try {
    tagsByLead = (await tagsForRecipients(admin, { leadIds })).leads
  } catch (e) {
    tagsError = e instanceof Error ? e.message : 'Tags are unavailable'
  }

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
      if (l.is_unsubscribed) note = 'Not eligible for marketing emails.'
      else if (type === 'csv_import') note = 'Imported into your directory. No funnel started.'
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
      sourceLabel: SOURCE_LABELS[(l.source as string) || ''] || (type === 'csv_import' ? (l.source as string || 'CSV import') : humanise(l.source as string | null)),
      page: typeof meta.page === 'string' ? meta.page : null,
      type,
      typeLabel: TYPE_LABELS[type] || humanise(type),
      createdAt: l.created_at as string,
      updatedAt: (l.updated_at as string) || (l.created_at as string),
      hasAccount: !!l.profile_id,
      unsubscribed: !!l.is_unsubscribed,
      tags: (tagsByLead.get(l.id as string) || []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2">
            <UserPlus className="w-3.5 h-3.5" />
            <span>Voice Alchemy · Leads</span>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">Leads</h1>
              <p className="text-xs sm:text-sm text-gray-300 mt-1 max-w-2xl">
                Your singers and coaches, from website signups to imported contacts. See where they came from and follow their journey.
                <Link href="/dashboard/email-templates?tab=funnels" className="ml-2 text-[#CEB466] hover:underline">Manage funnels</Link>
              </p>
            </div>
          </div>
        </div>
        <ImportLeads />
        {(totalLeads || 0) > pageSize && <div className="flex items-center justify-between gap-3 text-sm text-gray-400">
          <p>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalLeads || 0)} of {(totalLeads || 0).toLocaleString()} leads. Filters apply to this page.</p>
          <nav aria-label="Lead pages" className="flex gap-4">
            {page > 1 && <Link className="text-[#CEB466] hover:underline" href={`/dashboard/leads?page=${page - 1}`}>Previous</Link>}
            {page * pageSize < (totalLeads || 0) && <Link className="text-[#CEB466] hover:underline" href={`/dashboard/leads?page=${page + 1}`}>Next</Link>}
          </nav>
        </div>}
        <LeadsTable
          key={rows.map(r => `${r.id}:${r.updatedAt}`).join('|')}
          rows={rows}
          funnels={(funnels || []).map((f) => ({ id: f.id as string, name: f.name as string, status: f.status as string }))}
          tagsError={tagsError}
        />
      </div>
    </DesktopOnly>
  )
}
