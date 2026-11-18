'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, ExternalLink, GitBranch, Loader2, Mail, Minus, Search,
  SlidersHorizontal, Tag as TagIcon, Trash2, Users, X,
} from 'lucide-react'
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

const PAGE_SIZES = [10, 25, 50] as const
const PAGE_SIZE_KEY = 'vaa.leads.pageSize'

function exact(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

function relative(iso: string | null): string {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const label = mins < 60 ? `${mins} min` : mins < 60 * 48 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`
  return diff > 0 ? `in ${label}` : `${label} ago`
}

type View = 'all' | 'enrolled' | 'singer' | 'coach'
type FunnelFilter = 'all' | 'none' | string

const pill = (text: string, cls: string, title?: string) => (
  <span title={title} className={`px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide rounded-full whitespace-nowrap ${cls}`}>{text}</span>
)

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
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('all')
  const [funnelFilter, setFunnelFilter] = useState<FunnelFilter>('all')
  const [source, setSource] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkFunnel, setBulkFunnel] = useState('')
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)
  const [manageTags, setManageTags] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [openId, setOpenId] = useState<string | null>(null)
  const filtersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Remembered page size (per browser), applied after hydration.
    const frame = requestAnimationFrame(() => {
      try {
        const saved = Number(localStorage.getItem(PAGE_SIZE_KEY))
        if ((PAGE_SIZES as readonly number[]).includes(saved)) setPageSize(saved)
      } catch { /* ignore */ }
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!filtersOpen) return
    const onClick = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [filtersOpen])

  const sources = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.source || 'unknown', r.sourceLabel)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  // Funnels at least one lead on this page is in, for the funnel filter.
  const funnelsInUse = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    for (const r of rows) {
      if (!r.enrollment) continue
      const cur = map.get(r.enrollment.funnelId) || { id: r.enrollment.funnelId, name: r.enrollment.funnelName, count: 0 }
      cur.count += 1
      map.set(r.enrollment.funnelId, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [rows])

  const counts = useMemo(() => ({
    all: rows.length,
    enrolled: rows.filter((r) => r.enrollment).length,
    singer: rows.filter((r) => r.persona === 'singer').length,
    coach: rows.filter((r) => r.persona === 'coach').length,
  }), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (view === 'enrolled' && !r.enrollment) return false
      if (view === 'singer' && r.persona !== 'singer') return false
      if (view === 'coach' && r.persona !== 'coach') return false
      if (funnelFilter === 'none' && r.enrollment) return false
      if (funnelFilter !== 'all' && funnelFilter !== 'none' && r.enrollment?.funnelId !== funnelFilter) return false
      if (source !== 'all' && (r.source || 'unknown') !== source) return false
      if (tagFilter === '__none__' && r.tags.length > 0) return false
      if (tagFilter !== 'all' && tagFilter !== '__none__' && !r.tags.some((t) => t.id === tagFilter)) return false
      if (q && !`${r.name || ''} ${r.email} ${r.sourceLabel} ${r.enrollment?.funnelName || ''} ${r.tags.map((t) => t.name).join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, view, funnelFilter, source, tagFilter])

  // Back to the first page whenever the result set changes shape.
  useEffect(() => { setPage(1) }, [search, view, funnelFilter, source, tagFilter, pageSize, rows])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize])
  const firstIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastIndex = Math.min(currentPage * pageSize, filtered.length)
  const pageNumbers = useMemo(() => {
    const nums = new Set<number>([1, pageCount])
    for (let p = currentPage - 1; p <= currentPage + 1; p++) {
      if (p >= 1 && p <= pageCount) nums.add(p)
    }
    return Array.from(nums).sort((a, b) => a - b)
  }, [currentPage, pageCount])

  const changePageSize = (n: number) => {
    setPageSize(n)
    try { localStorage.setItem(PAGE_SIZE_KEY, String(n)) } catch { /* ignore */ }
  }

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

  const enroll = async (funnelId: string, leadIds: string[]) => {
    const res = await fetch('/api/email-funnels/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funnel_id: funnelId, website_lead_ids: leadIds }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Could not enroll')
    const name = funnels.find((f) => f.id === funnelId)?.name || 'funnel'
    const parts = [`Added ${json.enrolled} to “${name}”`]
    if (json.skipped_already_enrolled) parts.push(`${json.skipped_already_enrolled} already in it`)
    if (json.skipped_unsubscribed) parts.push(`${json.skipped_unsubscribed} unsubscribed`)
    setToast({ kind: 'ok', text: parts.join(' · ') })
    router.refresh()
  }

  const bulkEnroll = async () => {
    if (!bulkFunnel || selected.size === 0) return
    setBulkBusy(true)
    try {
      await enroll(bulkFunnel, [...selected])
      setBulkFunnel('')
    } catch (e) {
      setToast({ kind: 'error', text: e instanceof Error ? e.message : 'Could not enroll' })
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteLead = async () => {
    if (!pendingDelete) return
    setDeleting(true)
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
      if (openId === pendingDelete.id) setOpenId(null)
      router.refresh()
    } catch (e) {
      setToast({ kind: 'error', text: e instanceof Error ? e.message : 'Could not delete lead' })
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  // Every live funnel. Paused ones are listed but disabled so it is obvious
  // why nobody can be added to them right now.
  const activeFunnels = funnels.filter((f) => f.status !== 'archived')
  const funnelOption = (f: FunnelOption) => (
    <option key={f.id} value={f.id} disabled={f.status !== 'active'}>{f.name}{f.status !== 'active' ? ' (off)' : ''}</option>
  )
  const extraFilters = (source !== 'all' ? 1 : 0) + (tagFilter !== 'all' ? 1 : 0)
  const openLead = openId ? rows.find((r) => r.id === openId) || null : null

  const pager = (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={currentPage === 1}
        aria-label="Previous page"
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
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
              className={`min-w-[2rem] px-2 py-1 rounded-lg text-sm font-medium transition-all ${
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
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  )

  const rangeText = filtered.length === 0 ? '0 leads' : `${firstIndex}–${lastIndex} of ${filtered.length}`

  return (
    <div className="space-y-3">
      {tagsError && (
        <p className="flex items-center gap-2 text-xs text-amber-300/90">
          <AlertTriangle className="w-3.5 h-3.5" />
          Tags are not set up yet: {tagsError}
        </p>
      )}

      {/* View tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10">
        {([
          ['all', 'All', counts.all],
          ['enrolled', 'In a funnel', counts.enrolled],
          ['singer', 'Singers', counts.singer],
          ['coach', 'Coaches', counts.coach],
        ] as const).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`-mb-px px-3 py-2 text-sm border-b-2 transition-colors ${
              view === key ? 'border-[#CEB466] text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {label} <span className={`ml-1 text-xs ${view === key ? 'text-[#CEB466]' : 'text-gray-500'}`}>{n}</span>
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, source, tag or funnel" className="glass-input w-full pl-10 pr-4 py-2 text-sm placeholder-gray-500" />
        </div>
        <select value={funnelFilter} onChange={(e) => setFunnelFilter(e.target.value)} className="glass-select text-sm" aria-label="Funnel">
          <option value="all">Any funnel</option>
          <option value="none">No funnel</option>
          {funnelsInUse.map((f) => (
            <option key={f.id} value={f.id}>{f.name} ({f.count})</option>
          ))}
        </select>
        <div ref={filtersRef} className="relative">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className={`flex items-center gap-1.5 px-3 py-2 glass-button rounded-xl text-sm ${extraFilters ? 'text-[#e0c97d]' : ''}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters{extraFilters ? ` · ${extraFilters}` : ''}
          </button>
          {filtersOpen && (
            <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-xl border border-white/10 bg-[#1a1433] p-3 shadow-2xl shadow-black/50 space-y-3">
              <label className="block text-xs text-gray-400">
                Source
                <select value={source} onChange={(e) => setSource(e.target.value)} className="glass-select w-full text-sm mt-1">
                  <option value="all">Every source</option>
                  {sources.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-gray-400">
                Tag
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="glass-select w-full text-sm mt-1" disabled={!!tagsError}>
                  <option value="all">Any tag</option>
                  <option value="__none__">No tags</option>
                  {allTags.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setManageTags(true)} className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white">
                  <TagIcon className="w-3.5 h-3.5" />
                  Manage tags
                </button>
                {extraFilters > 0 && (
                  <button type="button" onClick={() => { setSource('all'); setTagFilter('all') }} className="text-xs text-[#CEB466] hover:underline">
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-[#CEB466]/40 bg-[#1a1433]/95 backdrop-blur px-4 py-2 shadow-lg shadow-black/30">
          <span className="text-sm font-medium text-white">{selected.size} selected</span>
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
              {activeFunnels.map(funnelOption)}
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
        <div className={`rounded-xl px-4 py-2 text-sm border ${toast.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
          {toast.text}
        </div>
      )}

      {/* Table */}
      <div className="glass-card p-4">
        {/* Top pager */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-xs text-gray-500">
            {rangeText}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Show
              <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} className="glass-select text-xs py-1 pr-7">
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            {pageCount > 1 && pager}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">{rows.length === 0 ? 'Your community starts here. Import a CSV or collect leads through your website.' : 'Nothing matches those filters.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-[11px] text-gray-500 uppercase tracking-wider">
                  <th className="px-2 py-2 w-9">
                    <button
                      type="button"
                      onClick={toggleAll}
                      aria-label={allVisibleSelected ? 'Deselect all shown' : 'Select all shown'}
                      className={`w-[16px] h-[16px] rounded border flex items-center justify-center ${allVisibleSelected || someVisibleSelected ? 'bg-[#CEB466] border-[#CEB466]' : 'border-gray-600 hover:border-gray-400'}`}
                    >
                      {allVisibleSelected ? <Check className="w-3 h-3 text-[#171229]" /> : someVisibleSelected ? <Minus className="w-3 h-3 text-[#171229]" /> : null}
                    </button>
                  </th>
                  <th className="text-left px-2 py-2 font-medium w-[30%]">Person</th>
                  <th className="text-left px-2 py-2 font-medium w-[22%]">Tags</th>
                  <th className="text-left px-2 py-2 font-medium w-[16%]">Came from</th>
                  <th className="text-left px-2 py-2 font-medium">Funnel</th>
                  <th className="text-right px-2 py-2 font-medium w-[90px]">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pageRows.map((r) => {
                  const badge = r.enrollment ? STATUS[r.enrollment.status] || STATUS.active : null
                  const isSelected = selected.has(r.id)
                  const isOpen = openId === r.id
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className={`cursor-pointer transition-colors align-middle ${isOpen ? 'bg-[#CEB466]/[0.09]' : isSelected ? 'bg-[#CEB466]/[0.05]' : 'hover:bg-white/5'}`}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleOne(r.id)}
                          aria-label={isSelected ? `Deselect ${r.name || r.email}` : `Select ${r.name || r.email}`}
                          className={`w-[16px] h-[16px] rounded border flex items-center justify-center ${isSelected ? 'bg-[#CEB466] border-[#CEB466]' : 'border-gray-600 hover:border-gray-400'}`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-[#171229]" />}
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-white leading-tight">{r.name || r.email}</span>
                          {r.persona === 'coach' && pill('Coach', 'bg-violet-500/20 text-violet-300')}
                          {r.hasAccount && pill('Account', 'bg-emerald-500/15 text-emerald-300', 'Has an app account')}
                          {r.unsubscribed && pill('No marketing', 'bg-red-500/15 text-red-300')}
                        </div>
                        {r.name && <p className="text-xs text-gray-500 leading-tight mt-0.5">{r.email}</p>}
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
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
                      <td className="px-2 py-2">
                        <span className="text-sm text-gray-200 truncate block max-w-[200px]" title={`${r.sourceLabel} · ${r.typeLabel}`}>{r.sourceLabel}</span>
                      </td>
                      <td className="px-2 py-2">
                        {r.enrollment ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-white truncate max-w-[220px]">{r.enrollment.funnelName}</span>
                            {badge && <span className={`px-1.5 py-px text-[10px] rounded-full whitespace-nowrap ${badge.cls}`}>{badge.text}</span>}
                            {r.enrollment.lastError && <AlertTriangle className="w-3.5 h-3.5 text-amber-300" aria-label="Last send failed" />}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500" title={r.note || undefined}>No funnel</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-sm text-gray-300 whitespace-nowrap">
                        <span title={exact(r.createdAt)}>{shortDate(r.createdAt)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom pager */}
        {pageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-white/10">
            <p className="text-xs text-gray-500">Page {currentPage} of {pageCount}</p>
            {pager}
          </div>
        )}
      </div>

      {openLead && (
        <LeadDetailPanel
          lead={openLead}
          funnels={activeFunnels}
          tagsError={tagsError}
          onClose={() => setOpenId(null)}
          onTagsChange={(tags) => setRowTags(openLead.id, tags)}
          onAutomation={(note) => {
            setToast({ kind: 'ok', text: `${openLead.name || openLead.email}: ${note}` })
            router.refresh()
          }}
          onEnroll={async (funnelId) => {
            try {
              await enroll(funnelId, [openLead.id])
            } catch (e) {
              setToast({ kind: 'error', text: e instanceof Error ? e.message : 'Could not enroll' })
            }
          }}
          onDelete={() => setPendingDelete(openLead)}
        />
      )}

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

// ---------------------------------------------------------------------------
// Side panel with the full story for one lead
// ---------------------------------------------------------------------------

function LeadDetailPanel({
  lead,
  funnels,
  tagsError,
  onClose,
  onTagsChange,
  onAutomation,
  onEnroll,
  onDelete,
}: {
  lead: LeadRow
  funnels: FunnelOption[]
  tagsError: string | null
  onClose: () => void
  onTagsChange: (tags: ContactTag[]) => void
  onAutomation: (note: string) => void
  onEnroll: (funnelId: string) => Promise<void>
  onDelete: () => void
}) {
  const [funnelId, setFunnelId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const badge = lead.enrollment ? STATUS[lead.enrollment.status] || STATUS.active : null
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2 border-b border-white/5 text-sm">
      <span className="text-xs uppercase tracking-wide text-gray-500 pt-0.5">{label}</span>
      <div className="text-gray-200 min-w-0">{children}</div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={`Details for ${lead.name || lead.email}`}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-[#171229] border-l border-white/10 shadow-2xl shadow-black/60 flex flex-col"
      >
        <header className="flex items-start justify-between gap-3 p-5 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{lead.name || lead.email}</h2>
            <a href={`mailto:${lead.email}`} className="text-sm text-gray-400 hover:text-[#CEB466] inline-flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              {lead.email}
            </a>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {pill(lead.persona === 'coach' ? 'Coach' : 'Singer', lead.persona === 'coach' ? 'bg-violet-500/20 text-violet-300' : 'bg-[#CEB466]/15 text-[#CEB466]')}
              {lead.hasAccount && pill('Has account', 'bg-emerald-500/15 text-emerald-300')}
              {lead.unsubscribed && pill('No marketing', 'bg-red-500/15 text-red-300')}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <Row label="Tags">
            <ContactTagEditor leadId={lead.id} tags={lead.tags} onChange={onTagsChange} readOnly={!!tagsError} onAutomation={onAutomation} align="right" />
          </Row>
          <Row label="Came from">
            <p>{lead.sourceLabel}</p>
            <p className="text-xs text-gray-500">{lead.typeLabel}{lead.page ? ` · ${lead.page}` : ''}</p>
          </Row>
          <Row label="Received">
            <p>{exact(lead.createdAt)}</p>
            <p className="text-xs text-gray-500">{relative(lead.createdAt)}{lead.updatedAt !== lead.createdAt ? ` · updated ${relative(lead.updatedAt)}` : ''}</p>
          </Row>
          <Row label="Funnel">
            {lead.enrollment ? (
              <div className="space-y-1.5">
                <Link
                  href={`/dashboard/email-templates/funnels/${lead.enrollment.funnelId}`}
                  className="inline-flex items-center gap-1.5 text-white hover:text-[#CEB466]"
                >
                  {lead.enrollment.funnelName}
                  <ExternalLink className="w-3.5 h-3.5 text-[#CEB466]" />
                </Link>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                  {badge && <span className={`px-2 py-0.5 text-[11px] rounded-full ${badge.cls}`}>{badge.text}</span>}
                  <span>{lead.enrollment.sent} of {lead.enrollment.totalSteps || '?'} emails sent</span>
                </div>
                {lead.enrollment.status === 'active' && lead.enrollment.nextAt && (
                  <p className="text-xs text-gray-400">Next email {relative(lead.enrollment.nextAt)} · {exact(lead.enrollment.nextAt)}</p>
                )}
                {lead.enrollment.lastSentAt && <p className="text-xs text-gray-500">Last sent {exact(lead.enrollment.lastSentAt)}</p>}
                <p className="text-xs text-gray-500">Enrolled via {lead.enrollment.via}</p>
                {lead.enrollment.lastError && (
                  <p className="text-xs text-amber-300 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {lead.enrollment.lastError}</p>
                )}
                {lead.enrollment.cancelReason && <p className="text-xs text-gray-500">{lead.enrollment.cancelReason}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-400">No funnel</p>
                {lead.note && <p className="text-xs text-gray-500 leading-relaxed">{lead.note}</p>}
                {funnels.length > 0 && !lead.unsubscribed && (
                  <div className="flex items-center gap-1.5">
                    <select value={funnelId} onChange={(e) => setFunnelId(e.target.value)} className="glass-select text-sm py-1.5 flex-1 min-w-0">
                      <option value="">Add to funnel…</option>
                      {funnels.map((f) => (
                        <option key={f.id} value={f.id} disabled={f.status !== 'active'}>{f.name}{f.status !== 'active' ? ' (off)' : ''}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!funnelId || busy}
                      onClick={async () => {
                        setBusy(true)
                        try { await onEnroll(funnelId) } finally { setBusy(false); setFunnelId('') }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 glass-button-gold rounded-lg text-sm font-medium disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Add
                    </button>
                  </div>
                )}
              </div>
            )}
          </Row>
        </div>

        <footer className="p-4 border-t border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete lead
          </button>
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10">
            Close
          </button>
        </footer>
      </aside>
    </div>
  )
}
