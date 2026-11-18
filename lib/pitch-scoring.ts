/**
 * How well was a note sung? Shared by Pitch Perfect and the Scale Trainer.
 *
 * The old scoring averaged every reading taken while a note was held. That
 * had three problems, each of which marked good singing down:
 *
 *   1. The way in and out of a note counted. Almost every singer slides into a
 *      note for a moment; averaging that in dragged the score off the pitch
 *      they actually settled on. ByeTalk Studio's tuner scores the settled
 *      middle of the note instead, and so does this.
 *
 *   2. Steadiness was measured in Hz. The same wobble is four times as many
 *      Hz at the top of a soprano's range as at the bottom of a bass's, so
 *      high voices scored as shakier for no reason. It is now measured in
 *      cents (hundredths of a semitone), which is how the ear hears it.
 *
 *   3. Vibrato counted as shakiness. A healthy, even vibrato is a regular
 *      wave around the note; it is now found, set aside, and reported as a
 *      good thing rather than subtracted from the score.
 *
 * Pure functions, no browser APIs, so they can be tested with plain numbers.
 */

export interface NoteFrame {
  /** Time in milliseconds (any clock, as long as it is consistent). */
  t: number
  /** Pitch as a fractional MIDI note number, e.g. 69.12 = A4 and 12 cents. */
  midi: number
}

export interface Vibrato {
  /** Waves per second. Most trained voices sit between 4.5 and 7. */
  rateHz: number
  /** How far each side of the note the wave swings, in cents. */
  depthCents: number
}

export interface HeldNoteAnalysis {
  frameCount: number
  durationMs: number
  /** The pitch the singer settled on (fractional MIDI). */
  centerMidi: number
  /** Settled pitch relative to the target, in cents. Negative is flat. */
  deviationCents: number
  /** Whole semitones away from the target (0 when on the right note). */
  semitonesOff: number
  /** Cents away from the nearest note to where they settled. */
  centsFromNearest: number
  /** 0-100. Vibrato does not lower it; wavering and drifting do. */
  steadiness: number
  /** Leftover wobble in cents once any vibrato is set aside. */
  wobbleCents: number
  vibrato: Vibrato | null
  /** Where the note started relative to where it settled, in cents. */
  scoopCents: number
  /** Change from the start to the end of the settled part, in cents. */
  driftCents: number
  /** Longest unbroken stretch within the in-tune window, in milliseconds. */
  inTuneSustainMs: number
  /** Time from the first frame to the first in-tune frame, in milliseconds. */
  timeToInTuneMs: number | null
}

/** Within this many cents of the note counts as in tune. */
export const IN_TUNE_CENTS = 15

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

/** Fractional MIDI note number for a frequency. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * The settled pitch of a note: the middle 60% of its frames, with the highest
 * and lowest tenth of those dropped before averaging.
 * Same definition as ByeTalk Studio's note model (analysis_model.hpp).
 */
export function stableCenter(midis: number[]): number {
  if (midis.length === 0) return 0
  const n = midis.length
  const from = n >= 10 ? Math.floor(n / 5) : 0
  const to = n >= 10 ? n - Math.floor(n / 5) : n
  const core = midis.slice(from, to).sort((a, b) => a - b)
  const trim = Math.floor(core.length / 10)
  const kept = core.slice(trim, core.length - trim)
  return mean(kept.length > 0 ? kept : core)
}

/** Solve a small linear system in place (Gauss-Jordan). Null if singular. */
function solve(m: number[][], size: number): number[] | null {
  for (let k = 0; k < size; k++) {
    let pivot = k
    for (let r = k + 1; r < size; r++) if (Math.abs(m[r][k]) > Math.abs(m[pivot][k])) pivot = r
    if (Math.abs(m[pivot][k]) < 1e-10) return null
    ;[m[k], m[pivot]] = [m[pivot], m[k]]
    const div = m[k][k]
    for (let c = k; c <= size; c++) m[k][c] /= div
    for (let r = 0; r < size; r++) {
      if (r === k) continue
      const f = m[r][k]
      for (let c = k; c <= size; c++) m[r][c] -= f * m[k][c]
    }
  }
  return m.map((row) => row[size])
}

interface MotionFit {
  vibrato: Vibrato | null
  /** Per-frame vibrato wave in cents (zeros when none was found). */
  wave: number[]
}

/**
 * Look for vibrato in a stretch of pitch: fit "a line plus a wave" at each
 * rate from 4 to 8.5 waves a second and keep the best. It only counts as
 * vibrato if the wave explains most of the movement, so a slide or a wobble
 * is never mistaken for it. Port of ByeTalk Studio's pitch_motion.hpp, fitted
 * once over the whole settled part of the note.
 */
