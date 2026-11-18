/**
 * Voice tracker: runs on the audio thread and reports what the singer is doing
 * about 90 times a second.
 *
 * It replaces the old set-up (one reading per 4096-sample buffer on the main
 * thread, roughly 11 a second), which was too coarse to see vibrato, a scoop
 * into a note, or a fast scale.
 *
 * Two things come out of it:
 *
 *   { type: 'pitch', t, hz, clarity, rms }
 *       One per ~10 ms. `hz` is 0 when nothing pitched was found. `clarity`
 *       (0..1) says how voice-like the sound is: a sung vowel is near 1,
 *       breath and room noise are low. `t` is the centre of the analysed
 *       slice on the AudioContext clock, in seconds.
 *
 *   { type: 'onset', t, strength }
 *       A sudden start of sound (a clap, a "ta", a tap on the desk), timed to
 *       within one 128-sample block (under 3 ms).
 *
 * Pitch method: McLeod's "smarter way to find pitch" (the normalised square
 * difference function), the same family ByeTalk Studio's tuner uses. A
 * continuity check keeps it on the same octave as the previous slice when two
 * candidates are nearly as good as each other, which is where breathy notes
 * used to flip an octave.
 *
 * Self-contained on purpose: worklets cannot import from the app bundle.
 */

const MIN_HZ = 55
const MAX_HZ = 2100
const WINDOW = 1024 // samples at the analysis rate (about 43 ms at 24 kHz)
const HOP = 256 // samples at the analysis rate (about 10.7 ms at 24 kHz)
const PEAK_PICK_RATIO = 0.9
const CONTINUITY_RATIO = 0.8
const CONTINUITY_SEMITONES = 1.5
const CONTINUITY_HOLD_FRAMES = 12

/**
 * Find the pitch of one slice.
 * Returns { hz, clarity }. hz is 0 when no usable peak exists.
 * Exported through `globalThis.__vaaDetectPitch` so the same code can be
 * tested outside a browser.
 */
function detectPitch(x, n, fs, nsdf, previousHz) {
  const minLag = Math.max(2, Math.floor(fs / MAX_HZ))
  const maxLag = Math.min(n - 2, Math.ceil(fs / MIN_HZ))

  // Normalised square difference: 2*acf(tau) / (energy of both halves).
  // Energy terms are kept as running sums so each lag costs one pass.
  let total = 0
  for (let i = 0; i < n; i++) total += x[i] * x[i]
  if (total < 1e-9) return { hz: 0, clarity: 0 }

  let head = 0 // energy of x[0..tau)
  let tail = 0 // energy of x[n-tau..n)
  for (let tau = 0; tau <= maxLag; tau++) {
    if (tau > 0) {
      head += x[tau - 1] * x[tau - 1]
      tail += x[n - tau] * x[n - tau]
    }
    let acf = 0
    const limit = n - tau
    for (let i = 0; i < limit; i++) acf += x[i] * x[i + tau]
    const m = 2 * total - head - tail
    nsdf[tau] = m > 1e-12 ? (2 * acf) / m : 0
  }

  // Key maxima: the highest point of each positive lobe after the first dip
  // below zero (the lobe at lag 0 is the signal matching itself).
  let tau = 1
  while (tau <= maxLag && nsdf[tau] > 0) tau++
  const peaks = []
  let best = -1
  let inLobe = false
  for (; tau <= maxLag; tau++) {
    const v = nsdf[tau]
    if (v > 0) {
      if (!inLobe) {
        inLobe = true
        best = tau
      } else if (v > nsdf[best]) {
        best = tau
      }
    } else if (inLobe) {
      inLobe = false
      if (best >= minLag) peaks.push(best)
    }
  }
  if (inLobe && best >= minLag && best < maxLag) peaks.push(best)
  if (peaks.length === 0) return { hz: 0, clarity: 0 }

  // Parabolic refinement of each peak gives sub-sample lag and true height.
  let highest = 0
  const refined = peaks.map((p) => {
    const a = nsdf[p - 1]
    const b = nsdf[p]
    const c = nsdf[p + 1]
    const denom = a - 2 * b + c
    const shift = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0
    const height = b - 0.25 * (a - c) * shift
    if (height > highest) highest = height
    return { lag: p + shift, height }
  })

  // McLeod's rule: the first peak close to the highest one is the pitch.
  // Taking the highest outright would often land an octave too low.
  let chosen = refined.find((p) => p.height >= PEAK_PICK_RATIO * highest) || refined[0]

  // Continuity: if another strong candidate sits where the voice just was,
  // stay there rather than jumping an octave for one slice.
  if (previousHz > 0) {
    const chosenDistance = Math.abs(12 * Math.log2(fs / chosen.lag / previousHz))
    if (chosenDistance > CONTINUITY_SEMITONES) {
      let near = null
      for (const p of refined) {
        if (p.height < CONTINUITY_RATIO * highest) continue
        const distance = Math.abs(12 * Math.log2(fs / p.lag / previousHz))
        if (distance <= CONTINUITY_SEMITONES && (!near || p.height > near.height)) near = p
      }
      if (near) chosen = near
    }
  }

  const hz = fs / chosen.lag
  if (hz < MIN_HZ || hz > MAX_HZ) return { hz: 0, clarity: chosen.height }
  return { hz, clarity: Math.max(0, Math.min(1, chosen.height)) }
}

