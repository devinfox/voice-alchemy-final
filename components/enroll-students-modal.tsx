'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Users, Search, Check, AlertCircle, Loader2, UserPlus } from 'lucide-react'

interface Candidate {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  role: string | null
  email: string | null
  already_enrolled: boolean
}

interface EnrollStudentsModalProps {
  funnelId: string
  funnelName: string
  onClose: () => void
  onSuccess: (enrolled: number) => void
}

function displayName(c: Candidate): string {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || c.email || 'Unnamed'
}

/**
 * Pick students to enroll in a funnel. Students already in the funnel are
 * shown but cannot be selected again.
 */
export function EnrollStudentsModal({ funnelId, funnelName, onClose, onSuccess }: EnrollStudentsModalProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [includeStaff, setIncludeStaff] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ funnel_id: funnelId })
        if (includeStaff) params.set('include_staff', 'true')
        const response = await fetch(`/api/email-funnels/enroll?${params.toString()}`)
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load students')
        if (!cancelled) setCandidates(result.data || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load students')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [funnelId, includeStaff])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) => displayName(c).toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))
  }, [candidates, searchQuery])

  const selectable = filtered.filter((c) => !c.already_enrolled)

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleEnroll = async () => {
    if (selectedIds.length === 0) {
      setError('Select at least one student')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/email-funnels/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: funnelId, student_ids: selectedIds }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Could not enroll students')
        return
      }
      const parts = [`Enrolled ${result.enrolled} ${result.enrolled === 1 ? 'student' : 'students'}`]
      if (result.skipped_already_enrolled) parts.push(`${result.skipped_already_enrolled} already enrolled`)
      if (result.skipped_no_email) parts.push(`${result.skipped_no_email} without an email`)
      setSuccess(parts.join(' · '))
      setTimeout(() => onSuccess(result.enrolled || 0), 1200)
    } catch (err) {
      console.error('Error enrolling students:', err)
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
              <h2 className="text-lg font-bold text-white">Enroll Students</h2>
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
                The first email goes out on the next delivery run, after the first phase&apos;s delay. Each student receives the sequence once.
              </p>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search students..."
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
                  Include teachers &amp; staff
                </label>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {selectable.length} available · {filtered.length - selectable.length} already enrolled
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedIds(selectable.map((c) => c.id))} className="text-yellow-400 hover:text-yellow-300">
                    Select all
                  </button>
                  <span className="text-gray-600">|</span>
                  <button onClick={() => setSelectedIds([])} className="text-gray-400 hover:text-gray-300">
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
                  <p className="text-gray-400">No students with an email address match</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {filtered.map((c) => {
                    const isSelected = selectedIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => !c.already_enrolled && toggle(c.id)}
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
              {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select students to enroll'}
            </p>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                Cancel
              </button>
              <button
                onClick={handleEnroll}
                disabled={saving || selectedIds.length === 0}
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
