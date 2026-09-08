'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarClock, Check, Copy, Link2, Mail, Plus, Presentation, Radio, Trash2, UserCheck, UserPlus, Users } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { formatJoinCode } from '@/lib/recital/join-code'
import { participantName, type TrainingParticipant, type TrainingSession, type TrainingSettings } from '@/types/training.types'

interface Detail {
  session: TrainingSession & { settings: TrainingSettings }
  hostName: string
  participants: TrainingParticipant[]
  isHost: boolean
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function ManageTrainingClient({ sessionId }: { sessionId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savingSetting, setSavingSetting] = useState<string | null>(null)
  const [invite, setInvite] = useState({ firstName: '', lastName: '', email: '' })
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/training-sessions/${sessionId}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load session')
      setDetail(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load session')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const copy = async (what: 'link' | 'code') => {
    if (!detail) return
    const text = what === 'link' ? `${window.location.origin}/training/${detail.session.join_code}` : formatJoinCode(detail.session.join_code)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      // ignore
    }
  }

  const updateSetting = async (key: keyof TrainingSettings, value: boolean) => {
    setSavingSetting(key)
    try {
      const res = await fetch(`/api/training-sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { [key]: value } }) })
      if (res.ok) await load()
    } finally {
      setSavingSetting(null)
    }
  }

  const addInvite = async () => {
    if (!invite.firstName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email.trim())) {
      setInviteError('First name and a valid email are needed.')
      return
    }
    setInviteBusy(true)
    setInviteError(null)
    try {
      const res = await fetch(`/api/training-sessions/${sessionId}/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ people: [invite] }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not add')
      setInvite({ firstName: '', lastName: '', email: '' })
      await load()
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not add')
    } finally {
      setInviteBusy(false)
    }
  }

  const removePerson = async (id: string) => {
    await fetch(`/api/training-sessions/${sessionId}/participants/${id}`, { method: 'DELETE' })
    await load()
  }

  const deleteSession = async () => {
    setConfirmDelete(false)
    await fetch(`/api/training-sessions/${sessionId}`, { method: 'DELETE' })
    window.location.href = '/dashboard/training-sessions'
  }

