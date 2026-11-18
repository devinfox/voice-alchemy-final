/**
 * The sounds the practice tools play for the singer to copy.
 *
 * The Scale Trainer used to play a bare sine wave. A pure sine has no
 * overtones, which makes its pitch surprisingly hard to hear and copy,
 * especially low down. These tones carry a few soft overtones and a
 * keyboard-like shape (quick start, gentle fade), so the ear locks on faster.
 * Everything is built from oscillators: no sound files to download.
 */

export interface ToneHandle {
  stop: () => void
}

interface ToneOptions {
  /** AudioContext time to start at. Defaults to now. */
  when?: number
  /** Seconds. */
  duration?: number
  /** 0..1 */
  volume?: number
  onEnded?: () => void
}

// Strength of the note itself and its first few overtones.
const PARTIALS = [1, 0.4, 0.17, 0.07]

/** Play one keyboard-like note. */
export function playTone(context: AudioContext, frequency: number, options: ToneOptions = {}): ToneHandle {
  const when = Math.max(options.when ?? context.currentTime, context.currentTime)
  const duration = Math.max(0.12, options.duration ?? 0.8)
  const peak = Math.max(0, Math.min(1, options.volume ?? 0.5)) * 0.32
  const end = when + duration

  const output = context.createGain()
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = Math.min(6000, Math.max(1200, frequency * 6))
  output.connect(filter)
  filter.connect(context.destination)

  // Quick start, settle to a held level, short fade at the end.
  output.gain.setValueAtTime(0, when)
  output.gain.linearRampToValueAtTime(peak, when + 0.012)
  output.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.62), when + Math.min(0.28, duration * 0.5))
  output.gain.setValueAtTime(Math.max(0.0001, peak * 0.62), Math.max(when + 0.03, end - 0.09))
  output.gain.linearRampToValueAtTime(0, end)

  const oscillators = PARTIALS.map((strength, index) => {
    const partial = index + 1
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency * partial
    // Overtones fade faster than the note itself, like a struck string.
    gain.gain.setValueAtTime(strength, when)
    if (partial > 1) gain.gain.exponentialRampToValueAtTime(strength * 0.35, when + Math.min(0.5, duration))
    osc.connect(gain)
    gain.connect(output)
    osc.start(when)
    osc.stop(end + 0.02)
    return osc
  })

  let finished = false
  oscillators[0].onended = () => {
    if (finished) return
    finished = true
    filter.disconnect()
    options.onEnded?.()
  }

  return {
    stop: () => {
      if (finished) return
      const now = context.currentTime
      output.gain.cancelScheduledValues(now)
      output.gain.setValueAtTime(output.gain.value, now)
      output.gain.linearRampToValueAtTime(0, now + 0.03)
      oscillators.forEach((osc) => {
        try {
          osc.stop(now + 0.04)
        } catch {
          // already stopped
        }
      })
    },
  }
}

/**
 * Hold a soft chord under the singer, like a teacher holding keys down.
 * Hearing home underneath every note is what makes a scale make sense.
 */
export function startBackingChord(context: AudioContext, frequencies: number[], volume = 0.5): ToneHandle {
  const now = context.currentTime
  const level = Math.max(0, Math.min(1, volume)) * 0.11
  const output = context.createGain()
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  output.gain.setValueAtTime(0, now)
  output.gain.linearRampToValueAtTime(level, now + 0.6)
  output.connect(filter)
  filter.connect(context.destination)

  const oscillators: OscillatorNode[] = []
  frequencies.forEach((frequency) => {
    // Two very slightly different copies give a gentle, organ-like shimmer.
    for (const detune of [-4, 4]) {
      const osc = context.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = frequency
      osc.detune.value = detune
      osc.connect(output)
      osc.start(now)
      oscillators.push(osc)
    }
  })

  let stopped = false
  return {
    stop: () => {
      if (stopped) return
      stopped = true
      const t = context.currentTime
      output.gain.cancelScheduledValues(t)
      output.gain.setValueAtTime(output.gain.value, t)
      output.gain.linearRampToValueAtTime(0, t + 0.35)
      oscillators.forEach((osc) => {
        try {
          osc.stop(t + 0.4)
        } catch {
          // already stopped
        }
      })
      setTimeout(() => filter.disconnect(), 500)
    },
  }
}
