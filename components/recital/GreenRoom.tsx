'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bluetooth, Camera, Headphones, Mic, MicOff, Theater, Video, VideoOff, Volume2 } from 'lucide-react'
import { RecitalAudioPipeline, isLikelyBluetooth, type LevelReading } from '@/lib/recital/audio-pipeline'
import type { RecitalJoinGrant } from '@/types/recital.types'
import { LevelIndicator } from './LevelIndicator'
import { VideoSurface } from './VideoSurface'

export interface JoinSummary {
  recital: { id: string; title: string; description: string | null; scheduled_at: string; duration_minutes: number; status: string }
  hostName: string
  viewer: { name: string; isHost: boolean } | null
}

export interface JoinMedia {
  pipeline: RecitalAudioPipeline
  cameraTrack: MediaStreamTrack | null
  cameraDeviceId?: string
  speakerDeviceId?: string
  muted: boolean
  videoOff: boolean
}

interface GreenRoomProps {
  code: string
  summary: JoinSummary
  onJoined: (grant: RecitalJoinGrant, media: JoinMedia) => void
}

const storageKey = (code: string) => `recital:${code}:participant`
const prefKey = 'recital:mic-preference'

function friendlyDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function GreenRoom({ code, summary, onJoined }: GreenRoomProps) {
  const pipelineRef = useRef<RecitalAudioPipeline | null>(null)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null)

  const [name, setName] = useState(summary.viewer?.name ?? '')
  const [mediaState, setMediaState] = useState<'requesting' | 'ready' | 'blocked'>('requesting')
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [reading, setReading] = useState<LevelReading>({ level: 0, rawPeakDb: -120, verdict: 'silent', clipping: false })
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState<string>('')
  const [camId, setCamId] = useState<string>('')
  const [speakerId, setSpeakerId] = useState<string>('')
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [headphones, setHeadphones] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supportsSpeakerPick = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
  const micLabel = pipelineRef.current?.currentDeviceLabel ?? mics.find((m) => m.deviceId === micId)?.label ?? ''
  const bluetooth = useMemo(() => isLikelyBluetooth(micLabel), [micLabel])

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setMics(list.filter((d) => d.kind === 'audioinput'))
      setCams(list.filter((d) => d.kind === 'videoinput'))
      setSpeakers(list.filter((d) => d.kind === 'audiooutput'))
    } catch {
      // ignore
    }
  }, [])

  const startCamera = useCallback(async (deviceId?: string) => {
    cameraTrackRef.current?.stop()
    cameraTrackRef.current = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
      })
      const track = stream.getVideoTracks()[0]
      try {
        track.contentHint = 'motion'
      } catch {
        // unsupported
      }
      cameraTrackRef.current = track
      setPreviewStream(new MediaStream([track]))
      const settings = track.getSettings()
      if (settings.deviceId) setCamId(settings.deviceId)
    } catch {
      setPreviewStream(null)
      setVideoOff(true)
    }
  }, [])

  // Acquire mic + camera on mount.
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
    const onChange = () => void refreshDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    // Safari/iOS keep audio suspended until the first tap.
    const onGesture = () => void pipelineRef.current?.resume()
    document.addEventListener('pointerdown', onGesture, { passive: true })
    document.addEventListener('keydown', onGesture)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Meter + background calibration while they get settled.
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

  const changeMic = async (id: string) => {
    setMicId(id)
    await pipelineRef.current?.setDevice(id || undefined)
  }

  const join = async () => {
    const pipeline = pipelineRef.current
    if (!pipeline) return
    const displayName = name.trim()
    if (!summary.viewer && !displayName) {
      setError('Please tell us your name so everyone knows who is here.')
      return
    }
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
      const res = await fetch(`/api/recitals/join/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName || undefined, participantId: remembered || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not join the recital')
      const grant = data as RecitalJoinGrant
      try {
        localStorage.setItem(storageKey(code), grant.participantId)
        localStorage.setItem(prefKey, String(pipeline.getPreference()))
      } catch {
        // ignore
      }
      // Save what we learned in the green room (no numbers shown to anyone).
      void fetch(`/api/recitals/${grant.recital.id}/participants/${grant.participantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${grant.token}` },
        body: JSON.stringify({
          soundcheck: {
            rawPeakDb: reading.rawPeakDb,
            verdict: reading.verdict,
            trimDb: pipeline.getCalibration(),
            deviceLabel: micLabel || null,
            isBluetooth: bluetooth,
            headphones,
          },
        }),
      }).catch(() => undefined)

      onJoined(grant, {
        pipeline,
        cameraTrack: cameraTrackRef.current,
        cameraDeviceId: camId || undefined,
        speakerDeviceId: speakerId || undefined,
        muted,
        videoOff: videoOff || !cameraTrackRef.current,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the recital')
      setJoining(false)
    }
  }

  const statusLine =
    summary.recital.status === 'live'
      ? 'The recital is underway. Come on in.'
      : summary.recital.status === 'ended'
      ? 'This recital has ended.'
      : `Starts ${friendlyDate(summary.recital.scheduled_at)}. You can wait in the room.`

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl glass-card-luxe p-5 sm:p-8 animate-fade-in">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Preview */}
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
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className={`p-3 rounded-full transition-colors ${muted ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-700/90 text-white hover:bg-gray-600'}`}
                  title={muted ? 'Join muted' : 'Join with mic on'}
                >
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
                <p className="text-sm text-amber-200">
                  We need your microphone and camera. Allow access in your browser&apos;s address bar, then reload this page.
                </p>
              ) : (
                <LevelIndicator reading={reading} />
              )}
              <p className="text-[11px] text-gray-500 mt-2">Say a few words or sing a line. We set everything up automatically.</p>
            </div>
          </div>

          {/* Details + join */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2 self-start">
              <Theater className="w-3.5 h-3.5" />
              <span>Voice Alchemy · Recital</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-luxury">{summary.recital.title}</h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1">
              Hosted by <span className="text-[#e0c97d]">{summary.hostName}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">{statusLine}</p>
            {summary.recital.description && <p className="text-xs text-gray-400 mt-3 leading-relaxed">{summary.recital.description}</p>}

            <div className="mt-5 space-y-3">
              {!summary.viewer && (
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Your name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How should we introduce you?"
                    maxLength={60}
                    className="glass-input w-full mt-1 px-3.5 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50"
                  />
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Microphone</span>
                  <select value={micId} onChange={(e) => void changeMic(e.target.value)} className="glass-select w-full mt-1 text-sm">
                    <option value="">Default microphone</option>
                    {mics.map((m, i) => (
                      <option key={m.deviceId || i} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Camera</span>
                  <select value={camId} onChange={(e) => { setCamId(e.target.value); void startCamera(e.target.value || undefined) }} className="glass-select w-full mt-1 text-sm">
                    <option value="">Default camera</option>
                    {cams.map((c, i) => (
                      <option key={c.deviceId || i} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
                {supportsSpeakerPick && speakers.length > 0 && (
                  <label className="block sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Speakers</span>
                    <select value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} className="glass-select w-full mt-1 text-sm">
                      <option value="">Default speakers</option>
                      {speakers.map((s, i) => (
                        <option key={s.deviceId || i} value={s.deviceId}>{s.label || `Speakers ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <label className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 cursor-pointer">
                <input type="checkbox" checked={headphones} onChange={(e) => setHeadphones(e.target.checked)} className="accent-[#CEB466] w-4 h-4" />
                <Headphones className="w-4 h-4 text-[#CEB466]" />
                <span className="text-xs text-gray-200">I&apos;m wearing headphones</span>
                <span className="ml-auto text-[10px] text-gray-500 hidden sm:inline">Recommended for singing</span>
              </label>

              {bluetooth && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5">
                  <Bluetooth className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-100 leading-relaxed">
                    Bluetooth microphones can sound thin when singing. If you can, use your device&apos;s built-in mic or a wired one, and keep the headphones for listening.
                  </p>
                </div>
              )}

              {error && <p className="text-xs text-red-300">{error}</p>}
            </div>

            <div className="mt-auto pt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={join}
                disabled={joining || mediaState === 'requesting' || summary.recital.status === 'ended'}
                className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-sm font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joining ? 'Entering…' : summary.viewer?.isHost ? 'Open the stage' : 'Enter the recital'}
              </button>
              {mediaState === 'blocked' && (
                <button type="button" onClick={() => window.location.reload()} className="px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
