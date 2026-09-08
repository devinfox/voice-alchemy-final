'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Presentation } from 'lucide-react'
import type { TrainingJoinGrant } from '@/types/training.types'
import type { JoinMedia } from '@/components/recital/GreenRoom'
import { TrainingLobby, type TrainingSummary } from './TrainingLobby'
import { TrainingStage } from './TrainingStage'

type Phase = 'loading' | 'missing' | 'lobby' | 'stage' | 'left'

export function TrainingRoom({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [summary, setSummary] = useState<TrainingSummary | null>(null)
  const [grant, setGrant] = useState<TrainingJoinGrant | null>(null)
  const mediaRef = useRef<JoinMedia | null>(null)
  const [stageKey, setStageKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/training-sessions/join/${code}`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as TrainingSummary
        if (cancelled) return
        setSummary(data)
        setPhase('lobby')
      } catch {
        if (!cancelled) setPhase('missing')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  const releaseMedia = useCallback(() => {
    const media = mediaRef.current
    mediaRef.current = null
    if (!media) return
    media.cameraTrack?.stop()
    void media.pipeline.stop()
  }, [])

  useEffect(() => releaseMedia, [releaseMedia])

  const card = (title: string, body: string, actions: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card-luxe p-8 max-w-md w-full text-center animate-fade-in">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center mb-4">
          <Presentation className="w-6 h-6 text-[#CEB466]" />
        </div>
        <h1 className="text-2xl font-bold text-white font-luxury">{title}</h1>
        <p className="text-sm text-gray-300 mt-2">{body}</p>
        <div className="mt-6 flex items-center justify-center gap-3">{actions}</div>
      </div>
    </div>
  )

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#CEB466] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (phase === 'missing' || !summary) {
    return card("We couldn't find that session", 'Check the link with your host.', (
      <Link href="/" className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">Back to Voice Alchemy</Link>
    ))
  }

  if (phase === 'left') {
    return card('You left the session', `${summary.session.title} · hosted by ${summary.hostName}`, (
      <>
        <button type="button" onClick={() => { setGrant(null); setPhase('lobby') }} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110">Rejoin</button>
        <Link href={summary.viewer ? '/dashboard' : '/'} className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">{summary.viewer ? 'Back to dashboard' : 'Back to Voice Alchemy'}</Link>
      </>
    ))
  }

  if (phase === 'stage' && grant && mediaRef.current) {
    return <TrainingStage key={stageKey} grant={grant} media={mediaRef.current} onLeft={() => { releaseMedia(); setPhase('left') }} />
  }

  return (
    <TrainingLobby
      code={code}
      summary={summary}
      onJoined={(g, media) => {
        mediaRef.current = media
        setGrant(g)
        setStageKey((k) => k + 1)
        setPhase('stage')
      }}
    />
  )
}
