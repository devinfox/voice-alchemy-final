'use client'

/**
 * A moving line of the singer's voice against the note they are aiming for.
 *
 * The centre band is "in tune". The line draws the last few seconds of the
 * voice: above the band is high, below is low. Seeing the shape (a slide up
 * into the note, a wave of vibrato, a sag at the end) teaches more than a
 * needle that only shows this instant.
 *
 * The tool pushes readings in through a ref, so drawing never causes a React
 * re-render even at ~90 readings a second.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface PitchTrailHandle {
  /** Add a reading. `midi` is the sung pitch, `targetMidi` the note aimed at. */
  push: (timeMs: number, midi: number, targetMidi: number) => void
  clear: () => void
}

interface PitchTrailProps {
  /** Seconds of history shown. */
  seconds?: number
  /** How many semitones above and below the target the picture covers. */
  rangeSemitones?: number
  /** Width of the in-tune band, in cents each side. */
  inTuneCents?: number
  className?: string
  'aria-label'?: string
}

interface Point {
  t: number
  offset: number // semitones from the target
}

export const PitchTrail = forwardRef<PitchTrailHandle, PitchTrailProps>(function PitchTrail(
  { seconds = 4, rangeSemitones = 1.5, inTuneCents = 15, className, 'aria-label': ariaLabel = 'Your voice against the note' },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointsRef = useRef<Point[]>([])

  useImperativeHandle(ref, () => ({
    push: (timeMs, midi, targetMidi) => {
      pointsRef.current.push({ t: timeMs, offset: midi - targetMidi })
    },
    clear: () => {
      pointsRef.current = []
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const now = performance.now()
      const span = seconds * 1000
      const points = pointsRef.current
      while (points.length > 0 && now - points[0].t > span + 200) points.shift()

      const yOf = (offset: number) => {
        const clamped = Math.max(-rangeSemitones, Math.min(rangeSemitones, offset))
        return height / 2 - (clamped / rangeSemitones) * (height / 2 - 4)
      }
      const xOf = (t: number) => width - ((now - t) / span) * width

      // In-tune band and centre line
      const band = (inTuneCents / 100 / rangeSemitones) * (height / 2 - 4)
      ctx.fillStyle = 'rgba(16, 185, 129, 0.14)'
      ctx.fillRect(0, height / 2 - band, width, band * 2)
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()

      // The voice. Breaks in the line where the singer stopped.
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]
        const b = points[i]
        if (b.t - a.t > 90) continue
        const inTune = Math.abs(b.offset) * 100 <= inTuneCents
        const near = Math.abs(b.offset) * 100 <= 40
        ctx.strokeStyle = inTune ? '#34d399' : near ? '#fbbf24' : '#f87171'
        ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, 1 - (now - b.t) / span)
        ctx.beginPath()
        ctx.moveTo(xOf(a.t), yOf(a.offset))
        ctx.lineTo(xOf(b.t), yOf(b.offset))
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // A dot where the voice is right now
      const last = points[points.length - 1]
      if (last && now - last.t < 150) {
        ctx.fillStyle = Math.abs(last.offset) * 100 <= inTuneCents ? '#34d399' : '#fbbf24'
        ctx.beginPath()
        ctx.arc(Math.min(width - 4, xOf(last.t)), yOf(last.offset), 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [seconds, rangeSemitones, inTuneCents])

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-white/10 bg-black/20', className)}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} className="block h-full w-full" />
      <span className="pointer-events-none absolute left-2 top-1 text-[11px] text-gray-500">high</span>
      <span className="pointer-events-none absolute bottom-1 left-2 text-[11px] text-gray-500">low</span>
    </div>
  )
})