if (typeof globalThis !== 'undefined') globalThis.__vaaDetectPitch = detectPitch

if (typeof AudioWorkletProcessor !== 'undefined') {
  class VoiceTrackerProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super()
      const opts = (options && options.processorOptions) || {}
      this.wantPitch = opts.pitch !== false
      this.wantOnsets = opts.onsets === true

      // Analyse at roughly 24 kHz whatever the device runs at: sung notes sit
      // far below that, and it cuts the work to a quarter.
      this.decimation = Math.max(1, Math.round(sampleRate / 24000))
      this.fs = sampleRate / this.decimation
      this.ring = new Float32Array(WINDOW)
      this.ringPos = 0
      this.filled = 0
      this.sinceHop = 0
      this.frame = new Float32Array(WINDOW)
      this.nsdf = new Float32Array(WINDOW)
      this.decimAcc = 0
      this.decimCount = 0
      this.previousHz = 0
      this.framesSincePitch = 0

      // Onset detector state
      this.background = 0
      this.lastOnsetAt = -1
      this.onsetFloor = 0.02
      this.wasLoud = false

      this.port.onmessage = (event) => {
        const data = event.data || {}
        if (typeof data.onsetFloor === 'number') this.onsetFloor = data.onsetFloor
      }
    }

    process(inputs) {
      const channel = inputs[0] && inputs[0][0]
      if (!channel) return true
      const blockStart = currentTime
      const length = channel.length

      if (this.wantOnsets) this.detectOnset(channel, length, blockStart)
      if (!this.wantPitch) return true

      for (let i = 0; i < length; i++) {
        this.decimAcc += channel[i]
        this.decimCount++
        if (this.decimCount < this.decimation) continue

        this.ring[this.ringPos] = this.decimAcc / this.decimation
        this.ringPos = (this.ringPos + 1) % WINDOW
        this.decimAcc = 0
        this.decimCount = 0
        if (this.filled < WINDOW) this.filled++
        this.sinceHop++

        if (this.sinceHop >= HOP && this.filled >= WINDOW) {
          this.sinceHop = 0
          const endTime = blockStart + (i + 1) / sampleRate
          this.analyse(endTime)
        }
      }
      return true
    }

    analyse(endTime) {
      // Unroll the ring so the newest sample is last, and measure loudness.
      let energy = 0
      let mean = 0
      for (let i = 0; i < WINDOW; i++) {
        const v = this.ring[(this.ringPos + i) % WINDOW]
        this.frame[i] = v
        mean += v
      }
      mean /= WINDOW
      for (let i = 0; i < WINDOW; i++) {
        this.frame[i] -= mean // some microphones sit off-centre
        energy += this.frame[i] * this.frame[i]
      }
      const rms = Math.sqrt(energy / WINDOW)

      let hz = 0
      let clarity = 0
      if (rms > 0.0015) {
        const result = detectPitch(this.frame, WINDOW, this.fs, this.nsdf, this.previousHz)
        hz = result.hz
        clarity = result.clarity
      }

      if (hz > 0 && clarity >= 0.8) {
        this.previousHz = hz
        this.framesSincePitch = 0
      } else if (++this.framesSincePitch > CONTINUITY_HOLD_FRAMES) {
        this.previousHz = 0 // a real gap: the next note may start anywhere
      }

      this.port.postMessage({
        type: 'pitch',
        t: endTime - WINDOW / 2 / this.fs,
        hz,
        clarity,
        rms,
      })
    }

    detectOnset(channel, length, blockStart) {
      let energy = 0
      for (let i = 0; i < length; i++) energy += channel[i] * channel[i]
      const level = Math.sqrt(energy / length)

      // A start of sound: clearly louder than the recent background, above the
      // floor, and not within 110 ms of the last one (one clap rings on).
      const loud = level > this.onsetFloor && level > this.background * 2.2 + 0.004
      if (loud && !this.wasLoud && blockStart - this.lastOnsetAt > 0.11) {
        this.lastOnsetAt = blockStart
        this.port.postMessage({ type: 'onset', t: blockStart, strength: level })
      }
      this.wasLoud = loud

      // Background follows the level quickly on the way down, slowly on the
      // way up, so a held note becomes "background" and a new attack stands out.
      const rate = level > this.background ? 0.04 : 0.25
      this.background += (level - this.background) * rate
    }
  }

  registerProcessor('vaa-voice-tracker', VoiceTrackerProcessor)
}