function fitVibrato(times: number[], cents: number[]): MotionFit {
  const n = cents.length
  const none: MotionFit = { vibrato: null, wave: new Array(n).fill(0) }
  if (n < 16) return none
  const seconds = (times[n - 1] - times[0]) / 1000
  if (seconds < 0.45) return none

  const middle = (times[0] + times[n - 1]) / 2
  const ts = times.map((t) => (t - middle) / 1000)
  const ref = mean(cents)
  const ys = cents.map((c) => c - ref)

  // Error of a plain line: the baseline the wave has to beat.
  let sy = 0, sty = 0, stt = 0, syy = 0, st = 0
  for (let i = 0; i < n; i++) {
    sy += ys[i]; st += ts[i]; sty += ts[i] * ys[i]; stt += ts[i] * ts[i]; syy += ys[i] * ys[i]
  }
  const tMean = st / n
  const sxx = stt - n * tMean * tMean
  const sxy = sty - tMean * sy
  const lineError = syy - (sy * sy) / n - (sxx > 1e-12 ? (sxy * sxy) / sxx : 0)
  // Under ~4 cents of movement there is nothing to explain.
  if (lineError < n * 16) return none

  let bestError = lineError
  let bestHz = 0
  let best: number[] = []
  for (let hz = 4; hz <= 8.501; hz += 0.25) {
    if (seconds * hz < 1.75) continue // need to see nearly two full waves
    const m: number[][] = [0, 1, 2, 3].map(() => [0, 0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const phase = 2 * Math.PI * hz * ts[i]
      const x = [1, ts[i], Math.sin(phase), Math.cos(phase)]
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) m[r][c] += x[r] * x[c]
        m[r][4] += x[r] * ys[i]
      }
    }
    const coef = solve(m, 4)
    if (!coef) continue
    let error = 0
    for (let i = 0; i < n; i++) {
      const phase = 2 * Math.PI * hz * ts[i]
      const e = ys[i] - coef[0] - coef[1] * ts[i] - coef[2] * Math.sin(phase) - coef[3] * Math.cos(phase)
      error += e * e
    }
    if (error < bestError) {
      bestError = error
      bestHz = hz
      best = coef
    }
  }
  if (bestHz === 0) return none

  const explained = 1 - bestError / lineError
  const depth = Math.hypot(best[2], best[3])
  const leftover = Math.sqrt(bestError / n)
  if (explained < 0.6 || depth < 8 || depth > 150 || leftover > Math.max(14, depth * 0.6)) return none

  const wave = ts.map((t) => {
    const phase = 2 * Math.PI * bestHz * t
    return best[2] * Math.sin(phase) + best[3] * Math.cos(phase)
  })
  return { vibrato: { rateHz: bestHz, depthCents: depth }, wave }
}

/**
 * Score one held note against its target.
 * `frames` are the readings taken while the singer was on (or near) the note.
 */
export function analyzeHeldNote(frames: NoteFrame[], targetMidi: number): HeldNoteAnalysis {
  const n = frames.length
  if (n === 0) {
    return {
      frameCount: 0, durationMs: 0, centerMidi: targetMidi, deviationCents: 0, semitonesOff: 0,
      centsFromNearest: 0, steadiness: 0, wobbleCents: 0, vibrato: null, scoopCents: 0, driftCents: 0,
      inTuneSustainMs: 0, timeToInTuneMs: null,
    }
  }

  const midis = frames.map((f) => f.midi)
  const centerMidi = stableCenter(midis)
  const deviationCents = (centerMidi - targetMidi) * 100
  const semitonesOff = Math.round(centerMidi - targetMidi)
  const centsFromNearest = (centerMidi - Math.round(centerMidi)) * 100

  // Steadiness is judged on the settled part only (skip the way in and out).
  const from = n >= 10 ? Math.floor(n * 0.15) : 0
  const to = n >= 10 ? n - Math.floor(n * 0.1) : n
  const settled = frames.slice(from, to)
  const settledCents = settled.map((f) => (f.midi - centerMidi) * 100)
  const fit = fitVibrato(settled.map((f) => f.t), settledCents)
  const steadied = settledCents.map((c, i) => c - fit.wave[i])
  const steadiedMean = mean(steadied)
  const wobbleCents = Math.sqrt(mean(steadied.map((c) => (c - steadiedMean) ** 2)))
  // 0 cents of wobble = 100, about 60 cents (over half a semitone) = 0.
  const steadiness = Math.max(0, Math.min(100, 100 - wobbleCents * 1.6))

  // Scoop: where the first tenth of a second sat compared with the centre.
  const startT = frames[0].t
  const opening = frames.filter((f) => f.t - startT <= 110)
  const scoopCents = opening.length >= 3 && n >= 20 ? (mean(opening.map((f) => f.midi)) - centerMidi) * 100 : 0

  // Drift: first third against last third of the settled part, vibrato removed.
  let driftCents = 0
  if (steadied.length >= 12) {
    const third = Math.floor(steadied.length / 3)
    driftCents = mean(steadied.slice(-third)) - mean(steadied.slice(0, third))
  }

  // In-tune timing against the target note.
  let longest = 0
  let runStart: number | null = null
  let timeToInTuneMs: number | null = null
  for (let i = 0; i < n; i++) {
    const inTune = Math.abs((frames[i].midi - targetMidi) * 100) <= IN_TUNE_CENTS
    if (inTune) {
      if (runStart === null) runStart = frames[i].t
      if (timeToInTuneMs === null) timeToInTuneMs = frames[i].t - startT
      longest = Math.max(longest, frames[i].t - runStart)
    } else {
      runStart = null
    }
  }

  return {
    frameCount: n,
    durationMs: frames[n - 1].t - startT,
    centerMidi,
    deviationCents,
    semitonesOff,
    centsFromNearest,
    steadiness,
    wobbleCents,
    vibrato: fit.vibrato,
    scoopCents,
    driftCents,
    inTuneSustainMs: longest,
    timeToInTuneMs,
  }
}

