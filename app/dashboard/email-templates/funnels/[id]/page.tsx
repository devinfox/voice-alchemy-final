import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import type { EmailTemplate } from '@/types/database.types'
import { FunnelDetailClient } from './funnel-detail-client'
import { EnrollmentRowActions } from './enrollment-row-actions'
import { FunnelSteps, describeDelay, type FunnelStepLike } from '../../funnel-steps'
import { triggerLabel } from '@/lib/email-leads'
import { resolveAudienceId, type EmailAudience } from '@/lib/email-audiences'

interface PageProps {
  params: Promise<{ id: string }>
}

interface EnrollmentRow {
  id: string
  status: string
  current_phase: number
  enrolled_at: string
  next_email_scheduled_at: string | null
  lead_id?: string | null
  contact_id?: string | null
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  active: { text: 'In progress', cls: 'bg-green-500/20 text-green-400' },
  completed: { text: 'Finished', cls: 'bg-blue-500/20 text-blue-400' },
  paused: { text: 'Paused', cls: 'bg-yellow-500/20 text-yellow-400' },
  cancelled: { text: 'Removed', cls: 'bg-white/10 text-gray-400' },
  pending_approval: { text: 'Awaiting review', cls: 'bg-amber-500/20 text-amber-400' },
  rejected: { text: 'Rejected', cls: 'bg-white/10 text-gray-500' },
}