  if (loading) {
    return <div className="space-y-4 animate-pulse"><div className="h-10 w-64 rounded-xl bg-white/[0.04]" /><div className="glass-card h-40" /><div className="glass-card h-64" /></div>
  }
  if (error || !detail) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-red-300">{error || 'Not found'}</p>
        <Link href="/dashboard/training-sessions" className="inline-flex items-center gap-1.5 mt-4 text-xs text-[#CEB466] hover:underline"><ArrowLeft className="w-3.5 h-3.5" /> Back to sessions</Link>
      </div>
    )
  }

  const { session, participants } = detail
  const invited = participants.filter((p) => p.role !== 'host' && p.invited)
  const attendees = participants.filter((p) => p.role !== 'host' && !p.invited)
  const field = 'glass-input w-full px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50'
  const settingRows: Array<{ key: keyof TrainingSettings; label: string; help: string }> = [
    { key: 'waitingRoom', label: 'Waiting room', help: 'People wait until you let them in. Invited emails skip the wait.' },
    { key: 'audienceVideo', label: 'Attendee cameras', help: 'Attendees appear on small tiles under your video.' },
    { key: 'allowSelfUnmute', label: 'Attendees can unmute themselves', help: 'Turn off to keep the room quiet; they can raise a hand instead.' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/dashboard/training-sessions" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#CEB466] transition-colors mb-3"><ArrowLeft className="w-3.5 h-3.5" /> All sessions</Link>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2">
              <Presentation className="w-3.5 h-3.5" />
              <span>{session.status === 'live' ? 'Live now' : session.status === 'ended' ? 'Ended' : 'Upcoming session'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">{session.title}</h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1 inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-[#CEB466]" />{whenLabel(session.scheduled_at)} · {session.duration_minutes} min</p>
          </div>
          {session.status !== 'ended' && (
            <Link href={`/training/${session.join_code}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all self-start md:self-auto">
              <Radio className="w-4 h-4" /> Start hosting
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="glass-card-gold p-5">
          <h2 className="text-lg font-bold text-white font-luxury">Share the link</h2>
          <p className="text-xs text-gray-300 mt-1">Anyone can open it. They enter their name and email, then wait for you to let them in.</p>
          <div className="mt-4 rounded-xl bg-[#0f0b1e]/60 border border-white/10 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Join code</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-2xl text-[#e0c97d] tracking-[0.3em]">{formatJoinCode(session.join_code)}</span>
              <button type="button" onClick={() => void copy('code')} className="ml-auto p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200" aria-label="Copy code">{copied === 'code' ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}</button>
            </div>
          </div>
          <button type="button" onClick={() => void copy('link')} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
            {copied === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Link2 className="w-3.5 h-3.5 text-[#CEB466]" />} {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
        </section>

        <section className="glass-card p-5 xl:col-span-2">
          <div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-[#CEB466]" /><h2 className="text-lg font-bold text-white font-luxury">Invite list</h2></div>
          <p className="text-xs text-gray-300 mt-1">People on this list skip the waiting room when they join with the same email. Nothing is emailed; share the link yourself.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
            <input value={invite.firstName} onChange={(e) => setInvite((v) => ({ ...v, firstName: e.target.value }))} placeholder="First name" className={field} />
            <input value={invite.lastName} onChange={(e) => setInvite((v) => ({ ...v, lastName: e.target.value }))} placeholder="Last name" className={field} />
            <input type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} placeholder="Email" className={field} onKeyDown={(e) => e.key === 'Enter' && void addInvite()} />
            <button type="button" onClick={() => void addInvite()} disabled={inviteBusy} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Add</button>
          </div>
          {inviteError && <p className="text-xs text-red-300 mt-2">{inviteError}</p>}
          {invited.length === 0 ? (
            <p className="text-xs text-gray-500 mt-4">No one invited yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {invited.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <UserCheck className="w-4 h-4 text-[#CEB466] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{participantName(p)}</p>
                    <p className="text-[11px] text-gray-500 truncate inline-flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</p>
                  </div>
                  {p.joined_at && <span className="text-[10px] text-gray-500">joined</span>}
                  <button type="button" onClick={() => void removePerson(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-white/[0.08]" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="glass-card p-5">
        <div className="flex items-center gap-2"><Users className="w-4 h-4 text-[#CEB466]" /><h2 className="text-lg font-bold text-white font-luxury">Who joined</h2></div>
        {attendees.length === 0 ? (
          <p className="text-xs text-gray-500 mt-2">Anyone who joins from the link shows up here with their name and email.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10">
            {attendees.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{participantName(p)}</p>
                  <p className="text-[11px] text-gray-500 truncate">{p.email}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${p.denied_at ? 'bg-red-500/10 border border-red-500/30 text-red-200' : p.admitted_at ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' : 'bg-white/[0.06] border border-white/10 text-gray-400'}`}>
                  {p.denied_at ? 'Denied' : p.admitted_at ? 'Admitted' : 'Waiting'}
                </span>
                <button type="button" onClick={() => void removePerson(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-white/[0.08]" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-lg font-bold text-white font-luxury">Session options</h2>
        <div className="mt-3 divide-y divide-white/10">
          {settingRows.map((row) => (
            <div key={row.key} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white font-medium">{row.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{row.help}</p>
              </div>
              <Switch checked={!!session.settings[row.key]} disabled={savingSetting === row.key} onCheckedChange={(v: boolean) => void updateSetting(row.key, v)} aria-label={row.label} />
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-between gap-4 glass-card-subtle p-4">
        <p className="text-xs text-gray-400">Deleting removes the session, its link and the invite list.</p>
        <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-200 text-xs font-semibold transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /> Delete session</button>
      </section>

      <ConfirmDialog isOpen={confirmDelete} title="Delete this session?" message="The link stops working and the invite list is removed. This cannot be undone." confirmText="Delete session" destructive onConfirm={() => void deleteSession()} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
