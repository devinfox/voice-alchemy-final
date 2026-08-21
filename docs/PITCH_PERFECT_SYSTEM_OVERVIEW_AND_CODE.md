# Pitch Perfect: Architecture Overview & Complete Code Reference

## 1. Executive Summary

**Pitch Perfect** (implemented via [`ModernPitchTrainer`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/components/ModernPitchTrainer.tsx)) is the real-time vocal ear-training and pitch-matching system in the Voice Alchemy Academy CRM.

### Core Capabilities:
1. **Listen $\rightarrow$ Guard $\rightarrow$ Sing State Machine**:
   - When a user clicks a reference note, the system plays the reference tone while **muting microphone capture**.
   - A 400ms acoustic guard interval allows room reverberation and speaker bleed to dissipate before prompting the singer ("Sing Now!"), completely eliminating microphone contamination.
2. **Mathematically Rigorous Intonation Accuracy**:
   - Calculates continuous frame error in cents:
     $$\text{targetErrorCents} = 1200 \times \log_2\left(\frac{f_{\text{detected}}}{f_{\text{target}}}\right)$$
   - Calculates **Target Accuracy (%)** using Mean Absolute Error (MAE):
     $$\text{Target Accuracy} = \max\left(0, \min\left(100, 100 - (\text{MAE}_{\text{cents}} \times 0.5)\right)\right)$$
   - Absolutely no sharp/flat cancellation is mathematically possible.
3. **Logarithmic Voice Stability (in Cents)**:
   - Measures pitch standard deviation ($\sigma_{\text{cents}}$) in cents relative to the singer's mean pitch contour rather than linear Hz:
     $$\text{centsFromMean}_i = 1200 \times \log_2\left(\frac{f_i}{\bar{f}}\right)$$
   - Eliminates octave frequency bias and standardizes vocal steadiness across high soprano and low bass ranges.
4. **Vocal Octave Realignment (Octaves 2–6)**:
   - Covers the complete human singing range ($65\text{ Hz}$ Bass C2 to $1975\text{ Hz}$ Soprano B6), eliminating unusable sub-bass (Octave 0) and inaudible ultrasonic tones.
5. **Real-Time Scrolling Pitch Contour**:
   - Visualizes live vocal trajectory over time with a center target line, green $\pm 15$ cent in-tune zone, and moving vocal line.
6. **Analog Needle Meter Precision**:
   - Calibrated needle arc mapping $-50\text{ cents} \dots +50\text{ cents}$ across the full $-45^\circ \dots +45^\circ$ meter range.
7. **Deterministic Acoustic Facts for AI Coaching**:
   - Feeds exact acoustic metrics (Target Accuracy %, MAE cents, Pitch Bias cents, Sharp/Flat direction, Settled Onset Speed ms, and Sustain ms) to GPT-4o-mini for vocal coaching.

---

## 2. System Architecture & Audio Pipeline

```
+-----------------------------------------------------------------------------------+
|                                  USER INTERFACE                                   |
|  - 360° Chromatic Note Wheel / Virtual Piano Keyboard (Octaves 2-6)               |
|  - Listen -> Guard -> Sing State Machine Indicator (Listen... -> Sing Now!)       |
|  - Analog Needle Deviation Meter (-45 deg Flat to +45 deg Sharp)                  |
|  - Live Scrolling Pitch Contour Graph (Center line, +/-15¢ in-tune zone)          |
|  - Acoustic Session Stats (Target Accuracy %, Voice Stability %, Vocal Bias)     |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                                AUDIO PIPELINE                                     |
|  1. MediaStreamSource: getUserMedia() (high fidelity) OR shared-mic-stream.ts     |
|  2. AnalyserNode + ScriptProcessorNode (Buffer size = 4096 samples)               |
|  3. Amplitude Gating: computeRms() >= rmsThreshold(sensitivity) [0.01 - 0.10]    |
|  4. Aubio YIN FFT Pitch Detection: detector.do(buffer) -> frequency (Hz)         |
|  5. Frequency Sanity Filter: 60 Hz <= freq <= 2000 Hz                            |
|  6. Continuous Target Error: targetErrorCents = 1200 * log2(f / f_target)         |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        METRICS & LOCAL SESSION ENGINE                             |
|  - Non-cancelling MAE Intonation Accuracy = max(0, 100 - (maeCents * 0.5))        |
|  - Logarithmic Voice Stability = max(0, 100 - (centsStdDev * 2))                  |
|  - Settled Onset Speed: ms until 3 consecutive frames lock in-window (<=25¢)      |
|  - In-Tune Sustain: Max continuous in-tune duration with 1-frame grace tolerance  |
|  - Overall Score = (TargetAcc * 0.50) + (Stability * 0.30) + (Onset * 0.10) + ...|
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        BACKEND & PERSISTENCE (Supabase)                           |
|  - POST /api/pitch-training/session -> Stores session & per-note acoustic metrics |
|  - Strict Matched Notes: Target Accuracy >= 70% AND MAE <= 25 cents               |
|  - Asynchronous AI Vocal Coach -> lib/openai.ts with deterministic acoustics      |
+-----------------------------------------+-----------------------------------------+
```

