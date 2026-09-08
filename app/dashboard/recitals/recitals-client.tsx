'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Clock3, Copy, Check, Plus, Radio, Settings2, Theater, Trash2, Users } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatJoinCode } from '@/lib/recital/join-code'
import type { Recital } from '@/types/recital.types'

interface RecitalRow extends Recital {
  host_name: string
  is_host: boolean
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatusPill({ status }: { status: Recital['status'] }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#CEB466] text-[#171229] text-[10px] font-extrabold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-[#171229] animate-pulse" /> Live now
      </span>
    )
  }
  if (status === 'ended') return <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-gray-400 text-[10px] font-bold uppercase tracking-wider">Ended</span>
  return <span className="px-2 py-0.5 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[#CEB466] text-[10px] font-bold uppercase tracking-wider">Upcoming</span>
}

export function RecitalsClient({ isTeacher }: { isTeacher: boolean }) {
  const [recitals, setRecitals] = useState<RecitalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RecitalRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recitals', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load recitals')
      setRecitals(data.recitals || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recitals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyLink = async (r: RecitalRow) => {
    const url = `${window.location.origin}/recital/${r.join_code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(r.id)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      // ignore
    }
  }

  const deleteRecital = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/recitals/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not delete recital')
      }
      setRecitals((prev) => prev.filter((r) => r.id !== pendingDelete.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete recital')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const upcoming = recitals.filter((r) => r.status !== 'ended')
  const past = recitals.filter((r) => r.status === 'ended')

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2">
            <Theater className="w-3.5 h-3.5" />
            <span>Voice Alchemy · Recitals</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">Recitals</h1>
          <p className="text-xs sm:text-sm text-gray-300 mt-1 max-w-2xl leading-relaxed">
            {isTeacher
              ? 'Host a live group recital. Build the program, share one link, and put each singer on stage while everyone else listens.'
              : 'Live group recitals hosted by your teacher. Join from here or with the link they share.'}
          </p>
        </div>
        {isTeacher && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all self-start md:self-auto"
          >
            <Plus className="w-4 h-4" /> New recital
          </button>
        )}
      </div>

      {error && <div className="glass-card p-4 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card h-44 animate-pulse" />
          ))}
        </div>
      ) : recitals.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center mb-4">
            <Theater className="w-6 h-6 text-[#CEB466]" />
          </div>
          <h2 className="text-xl font-bold text-white font-luxury">No recitals yet</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            {isTeacher ? 'Create your first recital and share the link with your students and their families.' : 'When your teacher schedules a recital it will appear here.'}
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Upcoming &amp; live</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {upcoming.map((r) => (
                  <RecitalCard key={r.id} recital={r} copied={copied === r.id} onCopy={() => void copyLink(r)} onDelete={() => setPendingDelete(r)} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Past recitals</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {past.map((r) => (
                  <RecitalCard key={r.id} recital={r} copied={copied === r.id} onCopy={() => void copyLink(r)} onDelete={() => setPendingDelete(r)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {creating && <CreateRecitalModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load() }} />}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Delete "${pendingDelete?.title ?? ''}"?`}
        message="The link stops working, the program is removed and any saved recordings are deleted. This cannot be undone."
        confirmText={deleting ? 'Deleting…' : 'Delete recital'}
        destructive
        onConfirm={() => void deleteRecital()}
        onCancel={() => !deleting && setPendingDelete(null)}
      />
    </div>
  )
}

function RecitalCard({ recital: r, copied, onCopy, onDelete }: { recital: RecitalRow; copied: boolean; onCopy: () => void; onDelete: () => void }) {
  return (
    <div className={`${r.status === 'live' ? 'glass-card-gold' : 'glass-card'} p-5 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white font-luxury truncate">{r.title}</h3>
          <p className="text-xs text-gray-400 truncate">Hosted by {r.is_host ? 'you' : r.host_name}</p>
        </div>
        <StatusPill status={r.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
        <span className="inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-[#CEB466]" />{whenLabel(r.scheduled_at)}</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 text-[#CEB466]" />{r.duration_minutes} min</span>
      </div>
      {r.is_host && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Code</span>
          <span className="font-mono text-sm text-[#e0c97d] tracking-widest">{formatJoinCode(r.join_code)}</span>
          <button type="button" onClick={onCopy} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-[11px] font-semibold transition-colors">
            {copied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-1">
        {r.status !== 'ended' && (
          <Link
            href={`/recital/${r.join_code}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Radio className="w-3.5 h-3.5" /> {r.is_host ? 'Open stage' : 'Join'}
          </Link>
        )}
        {r.is_host && (
          <>
            <Link href={`/dashboard/recitals/${r.id}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
              <Settings2 className="w-3.5 h-3.5 text-[#CEB466]" /> {r.status === 'ended' ? 'Recordings' : 'Manage'}
            </Link>
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto p-2 rounded-xl bg-white/[0.04] hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-gray-400 hover:text-red-200 transition-colors"
              title="Delete recital"
              aria-label={`Delete ${r.title}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function CreateRecitalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    d.setHours(18, 0, 0, 0)
    return toLocalInputValue(d)
  })
  const [duration, setDuration] = useState(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!title.trim()) {
      setError('Give the recital a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/recitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), scheduledAt: new Date(when).toISOString(), durationMinutes: duration }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create recital')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create recital')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="New recital" className="relative modal-solid rounded-2xl border-2 border-[#CEB466]/50 shadow-2xl shadow-black/80 w-full max-w-lg p-5 sm:p-6 animate-slide-up">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#CEB466]/15 text-[#CEB466] border border-[#CEB466]/30">
            <Theater className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-luxury">New recital</h3>
            <p className="text-xs text-gray-300 mt-0.5">You&apos;ll get a share link and can build the program next.</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring Recital 2026" maxLength={120} className="glass-input w-full mt-1 px-3.5 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Date &amp; time</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="glass-input w-full mt-1 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#CEB466]/50 [color-scheme:dark]" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Length</span>
              <select value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))} className="glass-select w-full mt-1 text-sm">
                {[45, 60, 90, 120, 150, 180].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">A note for guests (optional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Welcome families and friends! Please arrive a few minutes early to get settled." className="glass-input w-full mt-1 px-3.5 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50 resize-none" />
          </label>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white text-xs font-semibold transition-colors">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
            {busy ? 'Creating…' : 'Create recital'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RosterCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-300"><Users className="w-3.5 h-3.5 text-[#CEB466]" />{count}</span>
  )
}
