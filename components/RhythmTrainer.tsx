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
  const generationIdRef = useRef(0) // Generation counter to invalidate orphaned scheduled events

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

  // ==========================================================================
  // CORE HIT REGISTER & SEQUENTIAL ALIGNMENT
  // ==========================================================================

  const registerHit = useCallback((hitPerfTimestamp: number, inputType: 'tap' | 'mic') => {
    if (!isPlaying || scheduledPulsesRef.current.length === 0) return null

    // Latency compensated timestamp
    const correctedHitTime = hitPerfTimestamp - userCalibrationMs
    const beatDurationMs = 60000 / bpm
    const halfWindowMs = Math.min(220, beatDurationMs * 0.48)
    const allowedOnBeatMs = Math.max(15, Math.min(45, beatDurationMs * 0.08))

    // Search for closest matching unprocessed pulse
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

  // Tap handler (onPointerDown)
  const handleTap = useCallback((e?: React.PointerEvent | MouseEvent | KeyboardEvent) => {
    // High-resolution event timestamp or performance.now()
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

  // Spacebar trigger
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

  // ==========================================================================
  // MICROPHONE ONSET DETECTOR
  // ==========================================================================

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

  // ==========================================================================
  // TAP TEMPO CALCULATOR
  // ==========================================================================

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

  // ==========================================================================
  // SCHEDULER & MISSED BEAT SWEEPER
  // ==========================================================================

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

    // Latency estimate from Web Audio context
    const baseLat = audioContextRef.current.baseLatency || 0
    const outLat = (audioContextRef.current as any).outputLatency || 0
    const totalOutLatMs = (baseLat + outLat) * 1000

    while (nextPulseTimeRef.current < currentCtxTime + SCHEDULE_AHEAD_SECONDS) {
      const pulseIndex = pulseCounterRef.current
      const pulseInMeasure = pulseIndex % (beatsPerMeasure * subFactor)
      const beatInMeasure = Math.floor(pulseInMeasure / subFactor)
      const subInBeat = pulseInMeasure % subFactor
      const pulseTime = nextPulseTimeRef.current

      // Accent logic based on meter configuration
      const isPrimaryAccent = currentMeterConfig.accentPattern.includes(beatInMeasure) && subInBeat === 0
      const isSecondaryAccent = timeSignature === '6/8' && beatInMeasure === 3 && subInBeat === 0

      // Practice mode mutes (e.g. Backbeat only plays beats 2 & 4; missing bar mutes 4th measure)
      let shouldPlayAudio = true
      const measureIndex = Math.floor(pulseIndex / (beatsPerMeasure * subFactor))

      if (practiceMode === 'backbeat') {
        shouldPlayAudio = (beatInMeasure === 1 || beatInMeasure === 3) && subInBeat === 0
      } else if (practiceMode === 'missing_bar') {
        if (measureIndex % 4 === 3) shouldPlayAudio = false // 4th bar drops out
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

      // Compute precise expected performance timestamp
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

      // Visual ball animation trigger
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

  // ==========================================================================
  // METRONOME TRANSPORT CONTROLS
  // ==========================================================================

  const startMetronome = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = createBrowserAudioContext()
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    // Set up master output gain node
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

    // Instantly mute future scheduled Web Audio events
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

  // Cleanup on unmount or close
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

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

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
            {/* Header */}
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

            {/* Main Scrollable Content */}
            <div className="p-6 h-[calc(100%-72px)] overflow-y-auto">
              {/* Latency Calibration Panel */}
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

              {/* Settings Panel */}
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

                  {/* Meter / Time Signature */}
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

                  {/* Subdivision */}
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

                  {/* Practice Mode */}
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

                  {/* Sound Choice & Volume */}
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

              {/* Headphone Advisory when Mic is on */}
              {isListening && (
                <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl p-3 mb-4 flex items-center gap-3 text-xs text-amber-200">
                  <Headphones className="w-5 h-5 text-amber-400 shrink-0" />
                  <p>
                    <span className="font-semibold">Headphones recommended:</span> Wearing headphones prevents the metronome click from feeding back into your microphone.
                  </p>
                </div>
              )}

              {/* BPM & Tempo Controls */}
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

              {/* Beat Indicators */}
              {renderBeatIndicators()}

              {/* Recent Timing Dots */}
              {renderTimingHistory()}

              {/* Transport Controls (Play & Mic) */}
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

              {/* Large Responsive Tap Pad */}
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

              {/* Session Statistics Panel */}
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
