'use client'

import { useEffect, useRef } from 'react'

interface VideoSurfaceProps {
  stream: MediaStream | null
  muted?: boolean
  mirror?: boolean
  className?: string
  fit?: 'cover' | 'contain'
}

/** Attaches a MediaStream to a <video>. Audio is played by AudioSink elsewhere. */
export function VideoSurface({ stream, muted = true, mirror = false, className = '', fit = 'cover' }: VideoSurfaceProps) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    if (stream) {
      el.play().catch(() => undefined)
    }
  }, [stream])

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${mirror ? '-scale-x-100' : ''}`}
    />
  )
}

interface AudioSinkProps {
  streams: Map<string, MediaStream>
  outputDeviceId?: string
}

/** Plays every remote stream's audio through hidden <audio> elements. */
export function AudioSink({ streams, outputDeviceId }: AudioSinkProps) {
  return (
    <div hidden>
      {Array.from(streams.entries()).map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} outputDeviceId={outputDeviceId} />
      ))}
    </div>
  )
}

function RemoteAudio({ stream, outputDeviceId }: { stream: MediaStream; outputDeviceId?: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    el.play().catch(() => undefined)
  }, [stream])
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (!el || !outputDeviceId || typeof el.setSinkId !== 'function') return
    el.setSinkId(outputDeviceId).catch(() => undefined)
  }, [outputDeviceId])
  return <audio ref={ref} autoPlay playsInline />
}