/** 0-100: how close the settled pitch was to the target note. */
export function targetAccuracyOf(a: HeldNoteAnalysis): number {
  const semitonePenalty = Math.abs(a.semitonesOff) * 25
  const centsPenalty = Math.min(25, Math.abs(a.centsFromNearest) * 0.5)
  return Math.max(0, Math.min(100, 100 - semitonePenalty - centsPenalty))
}

/** 0-100: tuning alone, ignoring which note it was. 50 cents off scores 0. */
export function tuningAccuracyOf(centsOff: number): number {
  return Math.max(0, Math.min(100, 100 - Math.abs(centsOff) * 2))
}

export type NoteVerdictTone = 'good' | 'ok' | 'off'

export interface NoteVerdict {
  tone: NoteVerdictTone
  /** Short headline, e.g. "Right on it". */
  headline: string
  /** One extra plain-language observation, or null. */
  detail: string | null
}

/**
 * Say what happened on a note in words a beginner can act on.
 * No numbers and no audio terms: the tools are meant to feel like a teacher.
 */
export function describeHeldNote(a: HeldNoteAnalysis): NoteVerdict {
  const off = a.deviationCents
  const abs = Math.abs(off)
  const direction = off > 0 ? 'high' : 'low'

  let tone: NoteVerdictTone
  let headline: string
  if (abs <= IN_TUNE_CENTS) {
    tone = 'good'
    headline = 'Right on it'
  } else if (abs <= 35) {
    tone = 'ok'
    headline = `A touch ${direction}`
  } else if (abs < 150) {
    tone = 'off'
    headline = off > 0 ? 'Too high, relax it down a little' : 'Too low, lift it a little'
  } else {
    tone = 'off'
    headline = off > 0 ? 'That was a higher note' : 'That was a lower note'
  }

  let detail: string | null = null
  // Published norms for solo singers: about 5 to 6.5 waves a second, swinging
  // less than a semitone each side. Slower reads as a wobble, faster as a
  // flutter, wider as unsteady. A little margin is allowed either way.
  if (a.vibrato && a.vibrato.depthCents > 100) {
    detail = 'Your vibrato is swinging wide. Try a slightly smaller, calmer wave'
  } else if (a.vibrato && a.vibrato.rateHz < 4.5) {
    detail = 'Your vibrato is on the slow side. Keep the breath flowing and let it move a little quicker'
  } else if (a.vibrato && a.vibrato.rateHz > 7.5) {
    detail = 'Your vibrato is fluttering fast. Relax the jaw and throat and let it slow down'
  } else if (a.vibrato) {
    detail = 'Lovely natural vibrato'
  } else if (a.wobbleCents > 28) {
    detail = 'The note wavered. A slow, steady breath out will smooth it'
  } else if (a.scoopCents <= -45) {
    detail = 'You slid up into it. Hear the note in your head first, then land on it'
  } else if (a.scoopCents >= 45) {
    detail = 'You came in high and settled down. Start a little gentler'
  } else if (a.driftCents <= -22) {
    detail = 'It sank a little toward the end. Keep the breath moving right to the finish'
  } else if (a.driftCents >= 22) {
    detail = 'It crept up toward the end. Stay relaxed as you hold'
  } else if (tone === 'good' && a.steadiness >= 85) {
    detail = 'Steady as a rock'
  }

  return { tone, headline, detail }
}
