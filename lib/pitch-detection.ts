/**
 * Shared pitch-detection primitives for every trainer.
 *
 * Previously ModernPitchTrainer, ScaleTrainer and SongPitchTrainer each carried
 * their own copy of this math, and they had drifted. ScaleTrainer's copy was the
 * correct one; the other two were missing guards, which is why Pitch Perfect
 * reported worse accuracy than the Scale Trainer despite using the same aubio
 * detector and the same 4096-sample buffer.
 *
 * The three divergences that mattered:
 *
 *   1. No frequency sanity gate. aubio emits values well outside singing range
 *      on breath, consonants and room noise. ScaleTrainer discarded anything
 *      outside 60-2000Hz; the others accepted every value.
 *
 *   2. Unnormalised note index. `NOTE_STRINGS[note % 12]` yields `undefined`
 *      for a negative note number, which a sub-27.5Hz reading produces.
 *
 *   3. Octave via `parseInt(String(note / 12))`, which truncates toward zero
 *      instead of flooring, so it disagrees with Math.floor below C0.
 *
 * Import from here rather than redefining locally, so the trainers cannot drift
 * apart again.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Display names using the musical sharp glyph. */
export const NOTE_STRINGS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

/** ASCII equivalents, for matching against data that uses '#'. */
export const NOTE_STRINGS_ASCII = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export const MIDDLE_A = 440
export const SEMITONE = 69
export const BUFFER_SIZE = 4096

/**
 * Usable vocal range for detection, in Hz.
 *
 * 60Hz sits just below the lowest bass fundamental (~65Hz / C2) and rejects
 * mains hum and handling rumble. 2000Hz sits above the highest soprano
 * fundamental (~1046Hz / C6) with headroom, while rejecting sibilance, which
 * aubio otherwise reports as a very high "note".
 */
export const MIN_DETECTABLE_HZ = 60
export const MAX_DETECTABLE_HZ = 2000

/** Deviation within which a note counts as in tune, in cents. */
export const IN_TUNE_THRESHOLD_CENTS = 15

// ---------------------------------------------------------------------------
// Note math
// ---------------------------------------------------------------------------

/** MIDI note number nearest to a frequency. */
export function getNote(frequency: number): number {
  const note = 12 * (Math.log(frequency / MIDDLE_A) / Math.log(2))
  return Math.round(note) + SEMITONE
}

/** Exact equal-temperament frequency of a MIDI note number. */
export function getStandardFrequency(note: number): number {
  return MIDDLE_A * Math.pow(2, (note - SEMITONE) / 12)
}

/** Signed deviation from the nearest note, in cents. */
export function getCents(frequency: number, note: number): number {
  return Math.floor((1200 * Math.log(frequency / getStandardFrequency(note))) / Math.log(2))
}

/**
 * Pitch class 0-11, normalised so negative note numbers stay in range.
 * `note % 12` alone returns a negative index and reads back `undefined`.
 */
export function noteIndex(note: number): number {
  return ((note % 12) + 12) % 12
}

/** Scientific-pitch octave number. Floors, so it stays correct below C0. */
export function octaveOf(note: number): number {
  return Math.floor(note / 12) - 1
}

/** Frequency of a named note, e.g. ('A', 4) -> 440. Accepts '#' or '♯'. */
export function getNoteFrequency(noteName: string, octave: number): number {
  const normalised = noteName.replace('#', '♯')
  const index = NOTE_STRINGS.indexOf(normalised as (typeof NOTE_STRINGS)[number])
  if (index === -1) return MIDDLE_A
  return getStandardFrequency((octave + 1) * 12 + index)
}

// ---------------------------------------------------------------------------
// Signal gating
// ---------------------------------------------------------------------------

/** Root-mean-square amplitude of a sample buffer. */
export function computeRms(input: Float32Array | number[]): number {
  let sum = 0
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
  return Math.sqrt(sum / input.length)
}

/**
 * RMS gate for a 0-100 sensitivity slider.
 *
 * Sensitivity 0 -> 0.10 (only loud, clearly voiced input passes)
 * Sensitivity 100 -> 0.01 (quiet singing passes, room noise still rejected)
 *
 * The old ModernPitchTrainer formula bottomed out at 0.001, ten times more
 * permissive, which let breath and room tone through as "notes".
 */
export function rmsThreshold(sensitivity: number): number {
  return 0.01 + (1 - sensitivity / 100) * 0.09
}

/** Whether a frequency is plausibly a sung fundamental. */
export function isPlausiblePitch(frequency: number): boolean {
  return (
    Number.isFinite(frequency) &&
    frequency >= MIN_DETECTABLE_HZ &&
    frequency <= MAX_DETECTABLE_HZ
  )
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface DetectedNote {
  /** Display name with the sharp glyph, e.g. 'F♯'. */
  name: string
  /** ASCII name, e.g. 'F#'. Use when comparing against stored data. */
  nameAscii: string
  /** MIDI note number. */
  value: number
  /** Deviation from the nearest note, in cents. */
  cents: number
  octave: number
  frequency: number
  /** Within IN_TUNE_THRESHOLD_CENTS of the nearest note. */
  isInTune: boolean
}

/**
 * Turn a raw aubio frequency into a note, or null if it should be discarded.
 * Every trainer should route detections through this rather than building the
 * note object inline.
 */
export function describeFrequency(frequency: number): DetectedNote | null {
  if (!isPlausiblePitch(frequency)) return null

  const value = getNote(frequency)
  const index = noteIndex(value)
  const cents = getCents(frequency, value)

  return {
    name: NOTE_STRINGS[index],
    nameAscii: NOTE_STRINGS_ASCII[index],
    value,
    cents,
    octave: octaveOf(value),
    frequency,
    isInTune: Math.abs(cents) <= IN_TUNE_THRESHOLD_CENTS,
  }
}

/**
 * Analyse one audio buffer end to end: amplitude gate, pitch detection,
 * plausibility gate. Returns null when the buffer should be ignored.
 *
 * `detector` is an aubio Pitch instance.
 */
export function analyzeBuffer(
  input: Float32Array,
  detector: { do: (buffer: Float32Array) => number },
  sensitivity: number
): DetectedNote | null {
  if (sensitivity === 0) return null
  if (computeRms(input) < rmsThreshold(sensitivity)) return null
  return describeFrequency(detector.do(input))
}
