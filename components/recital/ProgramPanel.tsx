'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ListMusic, Play, Plus, SkipForward, Square, Trash2, RotateCcw } from 'lucide-react'
import type { RecitalLiveState } from '@/lib/recital/protocol'
import type { RecitalParticipant, RecitalPerformance } from '@/types/recital.types'

interface ProgramPanelProps {
  recitalId: string
  /** Recital session token (in the room). On the dashboard the host's login is enough. */
  authToken?: string
  performances: RecitalPerformance[]
  roster: RecitalParticipant[]
  /** Participant ids currently in the room (live mode only). */
  presentIds?: Set<string>
  liveState?: RecitalLiveState
  isHost: boolean
  mode: 'live' | 'editor'
  onStart?: (performance: RecitalPerformance) => void
  onFinish?: (outcome: 'done' | 'skipped') => void
  onChanged: () => void
}

export function ProgramPanel({
  recitalId,
  authToken,
  performances,
  roster,
  presentIds,
  liveState,
  isHost,
  mode,
  onStart,
  onFinish,
  onChanged,
}: ProgramPanelProps) {
  const [adding, setAdding] = useState(false)
  const [performerChoice, setPerformerChoice] = useState<string>('')
  const [customName, setCustomName] = useState('')
  const [song, setSong] = useState('')
  const [composer, setComposer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authToken) h.Authorization = `Bearer ${authToken}`
    return h
  }, [authToken])

  const call = async (path: string, init: RequestInit) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(path, { ...init, headers })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong')
      }
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const performerOptions = useMemo(() => {
    const people = roster.filter((p) => p.role !== 'host' || mode === 'live')
    const present = people.filter((p) => presentIds?.has(p.id))
    const absent = people.filter((p) => !presentIds?.has(p.id))
    return { present, absent }
  }, [mode, presentIds, roster])

  const submitAdd = async () => {
    const chosen = roster.find((p) => p.id === performerChoice)
    const performerName = chosen ? chosen.display_name : customName.trim()
    if (!performerName || !song.trim()) {
      setError('Add a performer and a song.')
      return
    }
    await call(`/api/recitals/${recitalId}/performances`, {
      method: 'POST',
      body: JSON.stringify({ performerName, participantId: chosen?.id ?? null, songTitle: song.trim(), composer: composer.trim() || null }),
    })
    setSong('')
    setComposer('')
    setCustomName('')
    setAdding(false)
  }

  const move = async (index: number, dir: -1 | 1) => {
    const ids = performances.map((p) => p.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await call(`/api/recitals/${recitalId}/performances`, { method: 'PATCH', body: JSON.stringify({ order: ids }) })
  }

  const remove = (id: string) => call(`/api/recitals/${recitalId}/performances/${id}`, { method: 'DELETE' })
  const requeue = (id: string) =>
    call(`/api/recitals/${recitalId}/performances/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'queued' }) })

  const currentId = liveState?.current?.performanceId ?? null
  const nextUp = performances.find((p) => p.status === 'queued' && p.id !== currentId)

  const statusPill = (p: RecitalPerformance) => {
    if (p.id === currentId || p.status === 'performing') {
      return <span className="px-2 py-0.5 rounded-full bg-[#CEB466] text-[#171229] text-[10px] font-extrabold uppercase tracking-wider">On stage</span>
    }
    if (p.status === 'done') return <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">Done</span>
    if (p.status === 'skipped') return <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-gray-400 text-[10px] font-bold uppercase tracking-wider">Skipped</span>
    if (nextUp?.id === p.id && mode === 'live') return <span className="px-2 py-0.5 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[#CEB466] text-[10px] font-bold uppercase tracking-wider">Up next</span>
    return null
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        {performances.length === 0 && !adding && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 text-gray-500 py-10">
            <div className="w-11 h-11 rounded-2xl bg-[#CEB466]/10 border border-[#CEB466]/20 flex items-center justify-center mb-3">
              <ListMusic className="w-5 h-5 text-[#CEB466]" />
            </div>
            <p className="text-sm text-gray-300 font-medium">No program yet</p>
            <p className="text-xs mt-1">{isHost ? 'Add performers and their songs in the order they will sing.' : 'The host will add performers shortly.'}</p>
          </div>
        )}

        {performances.map((p, index) => {
          const isCurrent = p.id === currentId || p.status === 'performing'
          const present = p.participant_id ? presentIds?.has(p.participant_id) : undefined
          return (
            <div
              key={p.id}
              className={`rounded-xl border px-3 py-2.5 ${
                isCurrent ? 'bg-[#CEB466]/10 border-[#CEB466]/40' : 'bg-white/[0.04] border-white/10'
              } ${p.status === 'done' || p.status === 'skipped' ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 w-6 h-6 rounded-lg bg-white/[0.06] border border-white/10 text-[11px] font-bold text-gray-300 flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{p.performer_name}</span>
                    {mode === 'live' && present === false && <span className="text-[10px] text-gray-500">not here yet</span>}
                    {statusPill(p)}
                  </div>
                  <p className="text-xs text-gray-300 truncate">
                    {p.song_title}
                    {p.composer && <span className="text-gray-500"> · {p.composer}</span>}
                  </p>
                </div>
              </div>

              {isHost && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {mode === 'live' && !isCurrent && p.status === 'queued' && onStart && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onStart(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-[11px] font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Play className="w-3 h-3" /> Put on stage
                    </button>
                  )}
                  {mode === 'live' && isCurrent && onFinish && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onFinish('done')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold hover:bg-emerald-500/30 transition-colors"
                      >
                        <Square className="w-3 h-3" /> Finish
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onFinish('skipped')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-gray-200 text-[11px] font-semibold hover:bg-white/[0.12] transition-colors"
                      >
                        <SkipForward className="w-3 h-3" /> Skip
                      </button>
                    </>
                  )}
                  {(p.status === 'done' || p.status === 'skipped') && (
                    <button type="button" disabled={busy} onClick={() => requeue(p.id)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-gray-300 hover:text-white hover:bg-white/[0.08] transition-colors">
                      <RotateCcw className="w-3 h-3" /> Back in line
                    </button>
                  )}
                  <span className="ml-auto flex items-center gap-0.5">
                    <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30" aria-label="Move up">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" disabled={busy || index === performances.length - 1} onClick={() => move(index, 1)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30" aria-label="Move down">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {!isCurrent && (
                      <button type="button" disabled={busy} onClick={() => remove(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-white/[0.08]" aria-label="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              )}
            </div>
          )
        })}

        {isHost && adding && (
          <div className="rounded-xl border border-[#CEB466]/30 bg-[#CEB466]/5 p-3 space-y-2.5 animate-fade-in">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Performer</span>
              <select value={performerChoice} onChange={(e) => setPerformerChoice(e.target.value)} className="glass-select w-full mt-1 text-sm">
                <option value="">Someone not on the list…</option>
                {performerOptions.present.length > 0 && (
                  <optgroup label="In the room">
                    {performerOptions.present.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </optgroup>
                )}
                {performerOptions.absent.length > 0 && (
                  <optgroup label={mode === 'live' ? 'Not here yet' : 'Signed up'}>
                    {performerOptions.absent.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            {!performerChoice && (
              <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Performer's name" className="glass-input w-full px-3 py-2 text-sm placeholder-gray-500" />
            )}
            <input value={song} onChange={(e) => setSong(e.target.value)} placeholder="Song title" className="glass-input w-full px-3 py-2 text-sm placeholder-gray-500" />
            <input value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Composer or artist (optional)" className="glass-input w-full px-3 py-2 text-sm placeholder-gray-500" />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 text-xs font-semibold transition-colors">Cancel</button>
              <button type="button" disabled={busy} onClick={submitAdd} className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
                {busy ? 'Adding…' : 'Add to program'}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-300 px-1">{error}</p>}
      </div>

      {isHost && !adding && (
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#CEB466]" /> Add a performance
          </button>
        </div>
      )}
    </div>
  )
}
