'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search, Plus, Pencil, Trash2, Users, GitBranch, UserPlus, ChevronRight, ChevronDown, Zap, FolderInput, Info,
} from 'lucide-react'
import { EmailFunnel, EmailTemplate, Profile, FunnelStatus } from '@/types/database.types'
import { Switch } from '@/components/ui/switch'
import { OverflowMenu } from '@/components/ui/overflow-menu'
import { EnrollStudentsModal } from '@/components/enroll-students-modal'
import { CreateFunnelModal } from './create-funnel-modal'
import { FunnelSteps } from './funnel-steps'
import { UserTypeModal } from './user-type-modal'
import { triggerLabel } from '@/lib/email-leads'
import { resolveAudienceId, type EmailAudience } from '@/lib/email-audiences'

interface FunnelsClientProps {
  funnels: EmailFunnel[]
  templates: EmailTemplate[]
  currentUser: Profile | null
  /** User types; empty (with audiencesError) until the audiences migration is applied */
  audiences: EmailAudience[]
  audiencesError?: string | null
  /** Open the edit modal for this funnel on load (from ?edit=<id>) */
  initialEditId?: string | null
}

const SEARCH_THRESHOLD = 6
const UNASSIGNED = '__unassigned__'
const COLLAPSE_KEY = 'vaa.funnels.collapsed'

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function FunnelsClient({
  funnels: initialFunnels,
  templates,
  currentUser,
  audiences: initialAudiences,
  audiencesError = null,
  initialEditId = null,
}: FunnelsClientProps) {
  const router = useRouter()
  const [funnels, setFunnels] = useState(initialFunnels)
  const [audiences, setAudiences] = useState(initialAudiences)
  const [searchQuery, setSearchQuery] = useState('')
  const [createFor, setCreateFor] = useState<string | null | false>(false) // false = closed; null = no type preselected
  const [editingFunnel, setEditingFunnel] = useState<EmailFunnel | null>(null)
  const [enrollingFunnel, setEnrollingFunnel] = useState<EmailFunnel | null>(null)
  const [movingFunnel, setMovingFunnel] = useState<EmailFunnel | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [typeModal, setTypeModal] = useState<{ open: boolean; audience: EmailAudience | null }>({ open: false, audience: null })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Restore collapsed sections after hydration (deferred so server and
    // client render the same initial markup).
    const frame = requestAnimationFrame(() => setCollapsed(readCollapsed()))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!initialEditId) return
    const target = initialFunnels.find((f) => f.id === initialEditId)
    if (target) setEditingFunnel(target)
    router.replace('/dashboard/email-templates?tab=funnels')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId])

  const canManage = !!currentUser
  const hasAudiences = audiences.length > 0
  const activeTemplates = templates.filter((t) => t.is_active)
  const showSearch = funnels.length > SEARCH_THRESHOLD

  const visible = funnels.filter((f) => !f.is_deleted && f.status !== 'archived')
  const filtered = searchQuery
    ? visible.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : visible

  // Group by user type. Funnels with a trigger but no explicit type fall
  // under the built-in type for that trigger.
  const sections = useMemo(() => {
    const byAudience = new Map<string, EmailFunnel[]>()
    for (const f of filtered) {
      const key = resolveAudienceId(f, audiences) || UNASSIGNED
      byAudience.set(key, [...(byAudience.get(key) || []), f])
    }
    const list = audiences.map((a) => ({ id: a.id, audience: a as EmailAudience | null, funnels: byAudience.get(a.id) || [] }))
    const unassigned = byAudience.get(UNASSIGNED) || []
    if (unassigned.length > 0 || !hasAudiences) list.push({ id: UNASSIGNED, audience: null, funnels: unassigned })
    return list
  }, [filtered, audiences, hasAudiences])

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const setStatus = async (funnel: EmailFunnel, on: boolean) => {
    const newStatus: FunnelStatus = on ? 'active' : 'paused'
    if (on && (funnel.phases || []).some((p) => !p.template_id)) {
      alert('Every step needs an email before the funnel can be turned on. Open Edit to finish it.')
      return
    }
    setTogglingId(funnel.id)
    try {
      const response = await fetch(`/api/email-funnels/${funnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (response.ok) {
        setFunnels((prev) => prev.map((f) => (f.id === funnel.id ? { ...f, status: newStatus } : f)))
      } else {
        const result = await response.json()
        alert(`Could not update: ${result.error}`)
      }
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Could not update the funnel. Please try again.')
    }
    setTogglingId(null)
  }

  const moveFunnel = async (funnel: EmailFunnel, audienceId: string | null) => {
    try {
      const response = await fetch(`/api/email-funnels/${funnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience_id: audienceId }),
      })
      if (response.ok) {
        setFunnels((prev) => prev.map((f) => (f.id === funnel.id ? { ...f, audience_id: audienceId } : f)))
        setMovingFunnel(null)
      } else {
        const result = await response.json()
        alert(`Could not move: ${result.hint || result.error}`)
      }
    } catch {
      alert('Could not move the funnel. Please try again.')
    }
  }

  const handleDelete = async (funnel: EmailFunnel) => {
    if (!confirm(`Delete "${funnel.name}"? People in it will stop receiving its emails.`)) return
    try {
      const response = await fetch(`/api/email-funnels/${funnel.id}`, { method: 'DELETE' })
      if (response.ok) {
        setFunnels((prev) => prev.filter((f) => f.id !== funnel.id))
      } else {
        const result = await response.json()
        alert(`Could not delete: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting funnel:', error)
      alert('Could not delete the funnel. Please try again.')
    }
  }

  const deleteAudience = async (audience: EmailAudience) => {
    const count = funnels.filter((f) => resolveAudienceId(f, audiences) === audience.id).length
    const note = count > 0 ? ` Its ${count} ${count === 1 ? 'funnel keeps' : 'funnels keep'} running and move to "Other".` : ''
    if (!confirm(`Remove the user type "${audience.name}"?${note}`)) return
    try {
      const response = await fetch(`/api/email-audiences/${audience.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const result = await response.json()
        alert(`Could not remove: ${result.error}`)
        return
      }
      setAudiences((prev) => prev.filter((a) => a.id !== audience.id))
      setFunnels((prev) => prev.map((f) => (f.audience_id === audience.id ? { ...f, audience_id: null } : f)))
    } catch {
      alert('Could not remove the user type. Please try again.')
    }
  }

  const renderFunnel = (funnel: EmailFunnel) => {
    const isOn = funnel.status === 'active'
    const enrolled = funnel.total_enrolled || 0
    const trigger = triggerLabel(funnel.trigger_key)
    return (
      <div key={funnel.id} className="glass-card-subtle rounded-xl p-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1 pt-1 flex-shrink-0 w-12">
            <Switch
              checked={isOn}
              disabled={togglingId === funnel.id || !canManage}
              onCheckedChange={(on) => setStatus(funnel, on)}
              aria-label={isOn ? 'Turn funnel off' : 'Turn funnel on'}
            />
            <span className={`text-[11px] ${isOn ? 'text-green-400' : 'text-gray-500'}`}>{isOn ? 'On' : 'Off'}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/email-templates/funnels/${funnel.id}`}
                  className="font-semibold text-white hover:text-yellow-400 transition-colors inline-flex items-center gap-1"
                >
                  {funnel.name}
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </Link>
                {funnel.description && <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{funnel.description}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setEnrollingFunnel(funnel)}
                  disabled={!isOn || !canManage}
                  title={isOn ? undefined : 'Turn the funnel on to add students'}
                  className="flex items-center gap-1.5 px-3 py-1.5 glass-button-gold rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add students
                </button>
                {canManage && (
                  <OverflowMenu
                    items={[
                      { label: 'View people', icon: <Users className="w-4 h-4" />, onSelect: () => router.push(`/dashboard/email-templates/funnels/${funnel.id}`) },
                      { label: 'Edit steps', icon: <Pencil className="w-4 h-4" />, onSelect: () => setEditingFunnel(funnel) },
                      ...(hasAudiences ? [{ label: 'Change user type', icon: <FolderInput className="w-4 h-4" />, onSelect: () => setMovingFunnel(funnel) }] : []),
                      { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => handleDelete(funnel) },
                    ]}
                  />
                )}
              </div>
            </div>

            <div className="mt-3">
              <FunnelSteps steps={funnel.phases || []} compact />
            </div>

            <div className="text-xs text-gray-500 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {enrolled === 0 ? 'No one in it yet' : `${enrolled} ${enrolled === 1 ? 'person' : 'people'}`}
                {funnel.total_emails_sent > 0 && <span> · {funnel.total_emails_sent} emails sent</span>}
              </span>
              {trigger && (
                <span className="flex items-center gap-1.5 text-violet-300/90">
                  <Zap className="w-3.5 h-3.5" />
                  Starts automatically: {trigger}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex-1">
          {showSearch && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search funnels"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full pl-10 pr-4 py-2 text-sm"
              />
            </div>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {!audiencesError && (
              <button
                onClick={() => setTypeModal({ open: true, audience: null })}
                className="flex items-center gap-2 px-3 py-2 glass-button rounded-xl text-sm"
              >
                <Plus className="w-4 h-4" />
                New user type
              </button>
            )}
            <button
              onClick={() => setCreateFor(null)}
              className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              New funnel
            </button>
          </div>
        )}
      </div>

      {audiencesError && (
        <p className="flex items-center gap-2 text-xs text-amber-300/90">
          <Info className="w-3.5 h-3.5" />
          User types are not set up yet: {audiencesError}
        </p>
      )}

      {/* Empty state (only when there are no user types to show either) */}
      {visible.length === 0 && !hasAudiences && (
        <div className="glass-card p-12 text-center">
          <GitBranch className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-white mb-1">No funnels yet</h3>
          <p className="text-gray-400 text-sm mb-4">
            {activeTemplates.length === 0
              ? 'Add at least one email first, then build a funnel from it.'
              : 'Chain a few emails together and let them send on a schedule.'}
          </p>
          {canManage && activeTemplates.length > 0 && (
            <button
              onClick={() => setCreateFor(null)}
              className="inline-flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create your first funnel
            </button>
          )}
        </div>
      )}

      {/* Sections by user type */}
      {(visible.length > 0 || hasAudiences) && (
        <div className="space-y-3">
          {sections.map(({ id, audience, funnels: group }) => {
            const isCollapsed = !!collapsed[id]
            const onCount = group.filter((f) => f.status === 'active').length
            const isUnassigned = id === UNASSIGNED
            return (
              <section key={id} className="glass-card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleCollapsed(id)}
                    aria-expanded={!isCollapsed}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isCollapsed ? '-rotate-90' : ''}`} />
                    <div className="min-w-0">
                      <h2 className="font-semibold text-white flex items-center gap-2 flex-wrap">
                        {isUnassigned ? (hasAudiences ? 'Other' : 'All funnels') : audience!.name}
                        <span className="text-xs font-normal font-sans text-gray-500">
                          {group.length} {group.length === 1 ? 'funnel' : 'funnels'}
                          {group.length > 0 && ` · ${onCount} on`}
                        </span>
                      </h2>
                      {audience?.description && <p className="text-xs text-gray-500 truncate">{audience.description}</p>}
                      {isUnassigned && hasAudiences && <p className="text-xs text-gray-500">Funnels not filed under a user type.</p>}
                    </div>
                  </button>
                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setCreateFor(isUnassigned ? null : audience!.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New funnel
                      </button>
                      {audience && (
                        <OverflowMenu
                          label={`Options for ${audience.name}`}
                          items={[
                            { label: 'Rename', icon: <Pencil className="w-4 h-4" />, onSelect: () => setTypeModal({ open: true, audience }) },
                            { label: 'Remove user type', icon: <Trash2 className="w-4 h-4" />, danger: true, disabled: !!audience.key, onSelect: () => deleteAudience(audience) },
                          ]}
                        />
                      )}
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="px-4 pb-4 space-y-3">
                    {group.length === 0 ? (
                      <p className="text-sm text-gray-500 py-2">
                        {activeTemplates.length === 0
                          ? 'No funnels yet. Add emails first, then build one here.'
                          : 'No funnels for this user type yet.'}
                      </p>
                    ) : (
                      group.map(renderFunnel)
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {(createFor !== false || editingFunnel) && (
        <CreateFunnelModal
          onClose={() => {
            setCreateFor(false)
            setEditingFunnel(null)
          }}
          onSuccess={() => {
            setCreateFor(false)
            setEditingFunnel(null)
            router.refresh()
          }}
          templates={activeTemplates}
          audiences={audiences}
          defaultAudienceId={createFor === false ? null : createFor}
          editingFunnel={editingFunnel}
        />
      )}

      {enrollingFunnel && (
        <EnrollStudentsModal
          funnelId={enrollingFunnel.id}
          funnelName={enrollingFunnel.name}
          onClose={() => setEnrollingFunnel(null)}
          onSuccess={() => {
            setEnrollingFunnel(null)
            router.refresh()
          }}
        />
      )}

      {typeModal.open && (
        <UserTypeModal
          audience={typeModal.audience}
          onClose={() => setTypeModal({ open: false, audience: null })}
          onSaved={(saved) => {
            setAudiences((prev) => {
              const exists = prev.some((a) => a.id === saved.id)
              const next = exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved]
              return next.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
            })
            setTypeModal({ open: false, audience: null })
          }}
        />
      )}

      {movingFunnel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMovingFunnel(null)} />
          <div className="relative w-full max-w-sm glass-card modal-solid rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-bold text-white">Change user type</h2>
            <p className="text-sm text-gray-400">Where should “{movingFunnel.name}” be filed?</p>
            <div className="space-y-1.5">
              {[...audiences.map((a) => ({ id: a.id as string | null, name: a.name })), { id: null, name: 'Other (no user type)' }].map((opt) => {
                const current = resolveAudienceId(movingFunnel, audiences) === opt.id
                return (
                  <button
                    key={opt.id || 'none'}
                    onClick={() => moveFunnel(movingFunnel, opt.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      current ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300' : 'border-white/10 text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    {opt.name}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setMovingFunnel(null)} className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
