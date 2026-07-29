import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { EmailTemplatesClient } from './email-templates-client'
import { FunnelsClient } from './funnels-client'
import { FunnelDraftsClient } from './funnel-drafts-client'
import { Mail, FileText, CheckCircle, Tag, GitBranch, Users, Play, Clock } from 'lucide-react'
import { EmailFunnel, EmailTemplate } from '@/types/database.types'
import { DesktopOnly } from '@/components/desktop-only'

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function EmailTemplatesPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const params = await searchParams
  const activeTab = params.tab || 'templates'

  if (!currentUser) {
    redirect('/login')
  }

  // Fetch all email templates
  const { data: templates, error: templatesError } = await supabase
    .from('email_templates')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (templatesError) {
    console.error('Error fetching email templates:', templatesError)
  }

  // Fetch all funnels with phases
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

  if (funnelsError) {
    console.error('Error fetching funnels:', funnelsError)
  }

  // Sort phases by phase_order
  const funnelsWithSortedPhases = funnels?.map(funnel => ({
    ...funnel,
    phases: funnel.phases?.sort((a: { phase_order: number }, b: { phase_order: number }) =>
      a.phase_order - b.phase_order
    )
  })) as EmailFunnel[] | undefined

  // Fetch pending enrollment drafts
  const { data: pendingEnrollments, error: pendingError } = await supabase
    .from('email_funnel_enrollments')
    .select(`
      id,
      funnel_id,
      lead_id,
      enrolled_at,
      match_reason,
      funnel:email_funnels(id, name, description, tags),
      lead:leads(id, first_name, last_name, email)
    `)
    .eq('status', 'pending_approval')
    .order('enrolled_at', { ascending: false })

  if (pendingError) {
    console.error('Error fetching pending enrollments:', pendingError)
  }

  const pendingCount = pendingEnrollments?.length || 0

  // Calculate template stats
  const totalTemplates = templates?.length || 0
  const activeTemplates = templates?.filter(t => t.is_active).length || 0

  // Count templates by category
  const categoryCount: Record<string, number> = {}
  templates?.forEach(t => {
    const cat = t.category || 'general'
    categoryCount[cat] = (categoryCount[cat] || 0) + 1
  })
  const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]

  // Calculate funnel stats
  const totalFunnels = funnelsWithSortedPhases?.length || 0
  const activeFunnels = funnelsWithSortedPhases?.filter(f => f.status === 'active').length || 0
  const totalEnrolled = funnelsWithSortedPhases?.reduce((sum, f) => sum + (f.total_enrolled || 0), 0) || 0

  // Stat card component
  function StatCard({
    label,
    value,
    icon: Icon,
    color,
  }: {
    label: string
    value: string | number
    icon: React.ComponentType<{ className?: string }>
    color: 'gray' | 'blue' | 'yellow' | 'green' | 'purple'
  }) {
    const colorClasses = {
      gray: 'bg-gray-500/20 text-gray-400',
      blue: 'bg-blue-500/20 text-blue-400',
      yellow: 'bg-yellow-500/20 text-yellow-400',
      green: 'bg-green-500/20 text-green-400',
      purple: 'bg-purple-500/20 text-purple-400',
    }

    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-sm text-gray-400">{label}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <DesktopOnly featureName="Email Templates">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
            Email Templates
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Create and manage reusable email templates and automated funnels
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center gap-1 p-1 glass-card rounded-lg w-fit">
        <a
          href="/dashboard/email-templates?tab=templates"
          className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'templates'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <Mail className="w-4 h-4" />
          Templates
        </a>
        <a
          href="/dashboard/email-templates?tab=funnels"
          className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'funnels'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Funnels
        </a>
        <a
          href="/dashboard/email-templates?tab=drafts"
          className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'drafts'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <Clock className="w-4 h-4" />
          Drafts
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 text-xs bg-amber-500 text-black rounded-full font-bold">
              {pendingCount}
            </span>
          )}
        </a>
      </div>

      {/* Stats Grid - Conditional based on tab */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Templates"
            value={totalTemplates}
            icon={Mail}
            color="blue"
          />
          <StatCard
            label="Active"
            value={activeTemplates}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            label="Inactive"
            value={totalTemplates - activeTemplates}
            icon={FileText}
            color="gray"
          />
          <StatCard
            label={topCategory ? `Most Used: ${topCategory[0].charAt(0).toUpperCase() + topCategory[0].slice(1).replace('_', ' ')}` : 'Categories'}
            value={topCategory ? topCategory[1] : 0}
            icon={Tag}
            color="purple"
          />
        </div>
      )}
      {activeTab === 'funnels' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Funnels"
            value={totalFunnels}
            icon={GitBranch}
            color="blue"
          />
          <StatCard
            label="Active Funnels"
            value={activeFunnels}
            icon={Play}
            color="green"
          />
          <StatCard
            label="Total Enrolled"
            value={totalEnrolled}
            icon={Users}
            color="yellow"
          />
          <StatCard
            label="Pending Drafts"
            value={pendingCount}
            icon={Clock}
            color="yellow"
          />
        </div>
      )}
      {activeTab === 'drafts' && (
        <div className="glass-card p-4 bg-amber-500/10 border border-amber-500/30">
          <p className="text-amber-400 text-sm">
            Review AI-suggested funnel enrollments. These leads won&apos;t receive emails until you approve.
          </p>
        </div>
      )}

      {/* Content based on active tab */}
      {activeTab === 'templates' && (
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
        />
      )}
      {activeTab === 'drafts' && (
        <FunnelDraftsClient
          pendingEnrollments={(pendingEnrollments || [])
            .filter(e => e.funnel && e.lead)
            .map(e => ({
              id: e.id,
              funnel_id: e.funnel_id,
              lead_id: e.lead_id || '',
              enrolled_at: e.enrolled_at,
              match_reason: e.match_reason || null,
              funnel: e.funnel as unknown as { id: string; name: string; description: string | null; tags: string[] },
              lead: e.lead as unknown as { id: string; first_name: string | null; last_name: string | null; email: string | null }
            }))}
        />
      )}
    </div>
    </DesktopOnly>
  )
}
