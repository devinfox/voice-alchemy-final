'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Mic, MicOff, Presentation, Video, VideoOff, Volume2 } from 'lucide-react'
import { RecitalAudioPipeline, type LevelReading } from '@/lib/recital/audio-pipeline'
import type { TrainingJoinGrant } from '@/types/training.types'
import { LevelIndicator } from '@/components/recital/LevelIndicator'
import { VideoSurface } from '@/components/recital/VideoSurface'
import type { JoinMedia } from '@/components/recital/GreenRoom'

export interface TrainingSummary {
  session: { id: string; title: string; description: string | null; scheduled_at: string; duration_minutes: number; status: string; waitingRoom: boolean }
  hostName: string
  viewer: { name: string; email: string | null; isHost: boolean } | null
}

interface Props {
  code: string
  summary: TrainingSummary
  onJoined: (grant: TrainingJoinGrant, media: JoinMedia) => void
}

const storageKey = (code: string) => `training:${code}:participant`
const detailsKey = 'training:guest-details'
const prefKey = 'recital:mic-preference'

function friendlyDate(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function TrainingLobby({ code, summary, onJoined }: Props) {
  const pipelineRef = useRef<RecitalAudioPipeline | null>(null)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null)
  const viewerFirst = summary.viewer?.name.split(' ')[0] ?? ''
  const viewerLast = summary.viewer?.name.split(' ').slice(1).join(' ') ?? ''

  const [firstName, setFirstName] = useState(viewerFirst)
  const [lastName, setLastName] = useState(viewerLast)
  const [email, setEmail] = useState(summary.viewer?.email ?? '')
  const [mediaState, setMediaState] = useState<'requesting' | 'ready' | 'blocked'>('requesting')
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [reading, setReading] = useState<LevelReading>({ level: 0, rawPeakDb: -120, verdict: 'silent', clipping: false })
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState('')
  const [camId, setCamId] = useState('')
  // Attendees start muted so a busy room stays quiet; the host starts live.
  const [muted, setMuted] = useState(!summary.viewer?.isHost)
  const [videoOff, setVideoOff] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (summary.viewer) return
    try {
      const saved = JSON.parse(localStorage.getItem(detailsKey) || 'null')
      if (saved) {
        setFirstName(saved.firstName || '')
        setLastName(saved.lastName || '')
        setEmail(saved.email || '')
      }
    } catch {
      // ignore
    }
  }, [summary.viewer])

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setMics(list.filter((d) => d.kind === 'audioinput'))
      setCams(list.filter((d) => d.kind === 'videoinput'))
    } catch {
      // ignore
    }
  }, [])

  const startCamera = useCallback(async (deviceId?: string) => {
    cameraTrackRef.current?.stop()
    cameraTrackRef.current = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' },
      })
      const track = stream.getVideoTracks()[0]
      cameraTrackRef.current = track
      setPreviewStream(new MediaStream([track]))
      const s = track.getSettings()
      if (s.deviceId) setCamId(s.deviceId)
    } catch {
      setPreviewStream(null)
      setVideoOff(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const pipeline = new RecitalAudioPipeline({
      preference: (() => {
        try {
          const v = parseFloat(localStorage.getItem(prefKey) || '0')
          return Number.isFinite(v) ? v : 0
        } catch {
          return 0
        }
      })(),
    })
    pipelineRef.current = pipeline
    ;(async () => {
      try {
        await pipeline.start('talk')
        if (cancelled) return
        await startCamera()
        if (cancelled) return
        await refreshDevices()
        setMediaState('ready')
      } catch {
        if (!cancelled) setMediaState('blocked')
      }
    })()
    const onGesture = () => void pipelineRef.current?.resume()
    document.addEventListener('pointerdown', onGesture, { passive: true })
    document.addEventListener('keydown', onGesture)
    return () => {
      cancelled = true
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mediaState !== 'ready') return
    let ticks = 0
    const timer = setInterval(() => {
      const p = pipelineRef.current
      if (!p) return
      setReading(p.read())
      if (++ticks % 8 === 0) p.autoCalibrate()
    }, 120)
    return () => clearInterval(timer)
  }, [mediaState])

  const join = async () => {
    const pipeline = pipelineRef.current
    if (!pipeline) return
    if (!firstName.trim()) return setError('Please enter your first name.')
    if (!summary.viewer && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid email.')
    setJoining(true)
    setError(null)
    await pipeline.resume()
    let remembered: string | null = null
    try {
      remembered = localStorage.getItem(storageKey(code))
    } catch {
      // ignore
    }
    try {
      const res = await fetch(`/api/training-sessions/join/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), participantId: remembered || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not join the session')
      const grant = data as TrainingJoinGrant
      try {
        localStorage.setItem(storageKey(code), grant.participantId)
        localStorage.setItem(prefKey, String(pipeline.getPreference()))
        if (!summary.viewer) localStorage.setItem(detailsKey, JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() }))
      } catch {
        // ignore
      }
      onJoined(grant, { pipeline, cameraTrack: cameraTrackRef.current, cameraDeviceId: camId || undefined, muted, videoOff: videoOff || !cameraTrackRef.current })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the session')
      setJoining(false)
    }
  }

  const statusLine =
    summary.session.status === 'live'
      ? 'The session is underway.'
      : summary.session.status === 'ended'
      ? 'This session has ended.'
      : `Starts ${friendlyDate(summary.session.scheduled_at)}.`

  const field = 'glass-input w-full mt-1 px-3.5 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50'

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl glass-card-luxe p-5 sm:p-8 animate-fade-in">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          <div className="lg:w-[52%]">
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#0f0b1e] border border-white/10">
              {previewStream && !videoOff ? (
                <VideoSurface stream={previewStream} mirror className="absolute inset-0 w-full h-full" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                  <div className="w-16 h-16 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center mb-2">
                    <Camera className="w-6 h-6 text-[#CEB466]" />
                  </div>
                  <p className="text-xs">{mediaState === 'requesting' ? 'Waiting for camera permission…' : 'Camera is off'}</p>
                </div>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
                <button type="button" onClick={() => setMuted((m) => !m)} className={`p-3 rounded-full transition-colors ${muted ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-700/90 text-white hover:bg-gray-600'}`} title={muted ? 'Join muted' : 'Join with mic on'}>
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !videoOff
                    setVideoOff(next)
                    if (cameraTrackRef.current) cameraTrackRef.current.enabled = !next
                  }}
                  className={`p-3 rounded-full transition-colors ${videoOff ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-700/90 text-white hover:bg-gray-600'}`}
                  title={videoOff ? 'Join with camera off' : 'Join with camera on'}
                >
                  {videoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="mt-4 glass-card-subtle p-4">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="w-4 h-4 text-[#CEB466]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Your mic</span>
              </div>
              {mediaState === 'blocked' ? (
                <p className="text-sm text-amber-200">We need your microphone and camera. Allow access in your browser&apos;s address bar, then reload this page.</p>
              ) : (
                <LevelIndicator reading={reading} />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <select value={micId} onChange={(e) => { setMicId(e.target.value); void pipelineRef.current?.setDevice(e.target.value || undefined) }} className="glass-select w-full text-xs" aria-label="Microphone">
                  <option value="">Default microphone</option>
                  {mics.map((m, i) => (
                    <option key={m.deviceId || i} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>
                  ))}
                </select>
                <select value={camId} onChange={(e) => { setCamId(e.target.value); void startCamera(e.target.value || undefined) }} className="glass-select w-full text-xs" aria-label="Camera">
                  <option value="">Default camera</option>
                  {cams.map((c, i) => (
                    <option key={c.deviceId || i} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2 self-start">
              <Presentation className="w-3.5 h-3.5" />
              <span>Voice Alchemy · Training Session</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-luxury">{summary.session.title}</h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1">Hosted by <span className="text-[#e0c97d]">{summary.hostName}</span></p>
            <p className="text-xs text-gray-400 mt-1">{statusLine}</p>
            {summary.session.description && <p className="text-xs text-gray-400 mt-3 leading-relaxed">{summary.session.description}</p>}

            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">First name</span>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} placeholder="Jane" className={field} />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Last name</span>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} placeholder="Doe" className={field} />
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="you@example.com" className={field} />
              </label>
              {summary.session.waitingRoom && !summary.viewer?.isHost && (
                <p className="text-[11px] text-gray-500">{summary.hostName} will let you in once you ask to join.</p>
              )}
              {error && <p className="text-xs text-red-300">{error}</p>}
            </div>

            <div className="mt-auto pt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={join}
                disabled={joining || mediaState === 'requesting' || summary.session.status === 'ended'}
                className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-sm font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joining ? 'One moment…' : summary.viewer?.isHost ? 'Start hosting' : summary.session.waitingRoom ? 'Ask to join' : 'Join session'}
              </button>
              {mediaState === 'blocked' && (
                <button type="button" onClick={() => window.location.reload()} className="px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">Try again</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
