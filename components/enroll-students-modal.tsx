'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Users, Search, Check, AlertCircle, Loader2, UserPlus, Tag as TagIcon } from 'lucide-react'
import { TagMultiSelect } from '@/components/tags/tag-multi-select'
import { useTags } from '@/components/tags/use-tags'

interface Candidate {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  role: string | null
  email: string | null
  already_enrolled: boolean
  /** 'lead' for website leads (email_leads); undefined for accounts */
  kind?: 'lead'
  tag_ids?: string[]
}

interface EnrollStudentsModalProps {
  funnelId: string
  funnelName: string
  onClose: () => void
  onSuccess: (enrolled: number) => void
}

const selectionKey = (c: Candidate) => `${c.kind === 'lead' ? 'lead' : 'student'}:${c.id}`

function displayName(c: Candidate): string {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || c.email || 'Unnamed'
}

/**
 * Pick people to enroll in a funnel: students, optionally staff and website
 * leads, filtered by tag if you like. Anyone already in the funnel is shown
 * but cannot be selected again.
 */
export function EnrollStudentsModal({ funnelId, funnelName, onClose, onSuccess }: EnrollStudentsModalProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [includeStaff, setIncludeStaff] = useState(false)
  const [includeLeads, setIncludeLeads] = useState(false)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { error: tagsError } = useTags()

  const tagFilterOn = tagFilter.length > 0
  // Tags can sit on website leads, so a tag filter pulls leads in as well
  const loadLeads = includeLeads || tagFilterOn

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ funnel_id: funnelId })
        if (includeStaff) params.set('include_staff', 'true')
        if (loadLeads) params.set('include_leads', 'true')
        const response = await fetch(`/api/email-funnels/enroll?${params.toString()}`)
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load people')
        if (!cancelled) setCandidates(result.data || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load people')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [funnelId, includeStaff, loadLeads])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return candidates.filter((c) => {
      if (tagFilterOn && !(c.tag_ids || []).some((id) => tagFilter.includes(id))) return false
      if (!q) return true
      return displayName(c).toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
    })
  }, [candidates, searchQuery, tagFilter, tagFilterOn])

  const selectable = filtered.filter((c) => !c.already_enrolled)
  const selected = new Set(selectedKeys)

  const toggle = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  const handleEnroll = async () => {
    if (selectedKeys.length === 0) {
      setError('Select at least one person')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/email-funnels/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnel_id: funnelId,
          student_ids: selectedKeys.filter((k) => k.startsWith('student:')).map((k) => k.slice('student:'.length)),
          website_lead_ids: selectedKeys.filter((k) => k.startsWith('lead:')).map((k) => k.slice('lead:'.length)),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Could not enroll')
        return
      }
      const parts = [`Enrolled ${result.enrolled} ${result.enrolled === 1 ? 'person' : 'people'}`]
      if (result.skipped_already_enrolled) parts.push(`${result.skipped_already_enrolled} already enrolled`)
      if (result.skipped_no_email) parts.push(`${result.skipped_no_email} without an email`)
      if (result.skipped_unsubscribed) parts.push(`${result.skipped_unsubscribed} unsubscribed`)
      setSuccess(parts.join(' · '))
      setTimeout(() => onSuccess(result.enrolled || 0), 1200)
    } catch (err) {
      console.error('Error enrolling:', err)
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden glass-card modal-solid rounded-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Add people</h2>
              <p className="text-sm text-gray-400">{funnelName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {success && (
            <div className="flex items-center gap-3 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className="text-green-300">{success}</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{error}</span>
            </div>
          )}

          {!success && (
            <>
              <p className="text-sm text-gray-400">
                The first email goes out on the next delivery run, after the first phase&apos;s delay. Each person receives the sequence once.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search people..."
                    className="glass-input w-full pl-10 pr-4 py-2"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStaff}
                    onChange={(e) => setIncludeStaff(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5"
                  />
                  Teachers &amp; staff
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loadLeads}
                    disabled={tagFilterOn}
                    onChange={(e) => setIncludeLeads(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5"
                  />
                  Website leads
                </label>
              </div>

              {!tagsError && (
                <div className="flex items-start gap-2">
                  <TagIcon className="w-4 h-4 text-gray-400 mt-1.5 flex-shrink-0" />
                  <TagMultiSelect value={tagFilter} onChange={setTagFilter} placeholder="Only people with a tag…" allowCreate={false} className="flex-1" />
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {selectable.length} available · {filtered.length - selectable.length} already enrolled
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedKeys(selectable.map(selectionKey))} className="text-yellow-400 hover:text-yellow-300">
                    Select all{tagFilterOn ? ' tagged' : ''}
                  </button>
                  <span className="text-gray-600">|</span>
                  <button onClick={() => setSelectedKeys([])} className="text-gray-400 hover:text-gray-300">
                    Clear
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-yellow-400 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400">{tagFilterOn ? 'Nobody with those tags has an email address' : 'No one with an email address matches'}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {filtered.map((c) => {
                    const key = selectionKey(c)
                    const isSelected = selected.has(key)
                    return (
                      <button
                        key={key}
                        onClick={() => !c.already_enrolled && toggle(key)}
                        disabled={c.already_enrolled}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          c.already_enrolled
                            ? 'border-white/5 bg-white/[0.02] opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'border-yellow-500/50 bg-yellow-500/10'
                            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                                isSelected ? 'bg-yellow-500 border-yellow-500' : 'border-gray-500'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-black" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-white truncate">{displayName(c)}</p>
                              <p className="text-xs text-gray-400 truncate">{c.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {c.role && c.role !== 'student' && (
                              <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-white/10 text-gray-300">{c.role}</span>
                            )}
                            {c.already_enrolled && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">Enrolled</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="flex items-center justify-between p-4 border-t border-white/10">
            <p className="text-sm text-gray-400">
              {selectedKeys.length > 0 ? `${selectedKeys.length} selected` : 'Select people to enroll'}
            </p>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                Cancel
              </button>
              <button
                onClick={handleEnroll}
                disabled={saving || selectedKeys.length === 0}
                className="px-6 py-2 glass-button-gold rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Enrolling...' : 'Enroll'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