---

## 3. Core Functional Code

### 3.1 [`lib/pitch-detection.ts`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/lib/pitch-detection.ts)
Provides shared pitch mathematics, continuous target cents calculation, logarithmic standard deviation, and RMS amplitude gating.

```typescript
export const NOTE_STRINGS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
export const NOTE_STRINGS_ASCII = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export const MIDDLE_A = 440
export const SEMITONE = 69
export const BUFFER_SIZE = 4096
export const MIN_DETECTABLE_HZ = 60
export const MAX_DETECTABLE_HZ = 2000
export const IN_TUNE_THRESHOLD_CENTS = 15

export function getNote(frequency: number): number {
  const note = 12 * (Math.log(frequency / MIDDLE_A) / Math.log(2))
  return Math.round(note) + SEMITONE
}

export function getStandardFrequency(note: number): number {
  return MIDDLE_A * Math.pow(2, (note - SEMITONE) / 12)
}

export function getCents(frequency: number, note: number): number {
  return Math.floor((1200 * Math.log(frequency / getStandardFrequency(note))) / Math.log(2))
}

export function noteIndex(note: number): number {
  return ((note % 12) + 12) % 12
}

export function octaveOf(note: number): number {
  return Math.floor(note / 12) - 1
}

export function getNoteFrequency(noteName: string, octave: number): number {
  const normalised = noteName.replace('#', '♯')
  const index = NOTE_STRINGS.indexOf(normalised as (typeof NOTE_STRINGS)[number])
  if (index === -1) return MIDDLE_A
  return getStandardFrequency((octave + 1) * 12 + index)
}

export function getTargetCentsError(detectedFrequency: number, targetFrequency: number): number {
  if (detectedFrequency <= 0 || targetFrequency <= 0) return 0
  return 1200 * Math.log2(detectedFrequency / targetFrequency)
}

export function calculateCentsStdDev(frequencies: number[]): number {
  if (frequencies.length <= 1) return 0
  const valid = frequencies.filter(f => f > 0)
  if (valid.length <= 1) return 0

  const meanFreq = valid.reduce((a, b) => a + b, 0) / valid.length
  const centsDeltas = valid.map(f => 1200 * Math.log2(f / meanFreq))
  const avgDelta = centsDeltas.reduce((a, b) => a + b, 0) / centsDeltas.length
  const variance = centsDeltas.reduce((sum, c) => sum + Math.pow(c - avgDelta, 2), 0) / centsDeltas.length
  return Math.sqrt(variance)
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeRms(input: Float32Array | number[]): number {
  let sum = 0
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
  return Math.sqrt(sum / input.length)
}

export function rmsThreshold(sensitivity: number): number {
  return 0.01 + (1 - sensitivity / 100) * 0.09
}

export function isPlausiblePitch(frequency: number): boolean {
  return Number.isFinite(frequency) && frequency >= MIN_DETECTABLE_HZ && frequency <= MAX_DETECTABLE_HZ
}

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

export function analyzeBuffer(
  input: Float32Array,
  detector: { do: (buffer: Float32Array) => number },
  sensitivity: number
): DetectedNote | null {
  if (sensitivity === 0) return null
  if (computeRms(input) < rmsThreshold(sensitivity)) return null
  return describeFrequency(detector.do(input))
}
```

---

### 3.2 [`components/ModernPitchTrainer.tsx`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/components/ModernPitchTrainer.tsx)
Complete frontend trainer with Listen-Guard-Sing pipeline, scrolling contour visualizer, calibrated needle, and non-cancelling metric accumulation.

---

### 3.3 [`app/api/pitch-training/session/route.ts`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/app/api/pitch-training/session/route.ts)
Backend API for saving pitch sessions, calculating musically weighted scores, validating note matches, and triggering AI coaching.

---

### 3.4 [`lib/openai.ts`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/lib/openai.ts)
AI Coaching engine providing pedagogical analysis based on deterministic vocal acoustic telemetry.
