import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Play,
  Pause,
  Users,
  Mail,
  Eye,
  MousePointerClick,
  Clock,
  Calendar,
  CheckCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { FunnelDetailClient } from './funnel-detail-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FunnelDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const { id } = await params

  if (!currentUser) {
    redirect('/login')
  }

  // Fetch funnel with phases and enrollments
  const { data: funnel, error } = await supabase
    .from('email_funnels')
    .select(`
      *,
      phases:email_funnel_phases(
        *,
        template:email_templates(id, name, subject)
      ),
      enrollments:email_funnel_enrollments(
        *,
        lead:leads(id, first_name, last_name, email),
        contact:contacts(id, first_name, last_name, email)
      )
    `)
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !funnel) {
    console.error('Error fetching funnel:', error)
    notFound()
  }

  // Sort phases by phase_order
  const sortedPhases = funnel.phases?.sort(
    (a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order
  )

  // Calculate stats
  const totalPhases = sortedPhases?.length || 0
  const openRate =
    funnel.total_emails_sent > 0
      ? ((funnel.total_opens / funnel.total_emails_sent) * 100).toFixed(1)
      : '0'
  const clickRate =
    funnel.total_emails_sent > 0
      ? ((funnel.total_clicks / funnel.total_emails_sent) * 100).toFixed(1)
      : '0'

  // Get status badge
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Draft' },
      active: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Active' },
      paused: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Paused' },
      archived: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Archived' },
    }
    const badge = badges[status] || badges.draft
    return (
      <span className={`px-3 py-1 text-sm rounded-full ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  // Stat card component
  function StatCard({
    label,
    value,
    icon: Icon,
    color,
    subtext,
  }: {
    label: string
    value: string | number
    icon: React.ComponentType<{ className?: string }>
    color: 'gray' | 'blue' | 'yellow' | 'green' | 'purple'
    subtext?: string
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
            {subtext && <p className="text-xs text-gray-500 mt-0.5">{subtext}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/dashboard/email-templates?tab=funnels"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Funnels
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">{funnel.name}</h1>
            {getStatusBadge(funnel.status)}
          </div>
          {funnel.description && <p className="text-gray-400 text-sm">{funnel.description}</p>}
          <p className="text-xs text-gray-500 mt-2">
            Created {new Date(funnel.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>

        <FunnelDetailClient
          funnelId={funnel.id}
          funnelName={funnel.name}
          currentStatus={funnel.status}
          currentTags={funnel.tags || []}
          autoEnrollEnabled={funnel.auto_enroll_enabled ?? true}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total Enrolled"
          value={funnel.total_enrolled}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Completed"
          value={funnel.total_completed}
          icon={CheckCircle}
          color="green"
          subtext={funnel.total_enrolled > 0 ? `${((funnel.total_completed / funnel.total_enrolled) * 100).toFixed(0)}% completion` : undefined}
        />
        <StatCard
          label="Emails Sent"
          value={funnel.total_emails_sent}
          icon={Mail}
          color="purple"
        />
        <StatCard
          label="Open Rate"
          value={`${openRate}%`}
          icon={Eye}
          color="yellow"
        />
        <StatCard
          label="Click Rate"
          value={`${clickRate}%`}
          icon={MousePointerClick}
          color="green"
        />
      </div>

      {/* Phases Timeline */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Funnel Phases</h2>

        <div className="space-y-4">
          {sortedPhases?.map((phase: {
            id: string
            phase_order: number
            name: string | null
            delay_days: number
            delay_hours: number
            emails_sent: number
            emails_opened: number
            emails_clicked: number
            template?: { id: string; name: string; subject: string } | null
          }, index: number) => {
            const phaseOpenRate =
              phase.emails_sent > 0
                ? ((phase.emails_opened / phase.emails_sent) * 100).toFixed(1)
                : '0'
            const phaseClickRate =
              phase.emails_sent > 0
                ? ((phase.emails_clicked / phase.emails_sent) * 100).toFixed(1)
                : '0'

            return (
              <div
                key={phase.id}
                className="relative flex items-start gap-4 pb-4"
              >
                {/* Timeline connector */}
                {index < (sortedPhases?.length || 0) - 1 && (
                  <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-white/10" />
                )}

                {/* Phase number */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/20 text-yellow-400 font-bold flex items-center justify-center">
                  {phase.phase_order}
                </div>

                {/* Phase content */}
                <div className="flex-1 glass-card p-4 border border-white/10">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-white">
                        {phase.name || `Phase ${phase.phase_order}`}
                      </h3>
                      {phase.template && (
                        <p className="text-sm text-gray-400 mt-1">
                          Template: {phase.template.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">
                        {index === 0
                          ? 'Immediate'
                          : `${phase.delay_days}d ${phase.delay_hours}h after previous`}
                      </span>
                    </div>
                  </div>

                  {/* Phase stats */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-purple-400" />
                      <span className="text-gray-400">{phase.emails_sent} sent</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-yellow-400" />
                      <span className="text-gray-400">{phaseOpenRate}% opened</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MousePointerClick className="w-4 h-4 text-green-400" />
                      <span className="text-gray-400">{phaseClickRate}% clicked</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Enrollments Table */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Enrolled Recipients</h2>
          <span className="text-sm text-gray-400">
            {funnel.enrollments?.length || 0} total
          </span>
        </div>

        {funnel.enrollments && funnel.enrollments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Recipient
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-center p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Current Phase
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Enrolled
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Next Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {funnel.enrollments.map((enrollment: {
                  id: string
                  status: string
                  current_phase: number
                  enrolled_at: string
                  next_email_scheduled_at: string | null
                  lead?: { id: string; first_name: string; last_name: string; email: string } | null
                  contact?: { id: string; first_name: string; last_name: string; email: string } | null
                }) => {
                  const recipient = enrollment.lead || enrollment.contact
                  const recipientName = recipient
                    ? `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.email
                    : 'Unknown'

                  const statusBadges: Record<string, { bg: string; text: string }> = {
                    active: { bg: 'bg-green-500/20', text: 'text-green-400' },
                    completed: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
                    paused: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
                    cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' },
                  }
                  const statusBadge = statusBadges[enrollment.status] || statusBadges.active

                  // Calculate days until next email
                  let nextEmailText = '—'
                  if (enrollment.next_email_scheduled_at && enrollment.status === 'active') {
                    const nextDate = new Date(enrollment.next_email_scheduled_at)
                    const now = new Date()
                    const diffMs = nextDate.getTime() - now.getTime()
                    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

                    if (diffDays <= 0) {
                      nextEmailText = 'Today'
                    } else if (diffDays === 1) {
                      nextEmailText = 'Tomorrow'
                    } else {
                      nextEmailText = `In ${diffDays} days`
                    }
                  }

                  return (
                    <tr key={enrollment.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3">
                        <div>
                          <p className="font-medium text-white">{recipientName}</p>
                          {recipient?.email && (
                            <p className="text-xs text-gray-500">{recipient.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge.bg} ${statusBadge.text}`}>
                          {enrollment.status.charAt(0).toUpperCase() + enrollment.status.slice(1)}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-400 font-bold text-sm">
                          {enrollment.current_phase}
                        </span>
                        <span className="text-gray-500 text-xs ml-2">
                          of {totalPhases}
                        </span>
                      </td>
                      <td className="p-3 text-gray-400 text-sm">
                        {new Date(enrollment.enrolled_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="p-3 text-gray-400 text-sm">
                        {nextEmailText}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No enrollments yet</h3>
            <p className="text-gray-400 text-sm">
              Enroll leads or contacts to start the funnel sequence.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