function nextEmailText(e: EnrollmentRow): string {
  if (e.status === 'paused') return 'Paused'
  if (e.status !== 'active' || !e.next_email_scheduled_at) return '—'
  const diffMs = new Date(e.next_email_scheduled_at).getTime() - Date.now()
  if (diffMs <= 0) return 'Next delivery run'
  const hours = Math.ceil(diffMs / (1000 * 60 * 60))
  if (hours < 24) return `In ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.ceil(hours / 24)
  return days === 1 ? 'Tomorrow' : `In ${days} days`
}

export default async function FunnelDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const { id } = await params

  if (!currentUser) {
    redirect('/login')
  }

  const { data: funnel, error } = await supabase
    .from('email_funnels')
    .select(`
      *,
      phases:email_funnel_phases(*, template:email_templates(id, name, subject)),
      enrollments:email_funnel_enrollments(*)
    `)
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !funnel) {
    console.error('Error fetching funnel:', error)
    notFound()
  }

  const { data: templates } = await supabase
    .from('email_templates')
    .select('*')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('name', { ascending: true })

  // User types (tolerates the audiences migration not being applied yet)
  const { data: audienceRows } = await supabase
    .from('email_audiences')
    .select('id, key, name, description, sort_order')
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
  const audiences = (audienceRows || []) as EmailAudience[]
  const audienceName = audiences.find((a) => a.id === resolveAudienceId(funnel, audiences))?.name || null

  const steps = ((funnel.phases || []) as FunnelStepLike[]).sort((a, b) => a.phase_order - b.phase_order)
  const enrollments = ((funnel.enrollments || []) as EnrollmentRow[]).sort(
    (a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime()
  )

  // Two kinds of recipient: account holders (lead_id = profiles.id, email in
  // the users mirror) and website leads (contact_id = email_leads.id).
  const accountIds = enrollments.filter((e) => !e.contact_id && e.lead_id).map((e) => e.lead_id as string)
  const leadIds = enrollments.map((e) => e.contact_id).filter(Boolean) as string[]
  const recipientMap: Record<string, { name: string; email: string | null; isLead: boolean }> = {}
  if (accountIds.length > 0) {
    const [{ data: profiles }, { data: userRows }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, name').in('id', accountIds),
      supabase.from('users').select('id, email').in('id', accountIds),
    ])
    const emailById = new Map((userRows || []).map((u) => [u.id, u.email as string | null]))
    for (const p of profiles || []) {
      recipientMap[p.id] = {
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.name || emailById.get(p.id) || 'Unknown',
        email: emailById.get(p.id) || null,
        isLead: false,
      }
    }
  }
  if (leadIds.length > 0) {
    // email_leads arrives with migration 20260907000001; tolerate its absence
    const { data: leads } = await supabase.from('email_leads').select('id, first_name, last_name, email').in('id', leadIds)
    for (const l of leads || []) {
      recipientMap[l.id] = {
        name: `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email || 'Website lead',
        email: l.email || null,
        isLead: true,
      }
    }
  }

  const inProgress = enrollments.filter((e) => e.status === 'active').length
  const finished = enrollments.filter((e) => e.status === 'completed').length
  const sent = funnel.total_emails_sent || 0
  const openRate = sent > 0 ? Math.round(((funnel.total_opens || 0) / sent) * 100) : null

  return (
    <div className="space-y-6 max-w-6xl">
      <Link
        href="/dashboard/email-templates?tab=funnels"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All funnels
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">{funnel.name}</h1>
          {funnel.description && <p className="text-gray-400 text-sm mt-1 max-w-2xl">{funnel.description}</p>}
          <p className="text-xs text-gray-500 mt-2">
            {audienceName && <span className="text-gray-400">{audienceName} · </span>}
            {inProgress} in progress · {finished} finished · {sent} emails sent
            {openRate !== null && ` · ${openRate}% opened`}
          </p>
          {triggerLabel(funnel.trigger_key) && (
            <p className="text-xs text-violet-300/90 mt-1">
              Starts automatically when: {triggerLabel(funnel.trigger_key)}
            </p>
          )}
        </div>
        <FunnelDetailClient
          funnel={{
            id: funnel.id,
            name: funnel.name,
            description: funnel.description,
            status: funnel.status,
            tags: funnel.tags || [],
            auto_enroll_enabled: funnel.auto_enroll_enabled ?? false,
            trigger_key: funnel.trigger_key ?? null,
            audience_id: funnel.audience_id ?? null,
            phases: steps.map((p) => ({
              id: p.id,
              name: p.name,
              template_id: (p as FunnelStepLike & { template_id: string | null }).template_id,
              delay_days: p.delay_days,
              delay_hours: p.delay_hours,
            })),
          }}
          templates={(templates as EmailTemplate[]) || []}
          audiences={audiences}
        />
      </div>

      {/* Steps */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">What this funnel sends</h2>
        <FunnelSteps steps={steps} />
        {steps.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm text-gray-400">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-baseline gap-2">
                <span className="text-yellow-400 font-semibold w-4 text-right">{i + 1}.</span>
                <span>
                  <span className="text-white">{s.template?.name || s.name || `Step ${i + 1}`}</span>
                  <span className="text-gray-500"> · {describeDelay(s, i === 0)}</span>
                  {(s as FunnelStepLike & { emails_sent?: number }).emails_sent
                    ? <span className="text-gray-600"> · sent {(s as FunnelStepLike & { emails_sent?: number }).emails_sent}</span>
                    : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Students */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">People in this funnel</h2>
          <span className="text-sm text-gray-500">{enrollments.length} total</span>
        </div>

        {enrollments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left p-3 font-medium">Student</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Step</th>
                  <th className="text-left p-3 font-medium">Next email</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {enrollments.map((e) => {
                  const student = recipientMap[(e.contact_id || e.lead_id) as string]
                  const badge = STATUS_LABEL[e.status] || STATUS_LABEL.active
                  return (
                    <tr key={e.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-white flex items-center gap-2">
                          {student?.name || 'Unknown'}
                          {student?.isLead && (
                            <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-violet-500/20 text-violet-300">Website lead</span>
                          )}
                        </p>
                        {student?.email && <p className="text-xs text-gray-500">{student.email}</p>}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${badge.cls}`}>{badge.text}</span>
                      </td>
                      <td className="p-3 text-sm text-gray-300">
                        {e.status === 'completed' ? 'Done' : `${Math.min(e.current_phase, steps.length)} of ${steps.length}`}
                      </td>
                      <td className="p-3 text-sm text-gray-400">{nextEmailText(e)}</td>
                      <td className="p-3">
                        <EnrollmentRowActions enrollmentId={e.id} status={e.status} studentName={student?.name || 'this student'} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10">
            <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {funnel.status === 'active'
                ? 'No students yet. Use “Add students” to start the sequence for someone.'
                : 'Turn the funnel on, then add students to start the sequence.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
