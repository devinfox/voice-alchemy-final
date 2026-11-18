/**
 * A small drum kit built from oscillators and noise, so the Rhythm Trainer can
 * play a drummer without downloading any sound files. Every hit is scheduled
 * on the audio clock, so its timing is exact to the sample.
 */

import type { DrumRole } from '@/lib/groove-patterns'

let noiseBuffer: AudioBuffer | null = null
let noiseBufferRate = 0

function getNoise(context: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBufferRate !== context.sampleRate) {
    const length = Math.floor(context.sampleRate * 0.5)
    noiseBuffer = context.createBuffer(1, length, context.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    noiseBufferRate = context.sampleRate
  }
  return noiseBuffer
}

function noiseBurst(
  context: AudioContext,
  when: number,
  seconds: number,
  level: number,
  filterType: BiquadFilterType,
  filterHz: number
) {
  const source = context.createBufferSource()
  source.buffer = getNoise(context)
  const filter = context.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = filterHz
  const gain = context.createGain()
  gain.gain.setValueAtTime(level, when)
  gain.gain.exponentialRampToValueAtTime(0.0008, when + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start(when, Math.random() * 0.2)
  source.stop(when + seconds + 0.02)
}

/**
 * Play one drum.
 * @param velocity how hard it was hit, 0-127
 * @param volume   0..1 master level
 */
export function playDrum(context: AudioContext, role: DrumRole, when: number, velocity: number, volume: number): void {
  const hit = Math.max(0.05, Math.min(1, velocity / 127))
  const level = hit * hit * volume // quiet hits fall away quickly, as on a real kit

  if (role === 'kick') {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, when)
    osc.frequency.exponentialRampToValueAtTime(48, when + 0.09)
    gain.gain.setValueAtTime(Math.min(1, level * 1.5), when)
    gain.gain.exponentialRampToValueAtTime(0.0008, when + 0.26)
    osc.connect(gain)
    gain.connect(context.destination)
    osc.start(when)
    osc.stop(when + 0.28)
    noiseBurst(context, when, 0.012, level * 0.35, 'lowpass', 2500) // the beater click
    return
  }

  if (role === 'snare') {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(210, when)
    osc.frequency.exponentialRampToValueAtTime(170, when + 0.06)
    gain.gain.setValueAtTime(level * 0.5, when)
    gain.gain.exponentialRampToValueAtTime(0.0008, when + 0.11)
    osc.connect(gain)
    gain.connect(context.destination)
    osc.start(when)
    osc.stop(when + 0.13)
    noiseBurst(context, when, 0.17, level * 0.7, 'highpass', 1700)
    return
  }

  if (role === 'openHat') {
    noiseBurst(context, when, 0.28, level * 0.32, 'highpass', 7000)
    return
  }

  noiseBurst(context, when, 0.045, level * 0.3, 'highpass', 8000) // closed hi-hat
}
