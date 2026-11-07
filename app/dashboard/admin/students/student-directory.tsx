'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Users, Search, Download, ArrowUpDown, Mail, Phone, Calendar, Activity,
  AlertTriangle, CheckCircle2, RefreshCw, Music, ChevronLeft, ChevronRight, Tag as TagIcon,
} from 'lucide-react'
import { ContactTagEditor, type ContactTag } from '@/components/tags/contact-tag-editor'
import { ManageTagsModal } from '@/components/tags/manage-tags-modal'
import { useTags } from '@/components/tags/use-tags'

const PAGE_SIZE = 25

interface AdminStudentRow {
  id: string
  firstName: string | null
  lastName: string | null
  displayName: string
  email: string | null
  phone: string | null
  role: string | null
  timezone: string | null
  joinedAt: string | null
  lastSignInAt: string | null
  emailConfirmed: boolean
  activeTeachers: number
  pendingRequests: number
  teacherNames: string[]
  lessonsRecorded: number
  notesCount: number
  trainingSessions: number
  lastActivityAt: string | null
  hasProfile: boolean
  tags?: ContactTag[]
}

interface Summary {
  total: number
  withProfile: number
  withoutProfile: number
  byRole: Record<string, number>
  neverSignedIn: number
  withPhone: number
}

type SortKey =
  | 'displayName' | 'email' | 'joinedAt' | 'lastSignInAt'
  | 'activeTeachers' | 'lessonsRecorded' | 'trainingSessions' | 'lastActivityAt'

const dateFmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const relative = (iso: string | null) => {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function StudentDirectory() {
  const [rows, setRows] = useState<AdminStudentRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('joinedAt')
  const [sortAsc, setSortAsc] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'noProfile'>('all')
  const [page, setPage] = useState(1)
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [manageTags, setManageTags] = useState(false)
  const [tagNote, setTagNote] = useState<string | null>(null)
  const { tags: allTags, error: tagsError } = useTags()

  useEffect(() => {
    if (!tagNote) return
    const t = setTimeout(() => setTagNote(null), 6000)
    return () => clearTimeout(t)
  }, [tagNote])

  const setRowTags = (id: string, tags: ContactTag[]) => setRows(prev => prev.map(r => (r.id === id ? { ...r, tags } : r)))

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/students')
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load')
      const data = await res.json()
      setRows(data.students ?? [])
      setSummary(data.summary ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load students')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows

    if (filter === 'active') out = out.filter(r => r.activeTeachers > 0)
    else if (filter === 'inactive') out = out.filter(r => r.activeTeachers === 0 && r.hasProfile)
    else if (filter === 'noProfile') out = out.filter(r => !r.hasProfile)

    if (tagFilter === '__none__') out = out.filter(r => (r.tags ?? []).length === 0)
    else if (tagFilter !== 'all') out = out.filter(r => (r.tags ?? []).some(t => t.id === tagFilter))

    if (q) {
      out = out.filter(r =>
        r.displayName.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q) ||
        r.teacherNames.some(t => t.toLowerCase().includes(q)) ||
        (r.tags ?? []).some(t => t.name.toLowerCase().includes(q))
      )
    }

    return [...out].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
  }, [rows, query, sortKey, sortAsc, filter, tagFilter])

  // Back to the first page whenever the result set changes shape.
  useEffect(() => { setPage(1) }, [query, filter, tagFilter, sortKey, sortAsc, rows.length])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visible, currentPage],
  )
  const firstIndex = visible.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const lastIndex = Math.min(currentPage * PAGE_SIZE, visible.length)

  // Page numbers to render: always first/last, plus a window around the current page.
  const pageNumbers = useMemo(() => {
    const nums = new Set<number>([1, pageCount])
    for (let p = currentPage - 1; p <= currentPage + 1; p++) {
      if (p >= 1 && p <= pageCount) nums.add(p)
    }
    return [...nums].sort((a, b) => a - b)
  }, [currentPage, pageCount])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const exportCsv = () => {
    const headers = [
      'First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Tags', 'Joined',
      'Last Sign In', 'Email Confirmed', 'Active Teachers', 'Teachers',
      'Pending Requests', 'Lessons Recorded', 'Class Notes', 'Training Sessions',
      'Last Activity', 'Timezone',
    ]
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = visible.map(r => [
      r.firstName, r.lastName, r.email, r.phone, r.role, (r.tags ?? []).map(t => t.name).join('; '), r.joinedAt,
      r.lastSignInAt, r.emailConfirmed ? 'yes' : 'no', r.activeTeachers,
      r.teacherNames.join('; '), r.pendingRequests, r.lessonsRecorded,
      r.notesCount, r.trainingSessions, r.lastActivityAt, r.timezone,
    ].map(escape).join(','))

    const blob = new Blob([[headers.map(escape).join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-4 py-3 text-left">
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
          sortKey === k ? 'text-[#CEB466]' : 'text-slate-400 hover:text-white'
        }`}
      >
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center shadow-lg shadow-[#CEB466]/25">
              <Users className="w-5 h-5 text-[#171229]" />
            </div>
            Student Directory
          </h1>
          <p className="text-slate-400 mt-2">
            Every account on the platform, with contact details and engagement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-sm text-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!visible.length}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] text-[#171229] text-sm font-semibold transition-all hover:from-[#e0c97d] hover:to-[#CEB466] disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total accounts', value: summary.total, icon: Users },
            { label: 'With a teacher', value: rows.filter(r => r.activeTeachers > 0).length, icon: CheckCircle2 },
            { label: 'Never signed in', value: summary.neverSignedIn, icon: AlertTriangle },
            { label: 'No profile row', value: summary.withoutProfile, icon: AlertTriangle },
            { label: 'Phone on file', value: summary.withPhone, icon: Phone },
          ].map(s => (
            <div key={s.label} className="glass-card-subtle rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {summary && summary.withPhone === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-100/90">
            <p className="font-semibold text-amber-200">No phone numbers on file</p>
            <p className="mt-1">
              Phone is not collected anywhere in the app today — not at signup, not in settings.
              The column exists so numbers can be added, but it will stay empty until phone
              capture is added to the signup form or entered manually.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, email, phone, tag or teacher…"
            className="w-full pl-11 pr-4 py-2.5 glass-input rounded-xl"
          />
        </div>
        {!tagsError && (
          <>
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="glass-select text-sm">
              <option value="all">Any tag</option>
              <option value="__none__">No tags</option>
              {allTags.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setManageTags(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-sm text-slate-200 transition-colors"
            >
              <TagIcon className="w-4 h-4" />
              Tags
            </button>
          </>
        )}
        <div className="flex gap-1 glass-card-subtle border border-white/[0.08] p-1 rounded-xl">
          {([
            ['all', 'All'],
            ['active', 'With teacher'],
            ['inactive', 'No teacher'],
            ['noProfile', 'Incomplete'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === key
                  ? 'bg-gradient-to-r from-[#CEB466] to-[#9c8644] text-[#171229]'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      {tagNote && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          {tagNote}
        </div>
      )}

      <div className="glass-card rounded-2xl border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px]">
            <thead className="bg-white/[0.03] border-b border-white/[0.08]">
              <tr>
                <SortHeader label="Student" k="displayName" />
                <SortHeader label="Email" k="email" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</th>
                <SortHeader label="Joined" k="joinedAt" />
                <SortHeader label="Last sign in" k="lastSignInAt" />
                <SortHeader label="Teachers" k="activeTeachers" />
                <SortHeader label="Lessons" k="lessonsRecorded" />
                <SortHeader label="Training" k="trainingSessions" />
                <SortHeader label="Last active" k="lastActivityAt" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading students…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    No students match this filter.
                  </td>
                </tr>
              ) : (
                pageRows.map(r => (
                  <tr key={r.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-xs shrink-0">
                          {r.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{r.displayName}</p>
                          <div className="flex items-center gap-1.5">
                            {r.role && (
                              <span className="text-xs text-[#CEB466]/70 capitalize">{r.role}</span>
                            )}
                            {!r.hasProfile && (
                              <span className="text-xs text-amber-400">no profile</span>
                            )}
                            {r.pendingRequests > 0 && (
                              <span className="text-xs text-blue-300">{r.pendingRequests} pending</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.email ? (
                        <a href={`mailto:${r.email}`} className="text-sm text-slate-300 hover:text-[#CEB466] inline-flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-[220px]">{r.email}</span>
                        </a>
                      ) : <span className="text-slate-600">—</span>}
                      {r.email && !r.emailConfirmed && (
                        <span className="ml-2 text-xs text-amber-400">unconfirmed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[160px]">
                      {r.hasProfile ? (
                        <ContactTagEditor
                          studentId={r.id}
                          tags={r.tags ?? []}
                          onChange={tags => setRowTags(r.id, tags)}
                          readOnly={!!tagsError}
                          onAutomation={note => setTagNote(`${r.displayName}: ${note}`)}
                        />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} className="hover:text-[#CEB466] inline-flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />{r.phone}
                        </a>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        {dateFmt(r.joinedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={r.lastSignInAt ? 'text-slate-300' : 'text-amber-400'}>
                        {relative(r.lastSignInAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {r.activeTeachers > 0 ? (
                        <span title={r.teacherNames.join(', ')}>
                          {r.activeTeachers}
                          {r.teacherNames.length > 0 && (
                            <span className="text-slate-500 ml-1.5 text-xs truncate">
                              {r.teacherNames[0]}
                            </span>
                          )}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {r.lessonsRecorded || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {r.trainingSessions ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5 text-[#a855f7]" />
                          {r.trainingSessions}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <Activity className="w-3.5 h-3.5 text-slate-500" />
                        {relative(r.lastActivityAt)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {visible.length === 0
            ? `Showing 0 of ${rows.length} accounts.`
            : `Showing ${firstIndex}–${lastIndex} of ${visible.length}${visible.length !== rows.length ? ` matching (${rows.length} total)` : ''} accounts.`}
        </p>

        {pageCount > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {pageNumbers.map((n, i) => {
              const gap = i > 0 && n - pageNumbers[i - 1] > 1
              return (
                <span key={n} className="flex items-center gap-1">
                  {gap && <span className="px-1 text-slate-600 text-sm">…</span>}
                  <button
                    onClick={() => setPage(n)}
                    aria-current={n === currentPage ? 'page' : undefined}
                    className={`min-w-[2.25rem] px-2 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      n === currentPage
                        ? 'bg-gradient-to-r from-[#CEB466] to-[#9c8644] text-[#171229]'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    {n}
                  </button>
                </span>
              )
            })}

            <button
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={currentPage === pageCount}
              aria-label="Next page"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>

      {manageTags && <ManageTagsModal onClose={() => setManageTags(false)} />}
    </div>
  )
}
