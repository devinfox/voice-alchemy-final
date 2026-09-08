'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarClock, Check, Copy, Download, Film, Link2, Radio, Theater, Trash2, Users } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { ProgramPanel } from '@/components/recital/ProgramPanel'
import { formatJoinCode } from '@/lib/recital/join-code'
import type { Recital, RecitalParticipant, RecitalPerformance, RecitalRecording, RecitalSettings } from '@/types/recital.types'

interface Detail {
  recital: Recital & { settings: RecitalSettings }
  hostName: string
  participants: RecitalParticipant[]
  performances: RecitalPerformance[]
  isHost: boolean
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function sizeLabel(bytes: number | null): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

export function ManageRecitalClient({ recitalId }: { recitalId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [recordings, setRecordings] = useState<RecitalRecording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [savingSetting, setSavingSetting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [detailRes, recRes] = await Promise.all([
        fetch(`/api/recitals/${recitalId}`, { cache: 'no-store' }),
        fetch(`/api/recitals/${recitalId}/recordings`, { cache: 'no-store' }),
      ])
      const detailData = await detailRes.json()
      if (!detailRes.ok) throw new Error(detailData.error || 'Could not load recital')
      setDetail(detailData)
      if (recRes.ok) {
        const recData = await recRes.json()
        setRecordings(recData.recordings || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recital')
    } finally {
      setLoading(false)
    }
  }, [recitalId])

  useEffect(() => {
    void load()
  }, [load])

  const copy = async (what: 'link' | 'code') => {
    if (!detail) return
    const text = what === 'link' ? `${window.location.origin}/recital/${detail.recital.join_code}` : formatJoinCode(detail.recital.join_code)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      // ignore
    }
  }

  const updateSetting = async (key: keyof RecitalSettings, value: boolean) => {
    if (!detail) return
    setSavingSetting(key)
    try {
      const res = await fetch(`/api/recitals/${recitalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { [key]: value } }),
      })
      if (res.ok) await load()
    } finally {
      setSavingSetting(null)
    }
  }

  const cancelRecital = async () => {
    setConfirmCancel(false)
    await fetch(`/api/recitals/${recitalId}`, { method: 'DELETE' })
    window.location.href = '/dashboard/recitals'
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-64 rounded-xl bg-white/[0.04]" />
        <div className="glass-card h-40" />
        <div className="glass-card h-64" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-red-300">{error || 'Not found'}</p>
        <Link href="/dashboard/recitals" className="inline-flex items-center gap-1.5 mt-4 text-xs text-[#CEB466] hover:underline"><ArrowLeft className="w-3.5 h-3.5" /> Back to recitals</Link>
      </div>
    )
  }

  const { recital, participants, performances } = detail
  const settingRows: Array<{ key: keyof RecitalSettings; label: string; help: string }> = [
    { key: 'audienceVideo', label: 'Audience cameras', help: 'Guests appear on small tiles while they listen. Turn off for very large groups.' },
    { key: 'localRecording', label: 'Save each performance', help: 'Each singer’s device keeps a clean copy of their piece and uploads it here.' },
    { key: 'hostArchive', label: 'Keep a backup copy', help: 'Your device also records what you see and hear from the stage.' },
    { key: 'allowSelfUnmute', label: 'Guests can unmute during performances', help: 'Everyone is muted automatically when a singer starts. Leave this on to let them unmute themselves.' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/dashboard/recitals" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#CEB466] transition-colors mb-3"><ArrowLeft className="w-3.5 h-3.5" /> All recitals</Link>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2">
              <Theater className="w-3.5 h-3.5" />
              <span>{recital.status === 'live' ? 'Live now' : recital.status === 'ended' ? 'Ended' : 'Upcoming recital'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">{recital.title}</h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1 inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-[#CEB466]" />{whenLabel(recital.scheduled_at)} · {recital.duration_minutes} min</p>
          </div>
          {recital.status !== 'ended' && (
            <Link href={`/recital/${recital.join_code}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all self-start md:self-auto">
              <Radio className="w-4 h-4" /> Open the stage
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Share */}
        <section className="glass-card-gold p-5 xl:col-span-1">
          <h2 className="text-lg font-bold text-white font-luxury">Invite everyone</h2>
          <p className="text-xs text-gray-300 mt-1">Guests don&apos;t need an account. Send the link, or read out the code.</p>
          <div className="mt-4 rounded-xl bg-[#0f0b1e]/60 border border-white/10 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Join code</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-2xl text-[#e0c97d] tracking-[0.3em]">{formatJoinCode(recital.join_code)}</span>
              <button type="button" onClick={() => void copy('code')} className="ml-auto p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200" aria-label="Copy code">
                {copied === 'code' ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="button" onClick={() => void copy('link')} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
            {copied === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Link2 className="w-3.5 h-3.5 text-[#CEB466]" />} {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-300">
            <Users className="w-3.5 h-3.5 text-[#CEB466]" />
            {participants.filter((p) => p.role !== 'host').length} signed in so far
          </div>
        </section>

        {/* Program */}
        <section className="glass-card xl:col-span-2 flex flex-col min-h-[22rem]">
          <div className="px-5 pt-5 pb-3 border-b border-white/10">
            <h2 className="text-lg font-bold text-white font-luxury">Program</h2>
            <p className="text-xs text-gray-300 mt-1">Set the running order now, or add singers on the night. You can put anyone on stage from the room too.</p>
          </div>
          <div className="flex-1 min-h-0">
            <ProgramPanel
              recitalId={recitalId}
              performances={performances}
              roster={participants}
              isHost
              mode="editor"
              onChanged={() => void load()}
            />
          </div>
        </section>
      </div>

      {/* Settings */}
      <section className="glass-card p-5">
        <h2 className="text-lg font-bold text-white font-luxury">Recital options</h2>
        <div className="mt-3 divide-y divide-white/10">
          {settingRows.map((row) => (
            <div key={row.key} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white font-medium">{row.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{row.help}</p>
              </div>
              <Switch
                checked={!!recital.settings[row.key]}
                disabled={savingSetting === row.key}
                onCheckedChange={(v: boolean) => void updateSetting(row.key, v)}
                aria-label={row.label}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Recordings */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-[#CEB466]" />
          <h2 className="text-lg font-bold text-white font-luxury">Recordings</h2>
        </div>
        {recordings.length === 0 ? (
          <p className="text-xs text-gray-400 mt-2">Performances are saved here automatically once the recital happens.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10">
            {recordings.map((rec) => (
              <li key={rec.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">
                    {rec.performance ? `${rec.performance.performer_name} — ${rec.performance.song_title}` : 'Performance'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rec.kind === 'performer-local' ? 'Singer’s clean copy' : 'Your backup copy'}
                    {rec.duration_seconds ? ` · ${Math.floor(rec.duration_seconds / 60)}:${String(rec.duration_seconds % 60).padStart(2, '0')}` : ''}
                    {rec.file_size ? ` · ${sizeLabel(rec.file_size)}` : ''}
                  </p>
                </div>
                {rec.url && (
                  <a href={rec.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
                    <Download className="w-3.5 h-3.5 text-[#CEB466]" /> Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex items-center justify-between gap-4 glass-card-subtle p-4">
        <p className="text-xs text-gray-400">
          {recital.status === 'ended'
            ? 'Deleting removes this recital and every saved recording for good.'
            : 'Plans changed? Deleting removes the recital, its link and the program.'}
        </p>
        <button type="button" onClick={() => setConfirmCancel(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-200 text-xs font-semibold transition-colors shrink-0">
          <Trash2 className="w-3.5 h-3.5" /> Delete recital
        </button>
      </section>

      <ConfirmDialog
        isOpen={confirmCancel}
        title="Delete this recital?"
        message="The link stops working, the program is removed and any saved recordings are deleted. This cannot be undone."
        confirmText="Delete recital"
        destructive
        onConfirm={() => void cancelRecital()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  )
}
