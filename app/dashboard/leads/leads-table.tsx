'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, ExternalLink, GitBranch, Loader2, Minus, Search, Tag as TagIcon, Trash2, Users, X } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TagPicker } from '@/components/tags/tag-picker'
import { ContactTagEditor, assignTags, automationNote, type ContactTag } from '@/components/tags/contact-tag-editor'
import { ManageTagsModal } from '@/components/tags/manage-tags-modal'
import { useTags } from '@/components/tags/use-tags'
import type { EmailTag } from '@/lib/email-tags-shared'

export interface LeadRow {
  id: string
  name: string | null
  email: string
  persona: string
  source: string | null
  sourceLabel: string
  page: string | null
  type: string
  typeLabel: string
  createdAt: string
  updatedAt: string
  hasAccount: boolean
  unsubscribed: boolean
  tags: ContactTag[]
  enrollment: {
    id: string
    funnelId: string
    funnelName: string
    status: string
    step: number
    totalSteps: number
    nextAt: string | null
    lastSentAt: string | null
    sent: number
    lastError: string | null
    via: string
    cancelReason: string | null
  } | null
  note: string | null
}

interface FunnelOption {
  id: string
  name: string
  status: string
}

const STATUS: Record<string, { text: string; cls: string }> = {
  active: { text: 'In progress', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
  paused: { text: 'Paused', cls: 'bg-amber-500/15 text-amber-200 border border-amber-500/30' },
  completed: { text: 'Finished', cls: 'bg-[#CEB466]/15 text-[#CEB466] border border-[#CEB466]/30' },
  cancelled: { text: 'Stopped', cls: 'bg-white/[0.06] text-gray-400 border border-white/10' },
  pending_approval: { text: 'Awaiting review', cls: 'bg-violet-500/15 text-violet-300 border border-violet-500/30' },
}

function when(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function relative(iso: string | null): string {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const label = mins < 60 ? `${mins} min` : mins < 60 * 48 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`
  return diff > 0 ? `in ${label}` : `${label} ago`
}

const PAGE_SIZE = 25

type PersonaFilter = 'all' | 'singer' | 'coach'
type StateFilter = 'all' | 'enrolled' | 'not-enrolled'

export function LeadsTable({
  rows: initialRows,
  funnels = [],
  tagsError = null,
}: {
  rows: LeadRow[]
  funnels?: FunnelOption[]
  tagsError?: string | null
}) {
  const router = useRouter()
  const { tags: allTags, createTag, bumpCounts } = useTags()
  const [rows, setRows] = useState(initialRows)
  const [pendingDelete, setPendingDelete] = useState<LeadRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [persona, setPersona] = useState<PersonaFilter>('all')
  const [state, setState] = useState<StateFilter>('all')
  const [source, setSource] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkFunnel, setBulkFunnel] = useState('')
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)
  const [manageTags, setManageTags] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const sources = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.source || 'unknown', r.sourceLabel)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (persona !== 'all' && r.persona !== persona) return false
      if (state === 'enrolled' && !r.enrollment) return false
      if (state === 'not-enrolled' && r.enrollment) return false
      if (source !== 'all' && (r.source || 'unknown') !== source) return false
      if (tagFilter === '__none__' && r.tags.length > 0) return false
      if (tagFilter !== 'all' && tagFilter !== '__none__' && !r.tags.some((t) => t.id === tagFilter)) return false
      if (q && !`${r.name || ''} ${r.email} ${r.sourceLabel} ${r.enrollment?.funnelName || ''} ${r.tags.map((t) => t.name).join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [persona, rows, search, source, state, tagFilter])

  // Back to the first page whenever the result set changes shape.
  useEffect(() => { setPage(1) }, [search, persona, state, source, tagFilter, rows])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage])
  const firstIndex = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const lastIndex = Math.min(currentPage * PAGE_SIZE, filtered.length)
  // Page numbers to render: always first/last, plus a window around the current page.
  const pageNumbers = useMemo(() => {
    const nums = new Set<number>([1, pageCount])
    for (let p = currentPage - 1; p <= currentPage + 1; p++) {
      if (p >= 1 && p <= pageCount) nums.add(p)
    }
    return Array.from(nums).sort((a, b) => a - b)
  }, [currentPage, pageCount])

  const enrolledCount = rows.filter((r) => r.enrollment).length

  // One card per funnel that has picked up at least one lead.
  const byFunnel = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; active: number }>()
    for (const r of rows) {
      if (!r.enrollment) continue
      const cur = map.get(r.enrollment.funnelId) || { id: r.enrollment.funnelId, name: r.enrollment.funnelName, count: 0, active: 0 }
      cur.count += 1
      if (r.enrollment.status === 'active') cur.active += 1
      map.set(r.enrollment.funnelId, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [rows])

  // ----- selection (the rows on the current page) -----
  const visibleIds = pageRows.map((r) => r.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const someVisibleSelected = visibleIds.some((id) => selected.has(id))
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectedRows = rows.filter((r) => selected.has(r.id))

  // Tags carried by every selected lead (so the bulk picker shows them checked)
  const commonTagIds = useMemo(() => {
    if (selectedRows.length === 0) return []
    const first = selectedRows[0].tags.map((t) => t.id)
    return first.filter((id) => selectedRows.every((r) => r.tags.some((t) => t.id === id)))
  }, [selectedRows])

  const setRowTags = (id: string, tags: ContactTag[]) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, tags } : r)))

  const bulkTag = async (tag: EmailTag, on: boolean) => {
    const ids = [...selected]
    const r = await assignTags({ lead_ids: ids, ...(on ? { add: [tag.id] } : { remove: [tag.id] }) })
    setRows((prev) =>
      prev.map((row) => {
        if (!selected.has(row.id)) return row
        const has = row.tags.some((t) => t.id === tag.id)
        if (on && !has) return { ...row, tags: [...row.tags, { id: tag.id, name: tag.name, color: tag.color }].sort((a, b) => a.name.localeCompare(b.name)) }
        if (!on && has) return { ...row, tags: row.tags.filter((t) => t.id !== tag.id) }
        return row
      })
    )
    bumpCounts({ [tag.id]: on ? r.added : -r.removed })
    const note = automationNote(r)
    setToast({ kind: 'ok', text: `${on ? 'Tagged' : 'Untagged'} ${ids.length} ${ids.length === 1 ? 'lead' : 'leads'}${note ? ` · ${note}` : ''}` })
    if (note) router.refresh()
  }

  const bulkEnroll = async () => {
    if (!bulkFunnel || selected.size === 0) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/email-funnels/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: bulkFunnel, website_lead_ids: [...selected] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not enroll')
      const name = funnels.find((f) => f.id === bulkFunnel)?.name || 'funnel'
      const parts = [`Added ${json.enrolled} to “${name}”`]
      if (json.skipped_already_enrolled) parts.push(`${json.skipped_already_enrolled} already in it`)
      if (json.skipped_unsubscribed) parts.push(`${json.skipped_unsubscribed} unsubscribed`)
      setToast({ kind: 'ok', text: parts.join(' · ') })
      setBulkFunnel('')
      router.refresh()
    } catch (e) {
      setToast({ kind: 'error', text: e instanceof Error ? e.message : 'Could not enroll' })
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteLead = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/email-leads/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not delete lead')
      }
      setRows((prev) => prev.filter((r) => r.id !== pendingDelete.id))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(pendingDelete.id)
        return next
      })
      router.refresh()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete lead')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const pill = (text: string, cls: string) => <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full ${cls}`}>{text}</span>
  const activeFunnels = funnels.filter((f) => f.status === 'active')

  return (
    <div className="space-y-5">
      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Leads', value: rows.length },
          { label: 'In a funnel', value: enrolledCount },
          { label: 'Singers', value: rows.filter((r) => r.persona === 'singer').length },
          { label: 'Coaches', value: rows.filter((r) => r.persona === 'coach').length },
        ].map((s) => (
          <div key={s.label} className="glass-card-subtle rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Funnels these leads landed in */}
      {byFunnel.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">By funnel</p>
          <div className="flex flex-wrap gap-2">
            {byFunnel.map((f) => (
              <Link
                key={f.id}
                href={`/dashboard/email-templates/funnels/${f.id}`}
                className="group inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#CEB466]/10 hover:bg-[#CEB466]/20 border border-[#CEB466]/30 transition-colors"
              >
                <span className="text-sm font-medium text-white group-hover:text-[#CEB466]">{f.name}</span>
                <span className="text-xs text-gray-400">{f.count} {f.count === 1 ? 'lead' : 'leads'}{f.active !== f.count ? ` · ${f.active} in progress` : ''}</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#CEB466]" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {tagsError && (
        <p className="flex items-center gap-2 text-xs text-amber-300/90">
          <AlertTriangle className="w-3.5 h-3.5" />
          Tags are not set up yet: {tagsError}
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, source, tag or funnel" className="glass-input w-full pl-10 pr-4 py-2 text-sm placeholder-gray-500" />
        </div>
        <select value={persona} onChange={(e) => setPersona(e.target.value as PersonaFilter)} className="glass-select text-sm">
          <option value="all">Singers &amp; coaches</option>
          <option value="singer">Singers</option>
          <option value="coach">Coaches</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="glass-select text-sm">
          <option value="all">Every source</option>
          {sources.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="glass-select text-sm">
          <option value="all">Any tag</option>
          <option value="__none__">No tags</option>
          {allTags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value as StateFilter)} className="glass-select text-sm">
          <option value="all">Any funnel state</option>
          <option value="enrolled">In a funnel</option>
          <option value="not-enrolled">Not in a funnel</option>
        </select>
        <button
          type="button"
          onClick={() => setManageTags(true)}
          className="flex items-center gap-1.5 px-3 py-2 glass-button rounded-xl text-sm"
        >
          <TagIcon className="w-4 h-4" />
          Manage tags
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-[#CEB466]/40 bg-[#1a1433]/95 backdrop-blur px-4 py-2.5 shadow-lg shadow-black/30">
          <span className="text-sm font-medium text-white">
            {selected.size} selected
          </span>
          <TagPicker
            selectedIds={commonTagIds}
            onToggle={bulkTag}
            onCreate={(name) => createTag(name)}
            heading={`Tag ${selected.size} ${selected.size === 1 ? 'lead' : 'leads'}`}
            trigger={
              <>
                <TagIcon className="w-3.5 h-3.5" />
                Tags
              </>
            }
            triggerClassName="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-sm text-gray-200 transition-colors"
          />
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-gray-400" />
            <select value={bulkFunnel} onChange={(e) => setBulkFunnel(e.target.value)} className="glass-select text-sm py-1.5">
              <option value="">Add to funnel…</option>
              {activeFunnels.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void bulkEnroll()}
              disabled={!bulkFunnel || bulkBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 glass-button-gold rounded-lg text-sm font-medium disabled:opacity-40"
            >
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      )}

      {toast && (
        <div className={`rounded-xl px-4 py-2.5 text-sm border ${toast.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
          {toast.text}
        </div>
      )}

      {/* Table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Your community</h2>
          <span className="text-sm text-gray-500">
            {filtered.length === 0 ? '0 shown' : filtered.length <= PAGE_SIZE ? `${filtered.length} shown` : `Showing ${firstIndex}–${lastIndex} of ${filtered.length}`}
          </span>
        </div>
        {deleteError && <p className="text-xs text-red-300 mb-3">{deleteError}</p>}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">{rows.length === 0 ? 'Your community starts here. Import a CSV above or collect leads through your website.' : 'Nothing matches those filters.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="p-3 w-10">
                    <button
                      type="button"
                      onClick={toggleAll}
                      aria-label={allVisibleSelected ? 'Deselect all shown' : 'Select all shown'}
                      className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded border flex items-center justify-center ${allVisibleSelected || someVisibleSelected ? 'bg-[#CEB466] border-[#CEB466]' : 'border-gray-600 hover:border-gray-400'}`}
                    >
                      {allVisibleSelected ? <Check className="w-3 h-3 text-[#171229]" /> : someVisibleSelected ? <Minus className="w-3 h-3 text-[#171229]" /> : null}
                    </button>
                  </th>
                  <th className="text-left p-3 font-medium w-[24%]">Person</th>
                  <th className="text-left p-3 font-medium w-[18%]">Tags</th>
                  <th className="text-left p-3 font-medium w-[18%]">Came from</th>
                  <th className="text-left p-3 font-medium">Funnel</th>
                  <th className="text-left p-3 font-medium w-[12%]">Received</th>
                  <th className="p-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pageRows.map((r) => {
                  const badge = r.enrollment ? STATUS[r.enrollment.status] || STATUS.active : null
                  const isSelected = selected.has(r.id)
                  return (
                    <tr key={r.id} className={`transition-colors align-top ${isSelected ? 'bg-[#CEB466]/[0.06]' : 'hover:bg-white/5'}`}>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => toggleOne(r.id)}
                          aria-label={isSelected ? `Deselect ${r.name || r.email}` : `Select ${r.name || r.email}`}
                          className={`w-[18px] h-[18px] rounded border flex items-center justify-center mt-0.5 ${isSelected ? 'bg-[#CEB466] border-[#CEB466]' : 'border-gray-600 hover:border-gray-400'}`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-[#171229]" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-white">{r.name || r.email}</p>
                        {r.name && <p className="text-xs text-gray-500 mt-0.5">{r.email}</p>}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {pill(r.persona === 'coach' ? 'Coach' : 'Singer', r.persona === 'coach' ? 'bg-violet-500/20 text-violet-300' : 'bg-[#CEB466]/15 text-[#CEB466]')}
                          {r.hasAccount && pill('Has account', 'bg-emerald-500/15 text-emerald-300')}
                          {r.unsubscribed && pill('No marketing', 'bg-red-500/15 text-red-300')}
                        </div>
                      </td>
                      <td className="p-3">
                        <ContactTagEditor
                          leadId={r.id}
                          tags={r.tags}
                          onChange={(tags) => setRowTags(r.id, tags)}
                          readOnly={!!tagsError}
                          onAutomation={(note) => {
                            setToast({ kind: 'ok', text: `${r.name || r.email}: ${note}` })
                            router.refresh()
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <p className="text-sm text-gray-200">{r.sourceLabel}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{r.typeLabel}</p>
                      </td>
                      <td className="p-3">
                        {r.enrollment ? (
                          <div>
                            <Link
                              href={`/dashboard/email-templates/funnels/${r.enrollment.funnelId}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CEB466]/10 hover:bg-[#CEB466]/20 border border-[#CEB466]/30 text-sm font-medium text-white hover:text-[#CEB466] transition-colors"
                            >
                              {r.enrollment.funnelName}
                              <ExternalLink className="w-3.5 h-3.5 text-[#CEB466]" />
                            </Link>
                            <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-gray-400">
                              {badge && <span className={`px-2 py-0.5 text-[11px] rounded-full ${badge.cls}`}>{badge.text}</span>}
                              <span>
                                {r.enrollment.sent} of {r.enrollment.totalSteps || '?'} emails sent
                              </span>
                              {r.enrollment.status === 'active' && r.enrollment.nextAt && <span>· next {relative(r.enrollment.nextAt)}</span>}
                              {r.enrollment.via === 'tag' && <span>· via tag</span>}
                            </div>
                            {r.enrollment.lastError && (
                              <p className="text-xs text-amber-300 mt-1 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {r.enrollment.lastError}</p>
                            )}
                            {r.enrollment.cancelReason && <p className="text-xs text-gray-500 mt-1">{r.enrollment.cancelReason}</p>}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 max-w-[320px] leading-relaxed">{r.note}</p>
                        )}
                      </td>
                      <td className="p-3 text-sm text-gray-300 whitespace-nowrap">
                        <p>{when(r.createdAt)}</p>
                        <p className="text-xs text-gray-500">{relative(r.createdAt)}</p>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(r)}
                          className="p-2 rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                          title="Delete lead"
                          aria-label={`Delete ${r.name || r.email}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {pageCount}
              {selected.size > 0 && ` · ${selected.size} selected across pages`}
            </p>
            <nav aria-label="Pagination" className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {pageNumbers.map((n, i) => {
                const gap = i > 0 && n - pageNumbers[i - 1] > 1
                return (
                  <span key={n} className="flex items-center gap-1">
                    {gap && <span className="px-1 text-gray-600 text-sm">…</span>}
                    <button
                      type="button"
                      onClick={() => setPage(n)}
                      aria-current={n === currentPage ? 'page' : undefined}
                      className={`min-w-[2.25rem] px-2 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        n === currentPage ? 'bg-gradient-to-r from-[#CEB466] to-[#9c8644] text-[#171229]' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                )
              })}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                aria-label="Next page"
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Delete ${pendingDelete?.name || pendingDelete?.email || 'this lead'}?`}
        message="They are removed from the leads list and taken out of any funnel they are in, so no further emails go to them. If they fill in a form again they will be added back as a new lead."
        confirmText={deleting ? 'Deleting…' : 'Delete lead'}
        destructive
        onConfirm={() => void deleteLead()}
        onCancel={() => !deleting && setPendingDelete(null)}
      />

      {manageTags && <ManageTagsModal onClose={() => setManageTags(false)} />}
    </div>
  )
}
