'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Check, Clock3, Copy, Plus, Presentation, Radio, Settings2, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatJoinCode } from '@/lib/recital/join-code'
import type { TrainingSession } from '@/types/training.types'

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatusPill({ status }: { status: TrainingSession['status'] }) {
  if (status === 'live') return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#CEB466] text-[#171229] text-[10px] font-extrabold uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-[#171229] animate-pulse" /> Live now</span>
  if (status === 'ended') return <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-gray-400 text-[10px] font-bold uppercase tracking-wider">Ended</span>
  return <span className="px-2 py-0.5 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[#CEB466] text-[10px] font-bold uppercase tracking-wider">Upcoming</span>
}

export function TrainingSessionsClient() {
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TrainingSession | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/training-sessions', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load sessions')
      setSessions(data.sessions || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyLink = async (s: TrainingSession) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/training/${s.join_code}`)
      setCopied(s.id)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      // ignore
    }
  }

  const deleteSession = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/training-sessions/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not delete session')
      setSessions((prev) => prev.filter((s) => s.id !== pendingDelete.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete session')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const upcoming = sessions.filter((s) => s.status !== 'ended')
  const past = sessions.filter((s) => s.status === 'ended')

  const card = (s: TrainingSession) => (
    <div key={s.id} className={`${s.status === 'live' ? 'glass-card-gold' : 'glass-card'} p-5 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold text-white font-luxury truncate">{s.title}</h3>
        <StatusPill status={s.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
        <span className="inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-[#CEB466]" />{whenLabel(s.scheduled_at)}</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 text-[#CEB466]" />{s.duration_minutes} min</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Code</span>
        <span className="font-mono text-sm text-[#e0c97d] tracking-widest">{formatJoinCode(s.join_code)}</span>
        <button type="button" onClick={() => void copyLink(s)} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-[11px] font-semibold transition-colors">
          {copied === s.id ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />} {copied === s.id ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-1">
        {s.status !== 'ended' && (
          <Link href={`/training/${s.join_code}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all">
            <Radio className="w-3.5 h-3.5" /> Start hosting
          </Link>
        )}
        <Link href={`/dashboard/training-sessions/${s.id}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
          <Settings2 className="w-3.5 h-3.5 text-[#CEB466]" /> Manage
        </Link>
        <button type="button" onClick={() => setPendingDelete(s)} className="ml-auto p-2 rounded-xl bg-white/[0.04] hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-gray-400 hover:text-red-200 transition-colors" title="Delete session" aria-label={`Delete ${s.title}`}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2">
            <Presentation className="w-3.5 h-3.5" />
            <span>Voice Alchemy · Community</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">Training Sessions</h1>
          <p className="text-xs sm:text-sm text-gray-300 mt-1 max-w-2xl leading-relaxed">
            Host a community session anyone can join with a link. Invite people ahead of time or admit them from the waiting room, then talk, share your screen and take questions.
          </p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all self-start md:self-auto">
          <Plus className="w-4 h-4" /> New session
        </button>
      </div>

      {error && <div className="glass-card p-4 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="glass-card h-44 animate-pulse" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center mb-4"><Presentation className="w-6 h-6 text-[#CEB466]" /></div>
          <h2 className="text-xl font-bold text-white font-luxury">No sessions yet</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Create your first community session and share the link anywhere.</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Upcoming &amp; live</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{upcoming.map(card)}</div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Past sessions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{past.map(card)}</div>
            </section>
          )}
        </>
      )}

      {creating && <CreateSessionModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load() }} />}
      <ConfirmDialog isOpen={!!pendingDelete} title={`Delete "${pendingDelete?.title ?? ''}"?`} message="The link stops working and the invite list is removed. This cannot be undone." confirmText={deleting ? 'Deleting…' : 'Delete session'} destructive onConfirm={() => void deleteSession()} onCancel={() => !deleting && setPendingDelete(null)} />
    </div>
  )
}

function CreateSessionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(12, 0, 0, 0)
    return toLocalInputValue(d)
  })
  const [duration, setDuration] = useState(60)
  const [waitingRoom, setWaitingRoom] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!title.trim()) return setError('Give the session a name.')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/training-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), scheduledAt: new Date(when).toISOString(), durationMinutes: duration, settings: { waitingRoom } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create session')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create session')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="New session" className="relative modal-solid rounded-2xl border-2 border-[#CEB466]/50 shadow-2xl shadow-black/80 w-full max-w-lg p-5 sm:p-6 animate-slide-up">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#CEB466]/15 text-[#CEB466] border border-[#CEB466]/30"><Presentation className="w-5 h-5" /></div>
          <div>
            <h3 className="text-base font-bold text-white font-luxury">New training session</h3>
            <p className="text-xs text-gray-300 mt-0.5">You&apos;ll get a share link right away.</p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Getting started with Voice Alchemy" maxLength={120} className="glass-input w-full mt-1 px-3.5 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Date &amp; time</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="glass-input w-full mt-1 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#CEB466]/50 [color-scheme:dark]" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Length</span>
              <select value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))} className="glass-select w-full mt-1 text-sm">
                {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">A note for attendees (optional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What we'll cover, and anything to have ready." className="glass-input w-full mt-1 px-3.5 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50 resize-none" />
          </label>
          <label className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 cursor-pointer">
            <input type="checkbox" checked={waitingRoom} onChange={(e) => setWaitingRoom(e.target.checked)} className="accent-[#CEB466] w-4 h-4" />
            <span className="text-xs text-gray-200">Use a waiting room</span>
            <span className="ml-auto text-[10px] text-gray-500 hidden sm:inline">You admit people; invited emails skip the wait</span>
          </label>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white text-xs font-semibold transition-colors">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">{busy ? 'Creating…' : 'Create session'}</button>
        </div>
      </div>
    </div>
  )
}
