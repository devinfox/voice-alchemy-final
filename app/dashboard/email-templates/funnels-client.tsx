'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Users,
  Mail,
  MousePointerClick,
  Eye,
  Calendar,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { EmailFunnel, EmailTemplate, User, FunnelStatus } from '@/types/database.types'
import { CreateFunnelModal } from './create-funnel-modal'

interface FunnelsClientProps {
  funnels: EmailFunnel[]
  templates: EmailTemplate[]
  currentUser: User | null
}

export function FunnelsClient({
  funnels: initialFunnels,
  templates,
  currentUser,
}: FunnelsClientProps) {
  const router = useRouter()
  const [funnels, setFunnels] = useState(initialFunnels)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingFunnel, setEditingFunnel] = useState<EmailFunnel | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'active'>('all')

  // Filter funnels
  const filteredFunnels = funnels.filter((funnel) => {
    const matchesSearch = funnel.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || funnel.status === statusFilter
    const matchesTab = activeSubTab === 'all' || funnel.status === 'active'
    return matchesSearch && matchesStatus && matchesTab
  })

  // Delete funnel
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this funnel?')) return

    setDeletingId(id)
    try {
      const response = await fetch(`/api/email-funnels/${id}`, { method: 'DELETE' })
      if (response.ok) {
        setFunnels(funnels.filter((f) => f.id !== id))
      } else {
        const result = await response.json()
        alert(`Failed to delete funnel: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting funnel:', error)
      alert('Failed to delete funnel')
    }
    setDeletingId(null)
  }

  // Toggle funnel status
  const toggleStatus = async (funnel: EmailFunnel) => {
    const newStatus: FunnelStatus = funnel.status === 'active' ? 'paused' : 'active'
    setUpdatingStatusId(funnel.id)

    try {
      const response = await fetch(`/api/email-funnels/${funnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        setFunnels(funnels.map((f) => (f.id === funnel.id ? { ...f, status: newStatus } : f)))
      } else {
        const result = await response.json()
        alert(`Failed to update status: ${result.error}`)
      }
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status')
    }
    setUpdatingStatusId(null)
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Get status badge
  const getStatusBadge = (status: FunnelStatus) => {
    const badges: Record<FunnelStatus, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Draft' },
      active: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Active' },
      paused: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Paused' },
      archived: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Archived' },
    }
    const badge = badges[status] || badges.draft
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  // Calculate open rate
  const getOpenRate = (funnel: EmailFunnel) => {
    if (!funnel.total_emails_sent || funnel.total_emails_sent === 0) return '—'
    const rate = ((funnel.total_opens / funnel.total_emails_sent) * 100).toFixed(1)
    return `${rate}%`
  }

  // Calculate click rate
  const getClickRate = (funnel: EmailFunnel) => {
    if (!funnel.total_emails_sent || funnel.total_emails_sent === 0) return '—'
    const rate = ((funnel.total_clicks / funnel.total_emails_sent) * 100).toFixed(1)
    return `${rate}%`
  }

  const canManageFunnels = !!currentUser

  return (
    <div className="space-y-4">
      {/* Sub-tabs: All Funnels / Active Funnels */}
      <div className="flex items-center gap-1 p-1 glass-card rounded-lg w-fit">
        <button
          onClick={() => setActiveSubTab('all')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeSubTab === 'all'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          All Funnels
        </button>
        <button
          onClick={() => setActiveSubTab('active')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeSubTab === 'active'
              ? 'bg-green-500/20 text-green-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          Active Funnels
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search funnels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-10 pr-4 py-2 text-sm"
            />
          </div>

          {/* Status Filter (only show in All Funnels view) */}
          {activeSubTab === 'all' && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="glass-select pl-10 pr-8 py-2 text-sm appearance-none"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          )}
        </div>

        {/* Create Button */}
        {canManageFunnels && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Create Funnel
          </button>
        )}
      </div>

      {/* Funnels List */}
      {filteredFunnels.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Mail className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {funnels.length === 0
              ? 'No funnels yet'
              : activeSubTab === 'active'
              ? 'No active funnels'
              : 'No funnels found'}
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            {funnels.length === 0
              ? 'Create your first email funnel to automate drip campaigns.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {funnels.length === 0 && canManageFunnels && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Funnel
            </button>
          )}
        </div>
      ) : activeSubTab === 'active' ? (
        // Active Funnels - Card Grid View
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFunnels.map((funnel) => (
            <Link
              key={funnel.id}
              href={`/dashboard/email-templates/funnels/${funnel.id}`}
              className="glass-card p-5 hover:border-yellow-500/30 border border-transparent transition-all group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-white group-hover:text-yellow-400 transition-colors">
                    {funnel.name}
                  </h3>
                  {funnel.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                      {funnel.description}
                    </p>
                  )}
                </div>
                {getStatusBadge(funnel.status)}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-xs">Enrolled</span>
                  </div>
                  <p className="text-xl font-bold text-white">{funnel.total_enrolled}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span className="text-xs">Open Rate</span>
                  </div>
                  <p className="text-xl font-bold text-white">{getOpenRate(funnel)}</p>
                </div>
              </div>

              {/* Phases */}
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                <Mail className="w-4 h-4" />
                <span>{funnel.phases?.length || 0} phases</span>
                <span className="text-gray-600">|</span>
                <span>{funnel.total_emails_sent} emails sent</span>
              </div>

              {/* View Details Arrow */}
              <div className="flex items-center justify-end text-gray-500 group-hover:text-yellow-400 transition-colors">
                <span className="text-xs mr-1">View Details</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        // All Funnels - Table/List View
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Funnel
                </th>
                <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Phases
                </th>
                <th className="text-center p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Enrolled
                </th>
                <th className="text-center p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Open Rate
                </th>
                <th className="text-center p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Click Rate
                </th>
                <th className="text-right p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredFunnels.map((funnel) => (
                <tr key={funnel.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <Link
                      href={`/dashboard/email-templates/funnels/${funnel.id}`}
                      className="hover:text-yellow-400 transition-colors"
                    >
                      <p className="font-medium text-white">{funnel.name}</p>
                      {funnel.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {funnel.description}
                        </p>
                      )}
                    </Link>
                  </td>
                  <td className="p-4">{getStatusBadge(funnel.status)}</td>
                  <td className="p-4 text-center text-gray-300">
                    {funnel.phases?.length || 0}
                  </td>
                  <td className="p-4 text-center text-gray-300">{funnel.total_enrolled}</td>
                  <td className="p-4 text-center text-gray-300">{getOpenRate(funnel)}</td>
                  <td className="p-4 text-center text-gray-300">{getClickRate(funnel)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1">
                      {/* Play/Pause Button */}
                      {funnel.status !== 'archived' && (
                        <button
                          onClick={() => toggleStatus(funnel)}
                          disabled={updatingStatusId === funnel.id}
                          className={`p-2 rounded-lg transition-all ${
                            funnel.status === 'active'
                              ? 'text-yellow-400 hover:bg-yellow-500/10'
                              : 'text-green-400 hover:bg-green-500/10'
                          } disabled:opacity-50`}
                          title={funnel.status === 'active' ? 'Pause funnel' : 'Activate funnel'}
                        >
                          {funnel.status === 'active' ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Edit */}
                      {canManageFunnels && (
                        <button
                          onClick={() => setEditingFunnel(funnel)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                          title="Edit funnel"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete */}
                      {canManageFunnels && (
                        <button
                          onClick={() => handleDelete(funnel.id)}
                          disabled={deletingId === funnel.id}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                          title="Delete funnel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* View */}
                      <Link
                        href={`/dashboard/email-templates/funnels/${funnel.id}`}
                        className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all"
                        title="View details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {(showCreateModal || editingFunnel) && (
        <CreateFunnelModal
          onClose={() => {
            setShowCreateModal(false)
            setEditingFunnel(null)
          }}
          onSuccess={() => {
            setShowCreateModal(false)
            setEditingFunnel(null)
            router.refresh()
          }}
          templates={templates}
          editingFunnel={editingFunnel}
        />
      )}
    </div>
  )
}
