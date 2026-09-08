'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, Search, Users } from 'lucide-react'

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

type PersonaFilter = 'all' | 'singer' | 'coach'
type StateFilter = 'all' | 'enrolled' | 'not-enrolled'

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const [search, setSearch] = useState('')
  const [persona, setPersona] = useState<PersonaFilter>('all')
  const [state, setState] = useState<StateFilter>('all')
  const [source, setSource] = useState<string>('all')

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
      if (q && !`${r.name || ''} ${r.email} ${r.sourceLabel} ${r.enrollment?.funnelName || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [persona, rows, search, source, state])

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

  const pill = (text: string, cls: string) => <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full ${cls}`}>{text}</span>

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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, source or funnel" className="glass-input w-full pl-10 pr-4 py-2 text-sm placeholder-gray-500" />
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
        <select value={state} onChange={(e) => setState(e.target.value as StateFilter)} className="glass-select text-sm">
          <option value="all">Any funnel state</option>
          <option value="enrolled">In a funnel</option>
          <option value="not-enrolled">Not in a funnel</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Website leads</h2>
          <span className="text-sm text-gray-500">{filtered.length} shown</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">{rows.length === 0 ? 'No leads yet. They appear here the moment someone leaves an email on the website.' : 'Nothing matches those filters.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left p-3 font-medium w-[28%]">Person</th>
                  <th className="text-left p-3 font-medium w-[24%]">Came from</th>
                  <th className="text-left p-3 font-medium">Funnel</th>
                  <th className="text-left p-3 font-medium w-[14%]">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const badge = r.enrollment ? STATUS[r.enrollment.status] || STATUS.active : null
                  return (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors align-top">
                      <td className="p-3">
                        <p className="font-medium text-white">{r.name || r.email}</p>
                        {r.name && <p className="text-xs text-gray-500 mt-0.5">{r.email}</p>}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {pill(r.persona === 'coach' ? 'Coach' : 'Singer', r.persona === 'coach' ? 'bg-violet-500/20 text-violet-300' : 'bg-[#CEB466]/15 text-[#CEB466]')}
                          {r.hasAccount && pill('Has account', 'bg-emerald-500/15 text-emerald-300')}
                          {r.unsubscribed && pill('Unsubscribed', 'bg-red-500/15 text-red-300')}
                        </div>
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
