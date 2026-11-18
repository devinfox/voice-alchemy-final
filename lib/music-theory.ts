/**
 * Music theory the practice tools lean on.
 *
 * Lifted from the theory library built for ByeTalk Studio (voice-processor
 * `app/lib/musicTheory/scales.ts`, `modalityEngine.ts`, `pitch/scaleTuning.ts`
 * and the harmony database's SCALE_DEGREE_COLORS), trimmed to what a singing
 * student needs and reworded for beginners.
 *
 * The first eight scale ids are the ones the Scale Trainer has always saved,
 * so existing sessions and personal bests keep matching.
 */

export interface ScaleInfo {
  id: string
  name: string
  /** Semitones above the home note, one octave, without the top home note. */
  intervals: number[]
  /** How it feels, in a few words. */
  mood: string
}

export interface ScaleGroup {
  label: string
  scales: ScaleInfo[]
}

export const SCALE_GROUPS: ScaleGroup[] = [
  {
    label: 'Start here',
    scales: [
      { id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11], mood: 'Bright, happy, settled' },
      { id: 'natural_minor', name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10], mood: 'Sad, emotional, dramatic' },
      { id: 'pentatonic_major', name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9], mood: 'Open and easy, folk and pop hooks' },
      { id: 'pentatonic_minor', name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10], mood: 'Soulful, the home of riffs and runs' },
    ],
  },
  {
    label: 'More minor colours',
    scales: [
      { id: 'harmonic_minor', name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11], mood: 'Dramatic, with a strong pull back home' },
      { id: 'melodic_minor', name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11], mood: 'Smooth and jazzy' },
      { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], mood: 'Soulful and cool, neo-soul and funk' },
      { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], mood: 'Dark and tense, Spanish flavour' },
    ],
  },
  {
    label: 'More major colours',
    scales: [
      { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], mood: 'Bluesy swagger, rock and gospel' },
      { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], mood: 'Dreamy and floating, film music' },
    ],
  },
  {
    label: 'Blues & soul',
    scales: [
      { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10], mood: 'Minor pentatonic plus the gritty blue note' },
      { id: 'major_blues', name: 'Major Blues', intervals: [0, 2, 3, 4, 7, 9], mood: 'Sweet and sunny with a little grit, gospel and country' },
    ],
  },
  {
    label: 'Around the world',
    scales: [
      { id: 'phrygian_dominant', name: 'Phrygian Dominant', intervals: [0, 1, 4, 5, 7, 8, 10], mood: 'Flamenco and Middle Eastern drama' },
      { id: 'arabic', name: 'Double Harmonic', intervals: [0, 1, 4, 5, 7, 8, 11], mood: 'Ornate and exotic, two big leaps' },
      { id: 'hungarian_minor', name: 'Hungarian Minor', intervals: [0, 2, 3, 6, 7, 8, 11], mood: 'Fiery and mysterious' },
      { id: 'hirajoshi', name: 'Hirajoshi', intervals: [0, 2, 3, 7, 8], mood: 'Japanese five-note scale, calm and haunting' },
    ],
  },
  {
    label: 'Ear stretchers',
    scales: [
      { id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], mood: 'Every note, one small step at a time' },
      { id: 'whole_tone', name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10], mood: 'Weightless, dream-sequence sound' },
      { id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], mood: 'Unsettled and tense, never quite lands' },
    ],
  },
]

const SCALES_BY_ID = new Map(SCALE_GROUPS.flatMap((g) => g.scales).map((s) => [s.id, s]))

export function getScale(id: string): ScaleInfo {
  return SCALES_BY_ID.get(id) ?? SCALES_BY_ID.get('major')!
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export interface DegreeInfo {
  /** What a teacher would call it, e.g. "the 3rd" or "the flat 7th". */
  name: string
  /** What the note does in the scale, in plain words. */
  role: string
  /** Advice when this is the note that went wrong. */
  tip: string
}

/**
 * What each step above the home note is and how it behaves.
 * Index = semitones above home. From the harmony database's degree colours.
 */
const DEGREES: DegreeInfo[] = [
  { name: 'the home note', role: 'Where the scale rests', tip: 'Hum it before you start so your ear knows where home is.' },
  { name: 'the flat 2nd', role: 'A tight, tense step just above home', tip: 'It is only a tiny step up from home. Think smaller than feels natural.' },
  { name: 'the 2nd', role: 'An open step away from home', tip: 'A full step up from home. Do not let it sag back toward home.' },
  { name: 'the flat 3rd', role: 'The note that makes a scale sound minor', tip: 'This is the sad-sounding third. Sing it a shade lower than the bright major one.' },
  { name: 'the 3rd', role: 'The note that makes a scale sound major', tip: 'Singers often leave this one low. Think bright and smile into it.' },
  { name: 'the 4th', role: 'Leans back down toward the 3rd', tip: 'It sits just above the 3rd. Reach for it, then let it relax down.' },
  { name: 'the sharp 4th', role: 'The gritty in-between note', tip: 'It sits right between the 4th and 5th. Slide through it slowly to find it.' },
  { name: 'the 5th', role: 'Strong and open, the second home', tip: 'A big, solid note. Sing home and this one back and forth to lock it in.' },
  { name: 'the flat 6th', role: 'A dark, aching colour', tip: 'Just a small step above the 5th. Keep it close.' },
  { name: 'the 6th', role: 'A warm, sweet colour', tip: 'A full step above the 5th. Keep the breath moving so it does not fall flat.' },
  { name: 'the flat 7th', role: 'The bluesy, relaxed 7th', tip: 'A full step below the top home note. Do not push it up too far.' },
  { name: 'the 7th', role: 'Pulls strongly up to home', tip: 'It wants to rise to home, so it is easy to leave flat. Aim high, almost touching home.' },
]

/** Describe a note of a scale by how far it sits above the home note. */
export function describeDegree(semitonesAboveHome: number): DegreeInfo {
  return DEGREES[((semitonesAboveHome % 12) + 12) % 12]
}

/**
 * Notes for a soft backing chord under a scale: home, the scale's own 3rd
 * (major or minor, whichever it has) and its 5th. Returned as semitones above
 * home so the caller can place them in any octave.
 */
export function backingChordIntervals(scale: ScaleInfo): number[] {
  const has = (n: number) => scale.intervals.includes(n)
  const third = has(4) ? 4 : has(3) ? 3 : null
  const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : null
  // Scales with every note (chromatic) or no clear chord just get home + 5th.
  if (scale.intervals.length >= 12) return [0, 7]
  return [0, ...(third !== null ? [third] : []), ...(fifth !== null ? [fifth] : [])]
}
