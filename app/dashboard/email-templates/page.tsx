import Link from 'next/link'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { EmailTemplatesClient } from './email-templates-client'
import { FunnelsClient } from './funnels-client'
import { FunnelDraftsClient } from './funnel-drafts-client'
import { Mail, GitBranch, Sparkles, ArrowRight, PenLine, ListOrdered, UserPlus } from 'lucide-react'
import { EmailFunnel, EmailTemplate } from '@/types/database.types'
import { DesktopOnly } from '@/components/desktop-only'
import { StarterPackPanel } from './starter-pack-panel'
import type { EmailAudience } from '@/lib/email-audiences'

interface PageProps {
  searchParams: Promise<{ tab?: string; edit?: string }>
}

export default async function EmailTemplatesPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const params = await searchParams
  const requestedTab = params.tab === 'drafts' ? 'suggested' : params.tab
  const activeTab = requestedTab === 'funnels' || requestedTab === 'suggested' ? requestedTab : 'emails'

  if (!currentUser) {
    redirect('/login')
  }

  const { data: templates, error: templatesError } = await supabase
    .from('email_templates')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  if (templatesError) console.error('Error fetching email templates:', templatesError)

  const { data: funnels, error: funnelsError } = await supabase
    .from('email_funnels')
    .select(`
      *,
      phases:email_funnel_phases(
        *,
        template:email_templates(id, name, subject)
      )
    `)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  if (funnelsError) console.error('Error fetching funnels:', funnelsError)

  const funnelsWithSortedPhases = funnels?.map(funnel => ({
    ...funnel,
    phases: funnel.phases?.sort((a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order),
  })) as EmailFunnel[] | undefined

  // Suggested enrollments awaiting review. lead_id holds a profiles.id; the
  // email lives in the `users` mirror table.
  const { data: pendingEnrollments } = await supabase
    .from('email_funnel_enrollments')
    .select(`id, funnel_id, lead_id, enrolled_at, match_reason, funnel:email_funnels(id, name, description, tags)`)
    .eq('status', 'pending_approval')
    .order('enrolled_at', { ascending: false })

  const pendingStudentIds = [...new Set((pendingEnrollments || []).map(e => e.lead_id).filter(Boolean) as string[])]
  const pendingStudentMap = new Map<string, { id: string; first_name: string | null; last_name: string | null; email: string | null }>()
  if (pendingStudentIds.length > 0) {
    const [{ data: studentProfiles }, { data: studentUsers }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, name').in('id', pendingStudentIds),
      supabase.from('users').select('id, email').in('id', pendingStudentIds),
    ])
    const emailById = new Map((studentUsers || []).map(u => [u.id, u.email as string | null]))
    for (const p of studentProfiles || []) {
      pendingStudentMap.set(p.id, {
        id: p.id,
        first_name: p.first_name || p.name?.split(' ')[0] || null,
        last_name: p.last_name || null,
        email: emailById.get(p.id) || null,
      })
    }
  }
  const pendingCount = pendingEnrollments?.length || 0

  // User types (audiences). The table arrives with migration 20260907000002;
  // until it is applied the Funnels tab shows a flat list with a notice.
  let audiences: EmailAudience[] = []
  let audiencesError: string | null = null
  const { data: audienceRows, error: audiencesQueryError } = await supabase
    .from('email_audiences')
    .select('id, key, name, description, sort_order')
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (audiencesQueryError) {
    audiencesError = /does not exist|schema cache/i.test(audiencesQueryError.message)
      ? 'run migration 20260907000002_email_audiences.sql to enable them.'
      : audiencesQueryError.message
  } else {
    audiences = (audienceRows || []) as EmailAudience[]
  }


  const templateCount = templates?.length || 0
  const funnelCount = funnelsWithSortedPhases?.length || 0

  const tab = (key: string, label: string, Icon: typeof Mail, count?: number) => (
    <Link
      href={`/dashboard/email-templates?tab=${key}`}
      className={`px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
        activeTab === key ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white hover:bg-white/10'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className={`text-xs ${activeTab === key ? 'text-yellow-300/80' : 'text-gray-500'}`}>{count}</span>
      )}
    </Link>
  )

  return (
    <DesktopOnly featureName="Emails & Funnels">
    <div className="space-y-5 max-w-[1600px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Emails &amp; Funnels</h1>
        <p className="text-gray-400 text-sm mt-1">
          {activeTab === 'funnels'
            ? 'A funnel sends a series of your emails to a student on a schedule.'
            : activeTab === 'suggested'
            ? 'Students the inbox assistant thinks belong in a funnel. Nothing sends until you approve.'
            : 'Reusable emails you can send to any student, or chain together in a funnel.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 glass-card rounded-lg w-fit">
        {tab('emails', 'Emails', Mail, templateCount)}
        {tab('funnels', 'Funnels', GitBranch, funnelCount)}
        {(pendingCount > 0 || activeTab === 'suggested') && tab('suggested', 'To review', Sparkles, pendingCount)}
        <Link
          href="/dashboard/email-templates/leads"
          className="px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/10"
        >
          <UserPlus className="w-4 h-4" />
          Leads
        </Link>
      </div>

      {/* Review banner (only when there is something to review) */}
      {pendingCount > 0 && activeTab !== 'suggested' && (
        <Link
          href="/dashboard/email-templates?tab=suggested"
          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm text-amber-300">
            <Sparkles className="w-4 h-4" />
            {pendingCount} suggested funnel {pendingCount === 1 ? 'enrollment' : 'enrollments'} waiting for your approval
          </span>
          <ArrowRight className="w-4 h-4 text-amber-400" />
        </Link>
      )}

      {/* How it works, until the first funnel exists */}
      {activeTab !== 'suggested' && funnelCount === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { Icon: PenLine, title: '1. Write an email', text: 'Build it once in the editor. Use {{first_name}} and it fills in for each student.' },
            { Icon: ListOrdered, title: '2. Put emails in a funnel', text: 'Pick the order and how long to wait between each one.' },
            { Icon: UserPlus, title: '3. Add students', text: 'Turn the funnel on and add students. The emails go out on schedule.' },
          ].map(({ Icon, title, text }) => (
            <div key={title} className="glass-card-subtle rounded-xl p-4 flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/15 text-yellow-400 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab !== 'suggested' && <StarterPackPanel tab={activeTab} />}

      {activeTab === 'emails' && (
        <EmailTemplatesClient
          templates={(templates as EmailTemplate[]) || []}
          currentUser={currentUser}
        />
      )}
      {activeTab === 'funnels' && (
        <FunnelsClient
          funnels={funnelsWithSortedPhases || []}
          templates={(templates as EmailTemplate[]) || []}
          currentUser={currentUser}
          audiences={audiences}
          audiencesError={audiencesError}
          initialEditId={params.edit || null}
        />
      )}
      {activeTab === 'suggested' && (
        <FunnelDraftsClient
          pendingEnrollments={(pendingEnrollments || [])
            .filter(e => e.funnel && e.lead_id && pendingStudentMap.has(e.lead_id))
            .map(e => ({
              id: e.id,
              funnel_id: e.funnel_id,
              student_id: e.lead_id || '',
              enrolled_at: e.enrolled_at,
              match_reason: e.match_reason || null,
              funnel: e.funnel as unknown as { id: string; name: string; description: string | null; tags: string[] },
              student: pendingStudentMap.get(e.lead_id!)!,
            }))}
        />
      )}
    </div>
    </DesktopOnly>
  )
}
