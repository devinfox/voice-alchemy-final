# Rhythm Trainer: Architecture Overview & Complete Code Reference

## 1. Executive Summary

The **Rhythm Trainer** (implemented in [`components/RhythmTrainer.tsx`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/components/RhythmTrainer.tsx)) is the real-time timing, tempo, groove, and pocket training module in the Voice Alchemy Academy CRM.

While pitch accuracy ensures a singer hits the correct frequency, rhythm and timing ensure the singer lands phrases on the pocket, breathes in tempo, locks into subdivisions, and grooves effortlessly with live musicians or backing tracks.

---

### Core Engineering & Acoustic Innovations

1. **Monotonic High-Resolution Timing Domain**:
   - All timing interactions operate exclusively within `performance.now()` high-resolution monotonic timestamps, eliminating wall-clock jitter, leap seconds, and `Date.now()` discretization.
2. **Output Latency Compensation & Calibration**:
   - Computes hardware output latency via `AudioContext.baseLatency + AudioContext.outputLatency` to calculate when the synthesized metronome click *physically leaves the speakers*.
   - Includes a user-adjustable Hardware & Bluetooth Latency Compensation slider ($\pm 100\text{ms}$).
3. **Compound Meter & Subdivision Grid Engine**:
   - **Meter Models**: $4/4$, $3/4$, $6/8$ (compound duple with primary accent on 1 and secondary on 4), $2/4$, $5/4$ ($3+2$), and $7/8$ ($3+2+2$).
   - **Subdivisions**: Quarter notes ($1\times$), Eighth notes ($2\times$), Triplets ($3\times$), Sixteenth notes ($4\times$), and Offbeat-only ("&") syncopation.
   - **Pocket Practice Modes**:
     - *All Clicks*: Standard continuous reference.
     - *Backbeat*: Metronome clicks only on 2 & 4 to build an internal pulse.
     - *Missing Bar (Dropout)*: Every 4th measure drops out completely to test tempo drift and internal clock steadiness.
4. **Dynamic Tempo-Scaled Tolerances**:
   - Pocket tolerance scales dynamically with BPM:
     $$\text{allowedOnBeatMs} = \text{clamp}\left(\frac{60000}{\text{BPM}} \times 0.08, 15\text{ms}, 45\text{ms}\right)$$
   - Search window dynamically adapts to prevent overlapping adjacent beat misassignment at high BPM ($220+\text{ BPM}$).
5. **Mathematically Sound Multiplicative Scoring**:
   - Solves the critical 0-hit bug ($52\%$ score when doing nothing) by weighting overall score by Hit Rate:
     $$\text{Hit Rate} = \frac{\text{hits}}{\text{totalBeats}}$$
     $$\text{Accuracy (MAE Score)} = \max(0, 100 - \text{MAE}_{\text{ms}} \times 1.2)$$
     $$\text{On-Grid Score} = \left(\frac{\text{onBeatHits}}{\text{totalHits}}\right) \times 100$$
     $$\text{Consistency Score} = \max\left(0, 100 - \frac{\sigma_{\text{ms}}}{1.5}\right)$$
     $$\text{Overall Score} = \text{Hit Rate} \times \left(0.40 \times \text{On-Grid Score} + 0.35 \times \text{Accuracy Score} + 0.25 \times \text{Consistency Score}\right)$$
6. **Zero-Leak Metronome Muting & Audio Lifecycle**:
   - Metronome sounds route through a dedicated `masterMetronomeGainNode`.
   - On `stopMetronome()`, master gain is set to $0$ immediately, and a `generationId` counter invalidates all scheduled animation frames and future beat sweeps, guaranteeing zero orphaned audio clicks or visual glitches.
7. **Acoustic Feedback & Mic Headphone Advisory**:
   - Includes real-time RMS transient detection and displays an active **"🎧 Headphones Recommended"** advisory to prevent speaker metronome clicks from triggering the microphone detector.
8. **Automated Beat-Weighted Database Rollup & Triggers**:
   - PostgreSQL trigger `trg_rhythm_sessions_weekly_progress` automatically recomputes weekly progress weighted by `total_beats` attempted, preventing a 5-beat session from skewing a 500-beat session.

---

## 2. System Architecture & Timing Pipeline

```
+-----------------------------------------------------------------------------------+
|                            HIGH-RESOLUTION AUDIO CLOCK                            |
|                                                                                   |
|  Web Audio currentTime lookahead scheduler (25ms interval, 300ms lookahead)       |
|                                    │                                              |
|                                    ▼                                              |
|  Output Latency Mapping: expectedPerfMs = perfStart + (tAudio - tAudioStart)*1000  |
|                                          + (baseLatency + outputLatency)*1000     |
+------------------------------------+----------------------------------------------+
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
       POINTER / KEYBOARD TRIGGER               MICROPHONE ONSET DETECTOR
     - onPointerDown / spacebar              - Time-domain RMS + Dynamic Jump
     - event.timeStamp                       - Refractory Lockout (120ms)
     - User Latency Calibration Offset       - Headphone Feedback Guard
                 │                                       │
                 └───────────────────┬───────────────────┘
                                     ▼
                      UNIFIED PERFORMANCE TIME DOMAIN
                                     │
                                     ▼
                SEQUENTIAL TEMPO-SCALED ORDERED BEAT MATCHER
    - allowedOnBeatMs = clamp(beatDuration * 0.08, 15ms, 45ms)
    - halfWindowMs = min(220ms, beatDuration * 0.48)
    - Sequential single-pass matching
                                     │
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
           POCKET BIAS           ERROR (MAE)        CONSISTENCY (σ)
       Median signed offset   Mean absolute error   Standard deviation
                 │                   │                   │
                 └───────────────────┼───────────────────┘
                                     ▼
                        MULTIPLICATIVE OVERALL SCORE
                  HitRate * (0.40*OnGrid + 0.35*MAE + 0.25*StdDev)
                                     │
                                     ▼
                         DATABASE & AI COACHING
            - Supabase multi-session & beat metrics persistence
            - Automated PostgreSQL beat-weighted weekly rollup trigger
            - Asynchronous GPT-4o-mini pedagogical coaching
```

---

## 3. Complete Functional Code Reference

### 3.1 Component: [`components/RhythmTrainer.tsx`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/components/RhythmTrainer.tsx)

