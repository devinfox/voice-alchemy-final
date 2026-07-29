'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, User, GitBranch, Clock, Sparkles, ArrowRight } from 'lucide-react'

interface PendingEnrollment {
  id: string
  funnel_id: string
  lead_id: string
  enrolled_at: string
  match_reason: string | null
  funnel: {
    id: string
    name: string
    description: string | null
    tags: string[]
  }
  lead: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
  }
}

interface FunnelDraftsClientProps {
  pendingEnrollments: PendingEnrollment[]
}

export function FunnelDraftsClient({ pendingEnrollments: initialEnrollments }: FunnelDraftsClientProps) {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState(initialEnrollments)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())

  const handleApprove = async (enrollmentId: string) => {
    setProcessingIds(prev => new Set([...prev, enrollmentId]))

    try {
      const response = await fetch(`/api/email-funnels/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })

      if (response.ok) {
        setEnrollments(prev => prev.filter(e => e.id !== enrollmentId))
        router.refresh()
      } else {
        const result = await response.json()
        alert(`Failed to approve: ${result.error}`)
      }
    } catch (error) {
      console.error('Error approving enrollment:', error)
      alert('Failed to approve enrollment')
    }

    setProcessingIds(prev => {
      const next = new Set(prev)
      next.delete(enrollmentId)
      return next
    })
  }

  const handleReject = async (enrollmentId: string) => {
    setProcessingIds(prev => new Set([...prev, enrollmentId]))

    try {
      const response = await fetch(`/api/email-funnels/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })

      if (response.ok) {
        setEnrollments(prev => prev.filter(e => e.id !== enrollmentId))
        router.refresh()
      } else {
        const result = await response.json()
        alert(`Failed to reject: ${result.error}`)
      }
    } catch (error) {
      console.error('Error rejecting enrollment:', error)
      alert('Failed to reject enrollment')
    }

    setProcessingIds(prev => {
      const next = new Set(prev)
      next.delete(enrollmentId)
      return next
    })
  }

  const handleApproveAll = async () => {
    for (const enrollment of enrollments) {
      await handleApprove(enrollment.id)
    }
  }

  if (enrollments.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">All caught up!</h3>
        <p className="text-gray-400">
          No pending funnel enrollments to review. When calls match your funnels, they&apos;ll appear here for approval.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with bulk action */}
      <div className="flex items-center justify-between">
        <p className="text-gray-400">
          {enrollments.length} pending {enrollments.length === 1 ? 'enrollment' : 'enrollments'} to review
        </p>
        {enrollments.length > 1 && (
          <button
            onClick={handleApproveAll}
            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 rounded-xl transition-all"
          >
            <Check className="w-4 h-4" />
            Approve All
          </button>
        )}
      </div>

      {/* Enrollment cards */}
      <div className="grid gap-4">
        {enrollments.map((enrollment) => {
          const leadName = enrollment.lead
            ? `${enrollment.lead.first_name || ''} ${enrollment.lead.last_name || ''}`.trim() || enrollment.lead.email || 'Unknown Lead'
            : 'Unknown Lead'

          const isProcessing = processingIds.has(enrollment.id)
          const enrolledDate = new Date(enrollment.enrolled_at)
          const timeAgo = getTimeAgo(enrolledDate)

          return (
            <div
              key={enrollment.id}
              className="glass-card p-5 border border-white/10 hover:border-yellow-500/30 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left side - Info */}
                <div className="flex-1 space-y-3">
                  {/* Lead and Funnel */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="font-medium text-white">{leadName}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-500" />
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                        <GitBranch className="w-4 h-4 text-yellow-400" />
                      </div>
                      <Link
                        href={`/dashboard/email-templates/funnels/${enrollment.funnel.id}`}
                        className="font-medium text-yellow-400 hover:text-yellow-300 transition-colors"
                      >
                        {enrollment.funnel.name}
                      </Link>
                    </div>
                  </div>

                  {/* AI Match Reason */}
                  {enrollment.match_reason && (
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                      <p className="text-purple-300 text-sm">
                        {enrollment.match_reason}
                      </p>
                    </div>
                  )}

                  {/* Time */}
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>Matched {timeAgo}</span>
                  </div>
                </div>

                {/* Right side - Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(enrollment.id)}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 rounded-xl transition-all disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {isProcessing ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(enrollment.id)}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 rounded-xl transition-all disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}