```tsx
'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Maximize2, Minimize2, Play, Pause, Mic, MicOff, Save, TrendingUp, Settings2, Volume2, Headphones, Sliders, ShieldAlert, Sparkles } from 'lucide-react'

// ============================================================================
// TYPES & DATA STRUCTURES
// ============================================================================

export type MetronomeSound = 'click' | 'woodblock' | 'hihat' | 'cowbell' | 'beep'
export type TimeSignature = '4/4' | '3/4' | '6/8' | '2/4' | '5/4' | '7/8'
export type Subdivision = '1x' | '2x' | '3x' | '4x' | 'offbeat'
export type RhythmPracticeMode = 'normal' | 'backbeat' | 'missing_bar'
export type TimingResult = 'on-beat' | 'early' | 'late' | 'missed'

export interface BeatTiming {
  beatNumber: number
  subdivisionIndex?: number
  expectedTimeMs: number
  actualTimeMs: number | null
  offsetMs: number | null
  offsetFractionOfBeat: number | null
  result: TimingResult
  inputType: 'tap' | 'mic'
}

export interface SessionMetrics {
  startedAt: Date | null
  endedAt: Date | null
  bpm: number
  timeSignature: TimeSignature
  subdivision: Subdivision
  practiceMode: RhythmPracticeMode
  beatTimings: BeatTiming[]
  isActive: boolean
}

export interface SessionStats {
  totalBeats: number
  completedHits: number
  hitRatePercent: number
  onBeatCount: number
  earlyCount: number
  lateCount: number
  missedCount: number
  avgOffsetMs: number
  medianSignedOffsetMs: number
  maeMs: number
  consistency: number
  onBeatPercent: number
  onGridPercent: number
  bestStreak: number
  currentStreak: number
  rhythmTendency: 'early' | 'late' | 'on-time'
  avgEarlyMs: number
  avgLateMs: number
  overallScore: number
}

interface MeterConfig {
  value: TimeSignature
  label: string
  beats: number
  accentPattern: number[] // Indices of beats that get accents (0-indexed)
  description: string
}

// ============================================================================
// CONSTANTS & METER DEFINITIONS
// ============================================================================

const METER_CONFIGS: MeterConfig[] = [
  { value: '4/4', label: '4/4', beats: 4, accentPattern: [0], description: 'Common time: 4 quarter notes per bar' },
  { value: '3/4', label: '3/4', beats: 3, accentPattern: [0], description: 'Waltz time: 3 quarter notes per bar' },
  { value: '6/8', label: '6/8', beats: 6, accentPattern: [0, 3], description: 'Compound duple: two groups of 3 eighth notes' },
  { value: '2/4', label: '2/4', beats: 2, accentPattern: [0], description: 'March time: 2 quarter notes per bar' },
  { value: '5/4', label: '5/4', beats: 5, accentPattern: [0, 3], description: 'Complex meter: 3+2 grouping' },
  { value: '7/8', label: '7/8', beats: 7, accentPattern: [0, 3, 5], description: 'Complex meter: 3+2+2 grouping' },
]

const SUBDIVISION_CONFIGS: { value: Subdivision; label: string; count: number; name: string }[] = [
  { value: '1x', label: '1/4', count: 1, name: 'Quarter Notes (Main Beat)' },
  { value: '2x', label: '1/8', count: 2, name: 'Eighth Notes (1 & 2 &)' },
  { value: '3x', label: '1/8T', count: 3, name: 'Triplets (1 trip let)' },
  { value: '4x', label: '1/16', count: 4, name: 'Sixteenth Notes (1 e & a)' },
  { value: 'offbeat', label: '&', count: 1, name: 'Offbeats Only (Syncopation)' },
]

const SOUND_OPTIONS: { value: MetronomeSound; label: string }[] = [
  { value: 'click', label: 'Studio Click' },
  { value: 'woodblock', label: 'Woodblock' },
  { value: 'hihat', label: 'Hi-Hat' },
  { value: 'cowbell', label: '808 Cowbell' },
  { value: 'beep', label: 'Digital Beep' },
]

const SCHEDULE_AHEAD_SECONDS = 0.3
const TAP_TEMPO_RESET_FACTOR = 1.5

type AudioContextConstructor = typeof AudioContext

function createBrowserAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext ||
    (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext

  if (!AudioContextCtor) {
    throw new Error('Web Audio is not supported in this browser')
  }

  return new AudioContextCtor()
}

// ============================================================================
// METRONOME AUDIO SYNTHESIZER
// ============================================================================

function synthesizeMetronomePulse(
  audioContext: AudioContext,
  destination: AudioNode,
  soundType: MetronomeSound,
  isPrimaryAccent: boolean = false,
  isSecondaryAccent: boolean = false,
  volumePercent: number = 70,
  when: number = audioContext.currentTime
): void {
  const time = Math.max(when, audioContext.currentTime)
  const baseVolume = isPrimaryAccent ? 0.9 : isSecondaryAccent ? 0.65 : 0.45
  const volume = baseVolume * (volumePercent / 100)

  switch (soundType) {
    case 'click': {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.connect(gain)
      gain.connect(destination)
      osc.frequency.value = isPrimaryAccent ? 1400 : isSecondaryAccent ? 1000 : 800
      osc.type = 'square'
      gain.gain.setValueAtTime(volume, time)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035)
      osc.start(time)
      osc.stop(time + 0.035)
      break
    }
    case 'woodblock': {
      const osc = audioContext.createOscillator()
      const filter = audioContext.createBiquadFilter()
      const gain = audioContext.createGain()
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(destination)
      osc.frequency.value = isPrimaryAccent ? 950 : isSecondaryAccent ? 750 : 600
      osc.type = 'triangle'
      filter.type = 'bandpass'
      filter.frequency.value = isPrimaryAccent ? 2200 : 1600
      filter.Q.value = 6
      gain.gain.setValueAtTime(volume, time)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08)
      osc.start(time)
      osc.stop(time + 0.08)
      break
    }
    case 'hihat': {
      const bufferSize = Math.floor(audioContext.sampleRate * 0.04)
      const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3)
      }
      const source = audioContext.createBufferSource()
      const filter = audioContext.createBiquadFilter()
      const gain = audioContext.createGain()
      source.buffer = buffer
      filter.type = 'highpass'
      filter.frequency.value = isPrimaryAccent ? 7000 : 8500
      source.connect(filter)
      filter.connect(gain)
      gain.connect(destination)
      gain.gain.setValueAtTime(volume * 0.7, time)
      source.start(time)
      break
    }
    case 'cowbell': {
      const osc1 = audioContext.createOscillator()
      const osc2 = audioContext.createOscillator()
      const filter = audioContext.createBiquadFilter()
      const gain = audioContext.createGain()
      filter.type = 'bandpass'
      filter.frequency.value = isPrimaryAccent ? 900 : 800
      filter.Q.value = 3
      osc1.connect(filter)
      osc2.connect(filter)
      filter.connect(gain)
      gain.connect(destination)
      osc1.frequency.value = isPrimaryAccent ? 587 : 540
      osc2.frequency.value = isPrimaryAccent ? 845 : 800
      osc1.type = 'square'
      osc2.type = 'square'
      gain.gain.setValueAtTime(volume * 0.4, time)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14)
      osc1.start(time)
      osc2.start(time)
      osc1.stop(time + 0.14)
      osc2.stop(time + 0.14)
      break
    }
    case 'beep': {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.connect(gain)
      gain.connect(destination)
      osc.frequency.value = isPrimaryAccent ? 880 : isSecondaryAccent ? 660 : 520
      osc.type = 'sine'
      gain.gain.setValueAtTime(volume * 0.5, time)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09)
      osc.start(time)
      osc.stop(time + 0.09)
      break
    }
  }
}

// ============================================================================
// STATISTICAL EVALUATION ENGINE
// ============================================================================

export function calculateStats(timings: BeatTiming[]): SessionStats {
  const completedTimings = timings.filter(t => t.result !== 'missed' && t.offsetMs !== null)
  const totalBeats = timings.length
  const completedHits = completedTimings.length

  if (totalBeats === 0 || completedHits === 0) {
    return {
      totalBeats,
      completedHits: 0,
      hitRatePercent: 0,
      onBeatCount: 0,
      earlyCount: 0,
      lateCount: 0,
      missedCount: totalBeats,
      avgOffsetMs: 0,
      medianSignedOffsetMs: 0,
      maeMs: 0,
      consistency: 0,
      onBeatPercent: 0,
      onGridPercent: 0,
      bestStreak: 0,
      currentStreak: 0,
      rhythmTendency: 'on-time',
      avgEarlyMs: 0,
      avgLateMs: 0,
      overallScore: 0,
    }
  }

  const onBeatCount = timings.filter(t => t.result === 'on-beat').length
  const earlyCount = timings.filter(t => t.result === 'early').length
  const lateCount = timings.filter(t => t.result === 'late').length
  const missedCount = timings.filter(t => t.result === 'missed').length

  const offsets = completedTimings.map(t => t.offsetMs || 0)
  const absOffsets = offsets.map(Math.abs)

  // 1. Mean and Median statistics
  const avgOffsetMs = offsets.reduce((a, b) => a + b, 0) / offsets.length
  const maeMs = absOffsets.reduce((a, b) => a + b, 0) / absOffsets.length

  const sortedOffsets = [...offsets].sort((a, b) => a - b)
  const mid = Math.floor(sortedOffsets.length / 2)
  const medianSignedOffsetMs = sortedOffsets.length % 2 !== 0
    ? sortedOffsets[mid]
    : (sortedOffsets[mid - 1] + sortedOffsets[mid]) / 2

  // 2. Timing Consistency (Robust std dev, 0ms = 100%, 150ms = 0%)
  let consistency = 100
  if (offsets.length > 1) {
    const variance = offsets.reduce((sum, x) => sum + Math.pow(x - avgOffsetMs, 2), 0) / offsets.length
    const stdDev = Math.sqrt(variance)
    consistency = Math.max(0, Math.min(100, Math.round(100 - (stdDev / 1.5))))
  }

  // 3. Streaks
  let bestStreak = 0
  let currentStreak = 0
  for (const t of timings) {
    if (t.result === 'on-beat') {
      currentStreak++
      bestStreak = Math.max(bestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  // 4. Percentage scores
  const hitRatePercent = (completedHits / totalBeats) * 100
  const onBeatPercent = (onBeatCount / totalBeats) * 100
  const onGridPercent = (onBeatCount / completedHits) * 100

  // 5. Early / Late statistics
  const earlyTimings = completedTimings.filter(t => t.result === 'early')
  const lateTimings = completedTimings.filter(t => t.result === 'late')
  const avgEarlyMs = earlyTimings.length > 0
    ? earlyTimings.reduce((sum, t) => sum + (t.offsetMs || 0), 0) / earlyTimings.length
    : 0
  const avgLateMs = lateTimings.length > 0
    ? lateTimings.reduce((sum, t) => sum + (t.offsetMs || 0), 0) / lateTimings.length
    : 0

  // 6. Calibrated Rhythm Tendency
  let rhythmTendency: 'early' | 'late' | 'on-time' = 'on-time'
  if (Math.abs(medianSignedOffsetMs) >= 10) {
    if (medianSignedOffsetMs < -10 && (earlyCount / completedHits) >= 0.30) {
      rhythmTendency = 'early'
    } else if (medianSignedOffsetMs > 10 && (lateCount / completedHits) >= 0.30) {
      rhythmTendency = 'late'
    }
  }

  // 7. Rigorous Multiplicative Overall Score
  // Accuracy Score: based on MAE (0ms = 100%, 50ms = 50%, 100ms+ = 0%)
  const accuracyScore = Math.max(0, Math.min(100, 100 - (maeMs * 1.2)))
  const timingQuality = (onGridPercent * 0.40) + (accuracyScore * 0.35) + (consistency * 0.25)
  const overallScore = Math.max(0, Math.min(100, (hitRatePercent / 100) * timingQuality))

  return {
    totalBeats,
    completedHits,
    hitRatePercent: Math.round(hitRatePercent),
    onBeatCount,
    earlyCount,
    lateCount,
    missedCount,
    avgOffsetMs: Math.round(avgOffsetMs * 10) / 10,
    medianSignedOffsetMs: Math.round(medianSignedOffsetMs * 10) / 10,
    maeMs: Math.round(maeMs * 10) / 10,
    consistency,
    onBeatPercent: Math.round(onBeatPercent * 10) / 10,
    onGridPercent: Math.round(onGridPercent * 10) / 10,
    bestStreak,
    currentStreak,
    rhythmTendency,
    avgEarlyMs: Math.round(avgEarlyMs * 10) / 10,
    avgLateMs: Math.round(avgLateMs * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface RhythmTrainerProps {
  variant?: 'floating' | 'card'
}

export default function RhythmTrainer({ variant = 'floating' }: RhythmTrainerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCalibration, setShowCalibration] = useState(false)

  // Metronome state
  const [bpm, setBpm] = useState(90)
  const [timeSignature, setTimeSignature] = useState<TimeSignature>('4/4')
  const [subdivision, setSubdivision] = useState<Subdivision>('1x')
  const [practiceMode, setPracticeMode] = useState<RhythmPracticeMode>('normal')
  const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>('click')
  const [volume, setVolume] = useState(70)
  const [isPlaying, setIsPlaying] = useState(false)

  // Calibration & Latency
  const [userCalibrationMs, setUserCalibrationMs] = useState(0)
  const [estimatedHardwareLatencyMs, setEstimatedHardwareLatencyMs] = useState(0)

  // Live Beat Tracking
  const [currentBeatIndex, setCurrentBeatIndex] = useState(0)
  const [recentTimings, setRecentTimings] = useState<BeatTiming[]>([])

  // Microphone Input State
  const [isListening, setIsListening] = useState(false)
  const [sensitivity, setSensitivity] = useState(60)

  // Session state
  const [session, setSession] = useState<SessionMetrics>({
    startedAt: null,
    endedAt: null,
    bpm: 90,
    timeSignature: '4/4',
    subdivision: '1x',
    practiceMode: 'normal',
    beatTimings: [],
    isActive: false,
  })

  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Audio & Clock Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const schedulerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const generationIdRef = useRef(0)

  const nextPulseTimeRef = useRef(0)
  const pulseCounterRef = useRef(0)
  const scheduledPulsesRef = useRef<Array<{
    pulseId: number
    beatNumber: number
    subdivisionIndex: number
    expectedPerfMs: number
    processed: boolean
    isMutedByPracticeMode: boolean
  }>>([])

  // Clock sync refs
  const audioContextStartTimeRef = useRef(0)
  const performanceStartTimeRef = useRef(0)
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  // Mic Audio Nodes
  const micStreamRef = useRef<MediaStream | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const micAnimFrameRef = useRef<number | null>(null)
  const previousRmsRef = useRef(0)
  const lastMicOnsetTimeRef = useRef(0)

  // Tap Feedback
  const [tapFeedback, setTapFeedback] = useState<{ result: TimingResult | 'no-match'; id: number; offsetMs?: number } | null>(null)
  const tapFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null)
  const tapIdRef = useRef(0)

  // Tap Tempo state
  const tapTempoTimesRef = useRef<number[]>([])
  const [tapTempoCount, setTapTempoCount] = useState(0)

  const currentMeterConfig = useMemo(() => {
    return METER_CONFIGS.find(m => m.value === timeSignature) || METER_CONFIGS[0]
  }, [timeSignature])

  // Hit registration
  const registerHit = useCallback((hitPerfTimestamp: number, inputType: 'tap' | 'mic') => {
    if (!isPlaying || scheduledPulsesRef.current.length === 0) return null

    const correctedHitTime = hitPerfTimestamp - userCalibrationMs
    const beatDurationMs = 60000 / bpm
    const halfWindowMs = Math.min(220, beatDurationMs * 0.48)
    const allowedOnBeatMs = Math.max(15, Math.min(45, beatDurationMs * 0.08))

    let closestPulse: typeof scheduledPulsesRef.current[0] | null = null
    let closestOffset = Infinity

    for (const pulse of scheduledPulsesRef.current) {
      if (pulse.processed) continue

      const offset = correctedHitTime - pulse.expectedPerfMs
      if (Math.abs(offset) <= halfWindowMs && Math.abs(offset) < Math.abs(closestOffset)) {
        closestOffset = offset
        closestPulse = pulse
      }
    }

    if (!closestPulse) return null

    closestPulse.processed = true

    const result: TimingResult = Math.abs(closestOffset) <= allowedOnBeatMs
      ? 'on-beat'
      : closestOffset < 0
        ? 'early'
        : 'late'

    const newTiming: BeatTiming = {
      beatNumber: closestPulse.beatNumber,
      subdivisionIndex: closestPulse.subdivisionIndex,
      expectedTimeMs: closestPulse.expectedPerfMs,
      actualTimeMs: correctedHitTime,
      offsetMs: closestOffset,
      offsetFractionOfBeat: closestOffset / beatDurationMs,
      result,
      inputType,
    }

    setRecentTimings(prev => [...prev.slice(-23), newTiming])
    setSession(prev => ({
      ...prev,
      beatTimings: [...prev.beatTimings, newTiming],
    }))

    return { result, offsetMs: closestOffset }
  }, [isPlaying, bpm, userCalibrationMs])

  const handleTap = useCallback((e?: React.PointerEvent | MouseEvent | KeyboardEvent) => {
    const hitTime = (e && typeof e.timeStamp === 'number' && e.timeStamp > 0)
      ? e.timeStamp
      : performance.now()

    const outcome = registerHit(hitTime, 'tap')

    tapIdRef.current += 1
    setTapFeedback({
      result: outcome?.result ?? 'no-match',
      offsetMs: outcome?.offsetMs,
      id: tapIdRef.current
    })

    if (tapFeedbackTimerRef.current) clearTimeout(tapFeedbackTimerRef.current)
    tapFeedbackTimerRef.current = setTimeout(() => setTapFeedback(null), 300)
  }, [registerHit])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      e.preventDefault()
      if (e.repeat) return
      handleTap(e)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleTap])

  // Mic Onset Detection
  const startMic = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = createBrowserAudioContext()
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      micStreamRef.current = stream

      const source = audioContextRef.current.createMediaStreamSource(stream)
      const analyser = audioContextRef.current.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      micAnalyserRef.current = analyser

      setIsListening(true)

      const bufferLength = analyser.frequencyBinCount
      const timeData = new Float32Array(bufferLength)

      const checkMicAudio = () => {
        if (!micAnalyserRef.current) return
        micAnalyserRef.current.getFloatTimeDomainData(timeData)

        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += timeData[i] * timeData[i]
        }
        const rms = Math.sqrt(sum / bufferLength)

        const nowPerf = performance.now()
        const dynamicThreshold = 0.012 + (1 - sensitivity / 100) * 0.09
        const minRefractoryMs = 120

        if (
          rms > dynamicThreshold &&
          rms > previousRmsRef.current * 1.45 &&
          nowPerf - lastMicOnsetTimeRef.current > minRefractoryMs
        ) {
          lastMicOnsetTimeRef.current = nowPerf
          registerHit(nowPerf, 'mic')
        }

        previousRmsRef.current = rms
        micAnimFrameRef.current = requestAnimationFrame(checkMicAudio)
      }

      micAnimFrameRef.current = requestAnimationFrame(checkMicAudio)
    } catch (err) {
      console.error('Microphone error:', err)
      alert('Could not access microphone.')
    }
  }, [sensitivity, registerHit])

  const stopMic = useCallback(() => {
    if (micAnimFrameRef.current) {
      cancelAnimationFrame(micAnimFrameRef.current)
      micAnimFrameRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    micAnalyserRef.current = null
    setIsListening(false)
  }, [])

  // Tap Tempo
  const registerTempoTap = useCallback(() => {
    const now = performance.now()
    const taps = tapTempoTimesRef.current

    if (taps.length > 0) {
      const lastInterval = now - taps[taps.length - 1]
      if (lastInterval > 2200) {
        taps.length = 0
      }
    }

    taps.push(now)
    if (taps.length > 8) taps.shift()
    setTapTempoCount(taps.length)

    if (taps.length < 3) return

    const intervals: number[] = []
    for (let i = 1; i < taps.length; i++) {
      intervals.push(taps[i] - taps[i - 1])
    }

    const sorted = [...intervals].sort((a, b) => a - b)
    const medianInterval = sorted[Math.floor(sorted.length / 2)]

    if (medianInterval > 0) {
      const derivedBpm = Math.round(60000 / medianInterval)
      setBpm(Math.max(40, Math.min(240, derivedBpm)))
    }
  }, [])

  const resetTapTempo = useCallback(() => {
    tapTempoTimesRef.current = []
    setTapTempoCount(0)
  }, [])

  // Sweeper
  const sweepMissedPulses = useCallback(() => {
    const nowPerf = performance.now() - userCalibrationMs
    const beatDurationMs = 60000 / bpm
    const halfWindowMs = Math.min(220, beatDurationMs * 0.48)
    const missedList: BeatTiming[] = []

    scheduledPulsesRef.current.forEach((pulse) => {
      if (!pulse.processed && nowPerf > pulse.expectedPerfMs + halfWindowMs) {
        pulse.processed = true
        missedList.push({
          beatNumber: pulse.beatNumber,
          subdivisionIndex: pulse.subdivisionIndex,
          expectedTimeMs: pulse.expectedPerfMs,
          actualTimeMs: null,
          offsetMs: null,
          offsetFractionOfBeat: null,
          result: 'missed',
          inputType: 'tap',
        })
      }
    })

    if (missedList.length > 0) {
      setRecentTimings(prev => [...prev.slice(-(24 - missedList.length)), ...missedList])
      setSession(prev => ({
        ...prev,
        beatTimings: [...prev.beatTimings, ...missedList],
      }))
    }

    scheduledPulsesRef.current = scheduledPulsesRef.current.filter(p => nowPerf - p.expectedPerfMs < 8000)
  }, [bpm, userCalibrationMs])

  const scheduleMetronome = useCallback(() => {
    if (!audioContextRef.current || !masterGainRef.current) return

    const currentCtxTime = audioContextRef.current.currentTime
    const beatsPerMeasure = currentMeterConfig.beats
    const subFactor = subdivision === '2x' ? 2 : subdivision === '3x' ? 3 : subdivision === '4x' ? 4 : 1
    const secondsPerSubdivision = (60.0 / bpm) / subFactor
    const thisGenId = generationIdRef.current

    const baseLat = audioContextRef.current.baseLatency || 0
    const outLat = (audioContextRef.current as any).outputLatency || 0
    const totalOutLatMs = (baseLat + outLat) * 1000

    while (nextPulseTimeRef.current < currentCtxTime + SCHEDULE_AHEAD_SECONDS) {
      const pulseIndex = pulseCounterRef.current
      const pulseInMeasure = pulseIndex % (beatsPerMeasure * subFactor)
      const beatInMeasure = Math.floor(pulseInMeasure / subFactor)
      const subInBeat = pulseInMeasure % subFactor
      const pulseTime = nextPulseTimeRef.current

      const isPrimaryAccent = currentMeterConfig.accentPattern.includes(beatInMeasure) && subInBeat === 0
      const isSecondaryAccent = timeSignature === '6/8' && beatInMeasure === 3 && subInBeat === 0

      let shouldPlayAudio = true
      const measureIndex = Math.floor(pulseIndex / (beatsPerMeasure * subFactor))

      if (practiceMode === 'backbeat') {
        shouldPlayAudio = (beatInMeasure === 1 || beatInMeasure === 3) && subInBeat === 0
      } else if (practiceMode === 'missing_bar') {
        if (measureIndex % 4 === 3) shouldPlayAudio = false
      } else if (subdivision === 'offbeat') {
        shouldPlayAudio = subInBeat !== 0
      }

      if (shouldPlayAudio) {
        synthesizeMetronomePulse(
          audioContextRef.current,
          masterGainRef.current,
          metronomeSound,
          isPrimaryAccent,
          isSecondaryAccent,
          volumeRef.current,
          pulseTime
        )
      }

      const expectedPerfMs = performanceStartTimeRef.current +
        (pulseTime - audioContextStartTimeRef.current) * 1000 +
        totalOutLatMs

      const isScorablePulse = subdivision === '1x' || subInBeat === 0

      if (isScorablePulse) {
        scheduledPulsesRef.current.push({
          pulseId: pulseIndex,
          beatNumber: beatInMeasure + 1,
          subdivisionIndex: subInBeat,
          expectedPerfMs,
          processed: false,
          isMutedByPracticeMode: !shouldPlayAudio,
        })
      }

      const visualDelayMs = Math.max(0, (pulseTime - audioContextRef.current.currentTime) * 1000)
      setTimeout(() => {
        if (generationIdRef.current === thisGenId) {
          setCurrentBeatIndex(beatInMeasure)
        }
      }, visualDelayMs)

      pulseCounterRef.current++
      nextPulseTimeRef.current += secondsPerSubdivision
    }

    sweepMissedPulses()
  }, [bpm, currentMeterConfig, subdivision, practiceMode, metronomeSound, timeSignature, sweepMissedPulses])

  const startMetronome = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = createBrowserAudioContext()
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    if (!masterGainRef.current) {
      masterGainRef.current = audioContextRef.current.createGain()
      masterGainRef.current.connect(audioContextRef.current.destination)
    }
    masterGainRef.current.gain.setValueAtTime(1, audioContextRef.current.currentTime)

    generationIdRef.current += 1
    const baseLat = audioContextRef.current.baseLatency || 0
    const outLat = (audioContextRef.current as any).outputLatency || 0
    setEstimatedHardwareLatencyMs(Math.round((baseLat + outLat) * 1000))

    audioContextStartTimeRef.current = audioContextRef.current.currentTime
    performanceStartTimeRef.current = performance.now()

    pulseCounterRef.current = 0
    nextPulseTimeRef.current = audioContextRef.current.currentTime
    scheduledPulsesRef.current = []

    setIsPlaying(true)
    setSession({
      startedAt: new Date(),
      endedAt: null,
      bpm,
      timeSignature,
      subdivision,
      practiceMode,
      beatTimings: [],
      isActive: true,
    })
    setRecentTimings([])

    schedulerIntervalRef.current = setInterval(() => {
      scheduleMetronome()
    }, 25)
    scheduleMetronome()
  }, [bpm, timeSignature, subdivision, practiceMode, scheduleMetronome])

  const stopMetronome = useCallback(() => {
    generationIdRef.current += 1

    if (schedulerIntervalRef.current) {
      clearInterval(schedulerIntervalRef.current)
      schedulerIntervalRef.current = null
    }

    if (masterGainRef.current && audioContextRef.current) {
      masterGainRef.current.gain.setValueAtTime(0, audioContextRef.current.currentTime)
    }

    sweepMissedPulses()

    setIsPlaying(false)
    setCurrentBeatIndex(0)
    setSession(prev => ({
      ...prev,
      endedAt: new Date(),
      isActive: false,
    }))
  }, [sweepMissedPulses])

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopMetronome()
    } else {
      startMetronome()
    }
  }, [isPlaying, startMetronome, stopMetronome])

  // Save session
  const saveSession = useCallback(async () => {
    if (!session.startedAt || session.beatTimings.length === 0) {
      setSaveMessage('No beats recorded')
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const stats = calculateStats(session.beatTimings)
      const durationSeconds = session.endedAt
        ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
        : Math.round((Date.now() - session.startedAt.getTime()) / 1000)

      const beatMetrics = session.beatTimings.map((bt) => ({
        beatNumber: bt.beatNumber,
        expectedTimeMs: Math.round(bt.expectedTimeMs),
        actualTimeMs: bt.actualTimeMs ? Math.round(bt.actualTimeMs) : null,
        timingOffsetMs: bt.offsetMs ? Math.round(bt.offsetMs * 10) / 10 : null,
        timingResult: bt.result,
      }))

      const response = await fetch('/api/pitch-training/rhythm-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt?.toISOString() || new Date().toISOString(),
          bpm: session.bpm,
          timeSignature: session.timeSignature,
          durationSeconds,
          totalBeats: stats.totalBeats,
          onBeatCount: stats.onBeatCount,
          earlyCount: stats.earlyCount,
          lateCount: stats.lateCount,
          missedCount: stats.missedCount,
          avgTimingOffsetMs: stats.avgOffsetMs,
          timingConsistency: stats.consistency,
          onBeatPercent: stats.onBeatPercent,
          bestStreak: stats.bestStreak,
          rhythmTendency: stats.rhythmTendency,
          avgEarlyMs: stats.avgEarlyMs,
          avgLateMs: stats.avgLateMs,
          beatMetrics,
        }),
      })

      const result = await response.json()
      if (result.saved) {
        setSaveMessage(`Session saved! Score: ${result.overallScore?.toFixed(1) || stats.overallScore.toFixed(1)}%`)
      } else {
        setSaveMessage(result.message || 'Session not saved')
      }
    } catch (error) {
      console.error('Save error:', error)
      setSaveMessage('Failed to save session')
    } finally {
      setIsSaving(false)
      setTimeout(() => setSaveMessage(null), 5000)
    }
  }, [session])

  useEffect(() => {
    if (!isOpen) {
      stopMetronome()
      stopMic()
    }
  }, [isOpen, stopMetronome, stopMic])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const stats = calculateStats(session.beatTimings)

  const renderBeatIndicators = () => (
    <div className="flex justify-center gap-3 mb-6">
      {Array.from({ length: currentMeterConfig.beats }).map((_, i) => {
        const isActive = isPlaying && currentBeatIndex === i
        const isAccent = currentMeterConfig.accentPattern.includes(i)

        return (
          <div
            key={i}
            className={`rounded-full transition-all duration-75 flex items-center justify-center font-bold text-xs ${
              isActive
                ? isAccent
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/60 scale-115'
                  : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-orange-500/40 scale-105'
                : isAccent
                  ? 'bg-slate-700/80 border-2 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800/80 border border-slate-700 text-slate-500'
            }`}
            style={{
              width: isAccent ? '48px' : '40px',
              height: isAccent ? '48px' : '40px',
            }}
          >
            {i + 1}
          </div>
        )
      })}
    </div>
  )

  const renderTimingHistory = () => (
    <div className="flex flex-wrap justify-center gap-1.5 mb-4 min-h-[32px]">
      {recentTimings.slice(-24).map((timing, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full transition-all flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${
            timing.result === 'on-beat'
              ? 'bg-emerald-500 ring-2 ring-emerald-500/30'
              : timing.result === 'early'
                ? 'bg-sky-500 ring-2 ring-sky-500/30'
                : timing.result === 'late'
                  ? 'bg-amber-500 ring-2 ring-amber-500/30'
                  : 'bg-slate-700'
          }`}
          title={`Beat ${timing.beatNumber}: ${timing.result} (${timing.offsetMs ? `${timing.offsetMs > 0 ? '+' : ''}${timing.offsetMs.toFixed(0)}ms` : 'missed'})`}
        >
          {timing.result === 'missed' ? '×' : ''}
        </div>
      ))}
    </div>
  )

  return (
    <>
      {variant === 'floating' ? (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-4 w-12 h-12 lg:bottom-24 lg:right-8 lg:w-14 lg:h-14 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-300 z-50"
          style={{ boxShadow: '0 8px 24px rgba(245, 158, 11, 0.4)' }}
          title="Rhythm Trainer"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-4 px-6 py-5 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-2xl transition-all duration-300 w-full group border border-white/10"
          style={{ boxShadow: '0 8px 32px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </div>
          <div className="text-left flex-1">
            <p className="font-semibold text-lg">Rhythm Trainer</p>
            <p className="text-sm text-white/70">Groove, subdivisions & pocket timing</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setIsOpen(false)
              setIsFullscreen(false)
            }}
          />

          <div
            className={`relative bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 shadow-2xl border border-slate-700/50 overflow-hidden transition-all duration-300 ${
              isFullscreen
                ? 'w-full h-full rounded-none lg:w-[95vw] lg:h-[95vh] lg:rounded-3xl'
                : 'w-full h-full rounded-none lg:w-[90vw] lg:max-w-3xl lg:h-[85vh] lg:max-h-[760px] lg:rounded-3xl'
            }`}
          >
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-amber-600/20 via-orange-600/20 to-red-600/20 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Rhythm & Groove Trainer</h2>
                  <p className="text-xs text-slate-400">Lock into the pocket with sample-accurate timing</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCalibration(!showCalibration)}
                  className={`p-2.5 rounded-xl transition-colors ${
                    showCalibration ? 'bg-amber-600/40 text-amber-300' : 'hover:bg-white/10 text-slate-400'
                  }`}
                  title="Latency Calibration"
                >
                  <Sliders className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2.5 rounded-xl transition-colors ${
                    showSettings ? 'bg-amber-600/40 text-amber-300' : 'hover:bg-white/10 text-slate-400'
                  }`}
                  title="Settings & Subdivisions"
                >
                  <Settings2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-5 h-5 text-slate-400" />
                  ) : (
                    <Maximize2 className="w-5 h-5 text-slate-400" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false)
                    setIsFullscreen(false)
                  }}
                  className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-6 h-[calc(100%-72px)] overflow-y-auto">
              {showCalibration && (
                <div className="bg-slate-800/80 rounded-2xl p-4 border border-amber-500/30 mb-6 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-amber-400" />
                      Hardware Latency Compensation
                    </h3>
                    <button onClick={() => setShowCalibration(false)} className="p-1 hover:bg-slate-700 rounded">
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                    Audio hardware and Bluetooth introduce delay. Adjust calibration to ensure your physical tap lands on zero.
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                    <span>Hardware Output Latency Estimate: <span className="font-mono text-amber-400">{estimatedHardwareLatencyMs} ms</span></span>
                    <span>Manual User Offset: <span className="font-mono text-amber-400">{userCalibrationMs > 0 ? `+${userCalibrationMs}` : userCalibrationMs} ms</span></span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={userCalibrationMs}
                    onChange={(e) => setUserCalibrationMs(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-500 mb-2"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>-100ms (Compensate Early)</span>
                    <button onClick={() => setUserCalibrationMs(0)} className="text-slate-400 hover:text-white underline">Reset to 0ms</button>
                    <span>+100ms (Compensate Late)</span>
                  </div>
                </div>
              )}

              {showSettings && (
                <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700 mb-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-amber-400" />
                      Groove & Subdivision Settings
                    </h3>
                    <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-700 rounded">
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-2 block font-medium">Meter & Compound Grouping</label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {METER_CONFIGS.map(ts => (
                        <button
                          key={ts.value}
                          onClick={() => setTimeSignature(ts.value)}
                          disabled={isPlaying}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                            timeSignature === ts.value
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md'
                              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                          }`}
                        >
                          {ts.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-2 block font-medium">Subdivision Grid</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {SUBDIVISION_CONFIGS.map(sub => (
                        <button
                          key={sub.value}
                          onClick={() => setSubdivision(sub.value)}
                          disabled={isPlaying}
                          className={`py-2 px-2.5 rounded-xl text-xs font-medium transition-all ${
                            subdivision === sub.value
                              ? 'bg-amber-600 text-white shadow-md'
                              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                          }`}
                        >
                          {sub.label} <span className="text-[10px] opacity-75">({sub.name.split(' ')[0]})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-2 block font-medium">Pocket Training Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setPracticeMode('normal')}
                        disabled={isPlaying}
                        className={`py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                          practiceMode === 'normal'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                        }`}
                      >
                        All Clicks
                      </button>
                      <button
                        onClick={() => setPracticeMode('backbeat')}
                        disabled={isPlaying}
                        className={`py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                          practiceMode === 'backbeat'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                        }`}
                      >
                        Backbeat (2 & 4)
                      </button>
                      <button
                        onClick={() => setPracticeMode('missing_bar')}
                        disabled={isPlaying}
                        className={`py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                          practiceMode === 'missing_bar'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                        }`}
                      >
                        Missing Bar (Dropout)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-700/60">
                    <div>
                      <label className="text-xs text-slate-400 mb-2 block font-medium">Metronome Sound</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SOUND_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setMetronomeSound(opt.value)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              metronomeSound === opt.value
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                          <Volume2 className="w-3.5 h-3.5" /> Volume ({volume}%)
                        </label>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={volume}
                        onChange={(e) => setVolume(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {isListening && (
                <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl p-3 mb-4 flex items-center gap-3 text-xs text-amber-200">
                  <Headphones className="w-5 h-5 text-amber-400 shrink-0" />
                  <p>
                    <span className="font-semibold">Headphones recommended:</span> Wearing headphones prevents the metronome click from feeding back into your microphone.
                  </p>
                </div>
              )}

              <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tempo</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                      {currentMeterConfig.label} · {subdivision}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white font-mono">{bpm}</span>
                    <span className="text-xs text-slate-400">BPM</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="40"
                  max="240"
                  value={bpm}
                  onChange={(e) => setBpm(parseInt(e.target.value))}
                  disabled={isPlaying}
                  className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
                />

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault()
                      registerTempoTap()
                    }}
                    disabled={isPlaying}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all select-none touch-none ${
                      isPlaying
                        ? 'bg-slate-700/40 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-amber-300 border border-slate-600'
                    }`}
                  >
                    {tapTempoCount === 0
                      ? 'Tap Tempo'
                      : tapTempoCount < 3
                        ? `Tap again (${tapTempoCount}/3)`
                        : `Tapping · ${bpm} BPM`}
                  </button>
                  {tapTempoCount > 0 && !isPlaying && (
                    <button
                      onClick={resetTapTempo}
                      className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {renderBeatIndicators()}
              {renderTimingHistory()}

              <div className="flex justify-center items-center gap-4 mb-6">
                <button
                  onClick={togglePlay}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl ${
                    isPlaying
                      ? 'bg-gradient-to-br from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 shadow-red-500/25 scale-105'
                      : 'bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/25'
                  }`}
                  title={isPlaying ? 'Stop' : 'Start Metronome'}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 text-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </button>

                <button
                  onClick={isListening ? stopMic : startMic}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                    isListening
                      ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-4 ring-emerald-500/20'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                  title={isListening ? 'Stop microphone' : 'Start microphone detection'}
                >
                  {isListening ? (
                    <div className="relative">
                      <Mic className="w-6 h-6 text-white" />
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-ping" />
                    </div>
                  ) : (
                    <MicOff className="w-6 h-6" />
                  )}
                </button>
              </div>

              <div className="mb-6">
                <button
                  onPointerDown={(e) => {
                    e.preventDefault()
                    handleTap(e)
                  }}
                  disabled={!isPlaying}
                  aria-label="Tap on the beat"
                  className={`w-full h-32 rounded-2xl border-2 select-none touch-none transition-all duration-100 flex flex-col items-center justify-center gap-1 shadow-inner ${
                    !isPlaying
                      ? 'border-slate-700/40 bg-slate-800/20 cursor-not-allowed opacity-60'
                      : tapFeedback?.result === 'on-beat'
                        ? 'border-emerald-400 bg-emerald-500/30 scale-[0.98]'
                        : tapFeedback?.result === 'early'
                          ? 'border-sky-400 bg-sky-500/30 scale-[0.98]'
                          : tapFeedback?.result === 'late'
                            ? 'border-amber-400 bg-amber-500/30 scale-[0.98]'
                            : tapFeedback?.result === 'no-match'
                              ? 'border-slate-600 bg-slate-700/30 scale-[0.98]'
                              : 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-600/10 hover:from-amber-500/20 hover:to-orange-600/15 active:scale-[0.98] cursor-pointer'
                  }`}
                >
                  <span className={`text-xl font-extrabold ${!isPlaying ? 'text-slate-500' : 'text-white'}`}>
                    {!isPlaying
                      ? 'Press Play to Begin'
                      : tapFeedback?.result === 'on-beat'
                        ? `Locked in Pocket! (${tapFeedback.offsetMs && tapFeedback.offsetMs > 0 ? `+${tapFeedback.offsetMs.toFixed(0)}` : tapFeedback.offsetMs?.toFixed(0)}ms)`
                        : tapFeedback?.result === 'early'
                          ? `Rushing (${tapFeedback.offsetMs?.toFixed(0)}ms early)`
                          : tapFeedback?.result === 'late'
                            ? `Dragging (+${tapFeedback.offsetMs?.toFixed(0)}ms late)`
                            : tapFeedback?.result === 'no-match'
                              ? 'Off Grid'
                              : 'TAP HERE OR PRESS SPACEBAR'}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {isPlaying ? 'Contact triggers instant measurement' : ''}
                  </span>
                </button>
              </div>

              {session.beatTimings.length > 0 && (
                <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60 shadow-xl mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                      Session Analytics
                    </h3>
                    <button
                      onClick={saveSession}
                      disabled={isSaving || session.beatTimings.length === 0}
                      className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                        isSaving || session.beatTimings.length === 0
                          ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20 hover:brightness-110'
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? 'Saving...' : 'Save Session'}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-center mb-3">
                    <div className="bg-slate-900/40 p-2.5 rounded-xl">
                      <p className="text-2xl font-extrabold text-white font-mono">{stats.overallScore.toFixed(0)}%</p>
                      <p className="text-[11px] text-slate-400 font-medium">Overall Score</p>
                    </div>
                    <div className="bg-slate-900/40 p-2.5 rounded-xl">
                      <p className="text-2xl font-extrabold text-emerald-400 font-mono">{stats.onGridPercent.toFixed(0)}%</p>
                      <p className="text-[11px] text-slate-400 font-medium">In-Pocket</p>
                    </div>
                    <div className="bg-slate-900/40 p-2.5 rounded-xl">
                      <p className="text-2xl font-extrabold text-amber-400 font-mono">{stats.consistency.toFixed(0)}%</p>
                      <p className="text-[11px] text-slate-400 font-medium">Consistency</p>
                    </div>
                    <div className="bg-slate-900/40 p-2.5 rounded-xl">
                      <p className="text-2xl font-extrabold text-white font-mono">{stats.maeMs.toFixed(0)}ms</p>
                      <p className="text-[11px] text-slate-400 font-medium">Avg Error (MAE)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-center pt-3 border-t border-slate-700/60 text-xs">
                    <div>
                      <p className="font-semibold text-white">{stats.completedHits}/{stats.totalBeats}</p>
                      <p className="text-slate-400 text-[10px]">Beats Hit</p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">{stats.bestStreak}</p>
                      <p className="text-slate-400 text-[10px]">Best Streak</p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">{stats.medianSignedOffsetMs > 0 ? `+${stats.medianSignedOffsetMs}` : stats.medianSignedOffsetMs}ms</p>
                      <p className="text-slate-400 text-[10px]">Median Bias</p>
                    </div>
                    <div>
                      <p className={`font-semibold ${
                        stats.rhythmTendency === 'early' ? 'text-sky-400' :
                        stats.rhythmTendency === 'late' ? 'text-amber-400' :
                        'text-emerald-400'
                      }`}>
                        {stats.rhythmTendency === 'early' ? '⏪ Rushing' :
                         stats.rhythmTendency === 'late' ? '⏩ Dragging' :
                         '✓ In Pocket'}
                      </p>
                      <p className="text-slate-400 text-[10px]">Groove Bias</p>
                    </div>
                  </div>

                  {saveMessage && (
                    <div className={`mt-3 text-center text-xs font-semibold py-1.5 rounded-lg ${
                      saveMessage.includes('saved') ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {saveMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

---

### 3.2 API Route: [`app/api/pitch-training/rhythm-session/route.ts`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/app/api/pitch-training/rhythm-session/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { analyzeRhythmSession, saveTrainingFeedback, fetchLessonContext } from '@/lib/training-ai'

interface RhythmSessionInput {
  startedAt: string
  endedAt: string
  bpm: number
  timeSignature: string
  durationSeconds: number
  totalBeats: number
  onBeatCount: number
  earlyCount: number
  lateCount: number
  missedCount: number
  avgTimingOffsetMs: number
  timingConsistency: number
  onBeatPercent: number
  bestStreak: number
  rhythmTendency?: 'early' | 'late' | 'on-time'
  avgEarlyMs?: number
  avgLateMs?: number
  beatMetrics?: {
    beatNumber: number
    expectedTimeMs: number
    actualTimeMs: number | null
    timingOffsetMs: number | null
    timingResult: string
  }[]
}

const TIMING_WINDOW_MS = 200

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: RhythmSessionInput = await request.json()
    const {
      startedAt,
      endedAt,
      bpm,
      timeSignature,
      durationSeconds,
      totalBeats,
      onBeatCount,
      earlyCount,
      lateCount,
      missedCount,
      avgTimingOffsetMs,
      timingConsistency,
      onBeatPercent,
      bestStreak,
      rhythmTendency,
      avgEarlyMs,
      avgLateMs,
      beatMetrics,
    } = body

    if (totalBeats === 0) {
      return NextResponse.json({ error: 'No beats recorded' }, { status: 400 })
    }

    // Mathematically sound scoring for singers:
    // 1. Hit Rate: percentage of presented beats that were actually hit
    const hitCount = onBeatCount + earlyCount + lateCount
    let overallScore = 0

    if (hitCount > 0 && totalBeats > 0) {
      const hitRate = hitCount / totalBeats
      const onGridScore = (onBeatCount / hitCount) * 100
      const offsetScore = Math.max(0, 100 - (Math.abs(avgTimingOffsetMs) / TIMING_WINDOW_MS * 100))
      const consistencyScore = timingConsistency || 0

      const timingQuality = (onGridScore * 0.40) + (offsetScore * 0.35) + (consistencyScore * 0.25)
      overallScore = Math.max(0, Math.min(100, hitRate * timingQuality))
    }

    const startTime = new Date(startedAt)
    const sessionDate = startTime.toISOString().split('T')[0]

    // Insert session
    const { data: session, error: sessionError } = await supabase
      .from('rhythm_training_sessions')
      .insert({
        user_id: user.id,
        session_date: sessionDate,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        bpm,
        time_signature: timeSignature,
        total_beats: totalBeats,
        on_beat_count: onBeatCount,
        early_count: earlyCount,
        late_count: lateCount,
        missed_count: missedCount,
        avg_timing_offset_ms: avgTimingOffsetMs,
        timing_consistency: timingConsistency,
        on_beat_percent: onBeatPercent,
        best_streak: bestStreak,
        overall_score: overallScore,
        rhythm_tendency: rhythmTendency || 'on-time',
        avg_early_ms: avgEarlyMs || 0,
        avg_late_ms: avgLateMs || 0,
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Rhythm session insert error:', sessionError)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    // Insert per-beat metrics
    if (beatMetrics && beatMetrics.length > 0) {
      const beatMetricsToInsert = beatMetrics.map(b => ({
        session_id: session.id,
        user_id: user.id,
        beat_number: b.beatNumber,
        expected_time_ms: b.expectedTimeMs,
        actual_time_ms: b.actualTimeMs,
        timing_offset_ms: b.timingOffsetMs,
        timing_result: b.timingResult,
      }))

      const { error: metricsError } = await supabase
        .from('rhythm_training_beat_metrics')
        .insert(beatMetricsToInsert)

      if (metricsError) {
        console.error('Beat metrics insert error:', metricsError)
      }
    }

    // Asynchronous AI coaching
    void (async () => {
      try {
        const lessonNotes = await fetchLessonContext(supabase, user.id)

        const { data: recent } = await supabase
          .from('rhythm_training_sessions')
          .select('overall_score')
          .eq('user_id', user.id)
          .neq('id', session.id)
          .order('created_at', { ascending: false })
          .limit(5)

        const analysis = await analyzeRhythmSession(
          {
            bpm, timeSignature, durationSeconds, totalBeats, onBeatCount,
            earlyCount, lateCount, missedCount, avgTimingOffsetMs,
            timingConsistency, onBeatPercent, bestStreak, overallScore,
            rhythmTendency, avgEarlyMs, avgLateMs,
          },
          {
            lessonNotes,
            previousScores: (recent || []).map(r => Number(r.overall_score)).filter(Number.isFinite),
          }
        )

        await saveTrainingFeedback(
          createSupabaseAdmin(), user.id, 'rhythm_session', session.id, analysis,
          { bpm, onBeatPercent, timingConsistency, overallScore, rhythmTendency }
        )
      } catch (err) {
        console.error('[RhythmSession] AI feedback generation failed:', err)
      }
    })()

    return NextResponse.json({
      message: 'Session saved successfully',
      sessionId: session.id,
      overallScore,
      saved: true,
    })

  } catch (error) {
    console.error('Rhythm training session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    const includeMetrics = searchParams.get('includeMetrics') === 'true'

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: sessions, error } = await supabase
      .from('rhythm_training_sessions')
      .select(includeMetrics
        ? '*, rhythm_training_beat_metrics(*)'
        : '*'
      )
      .eq('user_id', user.id)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })

    if (error) {
      console.error('Rhythm sessions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions })

  } catch (error) {
    console.error('Rhythm training sessions GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 3.3 AI Coaching: [`lib/training-ai.ts`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/lib/training-ai.ts)

```typescript
export interface RhythmSessionMetrics {
  bpm: number
  timeSignature: string
  durationSeconds: number
  totalBeats: number
  onBeatCount: number
  earlyCount: number
  lateCount: number
  missedCount: number
  avgTimingOffsetMs: number
  timingConsistency: number
  onBeatPercent: number
  bestStreak: number
  overallScore: number
  rhythmTendency?: string
  avgEarlyMs?: number
  avgLateMs?: number
}

export async function analyzeRhythmSession(
  metrics: RhythmSessionMetrics,
  context?: { lessonNotes?: string[]; previousScores?: number[] }
): Promise<PitchAnalysisResult> {
  const systemPrompt = `You are an expert vocal coach specialising in rhythm, groove, subdivisions, and timing for singers.

You are analysing a latency-compensated rhythm session. Interpret the deterministic acoustic metrics pedagogically:
- Overall Score: Multiplicative score combining hit rate, in-pocket accuracy (MAE), and consistency.
- On-beat percentage: Represents accuracy within the tempo-scaled pocket window. 85%+ is solid, 95%+ is exceptional groove.
- Timing consistency: Measures pulse steadiness. A steady pulse is foundational for ensemble work and live performance.
- Rhythm tendency: Indicates systematic rushing ("early") or dragging ("late"). Provide actionable groove exercises (e.g. backbeat clicks, subdivision vocalizing, breath preparation on upbeat).
- Missed beats: Reflect lost pulse or coordination.

Be encouraging, specific, and provide practical metronome-based rhythm exercises tailored to the tempo and meter.`

  const beatLengthMs = 60000 / metrics.bpm
  const offsetAsPercentOfBeat = (Math.abs(metrics.avgTimingOffsetMs) / beatLengthMs) * 100

  const userPrompt = `Analyse this rhythm and groove training session:

TEMPO & METER: ${metrics.bpm} BPM (${metrics.timeSignature}), one beat = ${beatLengthMs.toFixed(0)}ms
DURATION: ${Math.round(metrics.durationSeconds / 60)} minutes

PERFORMANCE METRICS:
- Overall Score: ${metrics.overallScore.toFixed(1)}%
- Total Beats Presented: ${metrics.totalBeats}
- Beats Successfully Hit: ${metrics.onBeatCount + metrics.earlyCount + metrics.lateCount} (${((metrics.onBeatCount + metrics.earlyCount + metrics.lateCount) / Math.max(1, metrics.totalBeats) * 100).toFixed(0)}% hit rate)
- In-Pocket (On Beat): ${metrics.onBeatPercent.toFixed(1)}% (${metrics.onBeatCount} hits)
- Early (Rushing): ${metrics.earlyCount} | Late (Dragging): ${metrics.lateCount} | Missed: ${metrics.missedCount}
- Longest Streak: ${metrics.bestStreak} consecutive locked beats

TIMING PRECISION:
- Average Offset: ${metrics.avgTimingOffsetMs > 0 ? '+' : ''}${metrics.avgTimingOffsetMs.toFixed(0)}ms (${offsetAsPercentOfBeat.toFixed(1)}% of a beat)
- Timing Consistency: ${metrics.timingConsistency.toFixed(1)}%
- Groove Bias / Tendency: ${metrics.rhythmTendency ?? 'on-time'}
${metrics.avgEarlyMs ? `- When early: average ${metrics.avgEarlyMs.toFixed(0)}ms early` : ''}
${metrics.avgLateMs ? `- When late: average ${metrics.avgLateMs.toFixed(0)}ms late` : ''}

${context?.previousScores?.length ? `RECENT SCORES: ${context.previousScores.map(s => s.toFixed(0) + '%').join(', ')}` : ''}
${context?.lessonNotes?.length ? `FROM RECENT LESSONS: ${context.lessonNotes.slice(0, 3).join('; ')}` : ''}
${JSON_SHAPE_INSTRUCTION}`

  return complete(systemPrompt, userPrompt)
}
```

---

### 3.4 Database Schema & Automated Triggers: [`supabase/migrations/00015_rhythm_singer_metrics.sql`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/supabase/migrations/00015_rhythm_singer_metrics.sql)

```sql
ALTER TABLE rhythm_training_sessions
ADD COLUMN IF NOT EXISTS rhythm_tendency VARCHAR(20) DEFAULT 'on-time',
ADD COLUMN IF NOT EXISTS avg_early_ms DECIMAL(8,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_late_ms DECIMAL(8,2) DEFAULT 0;

ALTER TABLE rhythm_training_weekly_progress
ADD COLUMN IF NOT EXISTS predominant_tendency VARCHAR(20),
ADD COLUMN IF NOT EXISTS avg_early_ms DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS avg_late_ms DECIMAL(8,2);

CREATE OR REPLACE FUNCTION calculate_rhythm_weekly_progress(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
DECLARE
    v_current_week RECORD;
    v_previous_week RECORD;
    v_predominant_tendency VARCHAR(20);
BEGIN
    SELECT
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(avg_timing_offset_ms * total_beats) / SUM(total_beats)
            ELSE AVG(avg_timing_offset_ms) END as avg_offset,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(timing_consistency * total_beats) / SUM(total_beats)
            ELSE AVG(timing_consistency) END as avg_consistency,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(on_beat_percent * total_beats) / SUM(total_beats)
            ELSE AVG(on_beat_percent) END as avg_on_beat,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(overall_score * total_beats) / SUM(total_beats)
            ELSE AVG(overall_score) END as avg_score,
        COUNT(*) as total_sessions,
        SUM(total_beats) as total_beats,
        SUM(duration_seconds) as total_time,
        MIN(bpm) as min_bpm,
        MAX(bpm) as max_bpm,
        AVG(bpm) as avg_bpm,
        AVG(avg_early_ms) as avg_early,
        AVG(avg_late_ms) as avg_late
    INTO v_current_week
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    SELECT
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(ABS(avg_timing_offset_ms) * total_beats) / SUM(total_beats)
            ELSE AVG(ABS(avg_timing_offset_ms)) END as avg_abs_offset,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(timing_consistency * total_beats) / SUM(total_beats)
            ELSE AVG(timing_consistency) END as avg_consistency,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(on_beat_percent * total_beats) / SUM(total_beats)
            ELSE AVG(on_beat_percent) END as avg_on_beat
    INTO v_previous_week
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start - INTERVAL '7 days'
    AND session_date < p_week_start;

    SELECT
        CASE
            WHEN SUM(CASE WHEN rhythm_tendency = 'early' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'late' THEN 1 ELSE 0 END) AND
                 SUM(CASE WHEN rhythm_tendency = 'early' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'on-time' THEN 1 ELSE 0 END) THEN 'early'
            WHEN SUM(CASE WHEN rhythm_tendency = 'late' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'early' THEN 1 ELSE 0 END) AND
                 SUM(CASE WHEN rhythm_tendency = 'late' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'on-time' THEN 1 ELSE 0 END) THEN 'late'
            ELSE 'on-time'
        END
    INTO v_predominant_tendency
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    INSERT INTO rhythm_training_weekly_progress (
        user_id, week_start_date,
        avg_timing_offset_ms, avg_timing_consistency, avg_on_beat_percent,
        avg_overall_score,
        total_sessions, total_beats_attempted, total_practice_time_seconds,
        min_bpm_practiced, max_bpm_practiced, avg_bpm_practiced,
        timing_offset_change, consistency_change, on_beat_percent_change,
        predominant_tendency, avg_early_ms, avg_late_ms,
        updated_at
    ) VALUES (
        p_user_id, p_week_start,
        v_current_week.avg_offset, v_current_week.avg_consistency, v_current_week.avg_on_beat,
        v_current_week.avg_score,
        v_current_week.total_sessions, v_current_week.total_beats,
        v_current_week.total_time,
        v_current_week.min_bpm, v_current_week.max_bpm, v_current_week.avg_bpm,
        CASE WHEN v_previous_week.avg_abs_offset IS NOT NULL AND v_previous_week.avg_abs_offset > 0
            THEN ((ABS(v_current_week.avg_offset) - v_previous_week.avg_abs_offset) / v_previous_week.avg_abs_offset * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_consistency IS NOT NULL AND v_previous_week.avg_consistency > 0
            THEN ((v_current_week.avg_consistency - v_previous_week.avg_consistency) / v_previous_week.avg_consistency * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_on_beat IS NOT NULL AND v_previous_week.avg_on_beat > 0
            THEN ((v_current_week.avg_on_beat - v_previous_week.avg_on_beat) / v_previous_week.avg_on_beat * 100)
            ELSE NULL END,
        v_predominant_tendency,
        v_current_week.avg_early,
        v_current_week.avg_late,
        NOW()
    )
    ON CONFLICT (user_id, week_start_date) DO UPDATE SET
        avg_timing_offset_ms = EXCLUDED.avg_timing_offset_ms,
        avg_timing_consistency = EXCLUDED.avg_timing_consistency,
        avg_on_beat_percent = EXCLUDED.avg_on_beat_percent,
        avg_overall_score = EXCLUDED.avg_overall_score,
        total_sessions = EXCLUDED.total_sessions,
        total_beats_attempted = EXCLUDED.total_beats_attempted,
        total_practice_time_seconds = EXCLUDED.total_practice_time_seconds,
        min_bpm_practiced = EXCLUDED.min_bpm_practiced,
        max_bpm_practiced = EXCLUDED.max_bpm_practiced,
        avg_bpm_practiced = EXCLUDED.avg_bpm_practiced,
        timing_offset_change = EXCLUDED.timing_offset_change,
        consistency_change = EXCLUDED.consistency_change,
        on_beat_percent_change = EXCLUDED.on_beat_percent_change,
        predominant_tendency = EXCLUDED.predominant_tendency,
        avg_early_ms = EXCLUDED.avg_early_ms,
        avg_late_ms = EXCLUDED.avg_late_ms,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_calculate_rhythm_weekly_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_week_start DATE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_week_start := date_trunc('week', OLD.session_date)::DATE;
        PERFORM calculate_rhythm_weekly_progress(OLD.user_id, v_week_start);
        RETURN OLD;
    ELSE
        v_week_start := date_trunc('week', NEW.session_date)::DATE;
        PERFORM calculate_rhythm_weekly_progress(NEW.user_id, v_week_start);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_rhythm_sessions_weekly_progress ON rhythm_training_sessions;
CREATE TRIGGER trg_rhythm_sessions_weekly_progress
AFTER INSERT OR UPDATE OR DELETE ON rhythm_training_sessions
FOR EACH ROW EXECUTE FUNCTION trigger_calculate_rhythm_weekly_progress();
```
