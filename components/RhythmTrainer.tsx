'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Mic, MicOff, Save, TrendingUp, Settings2, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel, Stat } from '@/components/ui/panel'
import { Segmented } from '@/components/ui/segmented'
import { ToolDialog } from '@/components/ui/tool-dialog'
import { SpotlightTour, SpotlightTriggerButton, SpotlightStep } from '@/components/spotlight-tour'

const rhythmTourSteps: SpotlightStep[] = [
  {
    target: '[data-tour="rhythm-bpm-control"]',
    title: '1. Pick Your Speed',
    content: 'Move the slider to set how fast the beat goes, or tap the "Tap Tempo" button a few times and the app matches your speed. Starting slow makes it easier.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="rhythm-play-btn"]',
    title: '2. Press Play',
    content: 'Tap the round Play button to start the beat. Listen for a moment first so you can feel the rhythm.',
    placement: 'top',
  },
  {
    target: '[data-tour="rhythm-tap-pad"]',
    title: '3. Tap With the Beat',
    content: 'Once the beat is playing, tap this big pad (or press the spacebar) every time you hear a beat. It answers instantly: on beat, a little early, a little late, or off the beat.',
    placement: 'top',
  },
]

// ============================================================================
// TYPES
// ============================================================================

type MetronomeSound = 'click' | 'woodblock' | 'hihat' | 'cowbell' | 'beep'
type TimeSignature = '4/4' | '3/4' | '6/8' | '2/4'
type TimingResult = 'on-beat' | 'early' | 'late' | 'missed'

interface BeatTiming {
  beatNumber: number
  expectedTime: number
  actualTime: number | null
  offsetMs: number | null
  result: TimingResult
}

/** A scheduled metronome beat still waiting for a tap (or a missed verdict). */
interface PendingBeat {
  beatNumber: number // Monotonic, 1-based across the whole session
  timeMs: number // Expected time on the Date.now() axis
}

interface SessionMetrics {
  startedAt: Date | null
  endedAt: Date | null
  bpm: number
  timeSignature: TimeSignature
  beatTimings: BeatTiming[]
  isActive: boolean
}

interface SessionStats {
  totalBeats: number
  onBeatCount: number
  earlyCount: number
  lateCount: number
  missedCount: number
  avgOffsetMs: number
  consistency: number
  onBeatPercent: number
  bestStreak: number
  currentStreak: number
  // New singer-focused metrics
  rhythmTendency: 'early' | 'late' | 'on-time' // Overall tendency
  avgEarlyMs: number // Average early offset (negative values)
  avgLateMs: number // Average late offset (positive values)
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIMING_THRESHOLDS = {
  onBeat: 30,    // Within ±30ms = on beat
  window: 200,   // Detection window around beat (±200ms)
}

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

const SOUND_OPTIONS: { value: MetronomeSound; label: string }[] = [
  { value: 'click', label: 'Click' },
  { value: 'woodblock', label: 'Wood Block' },
  { value: 'hihat', label: 'Hi-Hat' },
  { value: 'cowbell', label: 'Cowbell' },
  { value: 'beep', label: 'Beep' },
]

const TIME_SIGNATURES: { value: TimeSignature; label: string; beats: number }[] = [
  { value: '4/4', label: '4/4', beats: 4 },
  { value: '3/4', label: '3/4', beats: 3 },
  { value: '6/8', label: '6/8', beats: 6 },
  { value: '2/4', label: '2/4', beats: 2 },
]

// ============================================================================
// METRONOME SOUND GENERATOR
// ============================================================================

function createMetronomeSound(
  audioContext: AudioContext,
  soundType: MetronomeSound,
  isAccent: boolean = false,
  volumePercent: number = 70
): void {
  const now = audioContext.currentTime
  // Apply user volume (0-100) to base volume (accent: 0.8, normal: 0.5)
  const baseVolume = isAccent ? 0.8 : 0.5
  const volume = baseVolume * (volumePercent / 100)

  switch (soundType) {
    case 'click': {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.frequency.value = isAccent ? 1200 : 800
      osc.type = 'square'
      gain.gain.setValueAtTime(volume, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
      osc.start(now)
      osc.stop(now + 0.03)
      break
    }
    case 'woodblock': {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const filter = audioContext.createBiquadFilter()
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(audioContext.destination)
      osc.frequency.value = isAccent ? 800 : 600
      osc.type = 'triangle'
      filter.type = 'bandpass'
      filter.frequency.value = isAccent ? 2000 : 1500
      filter.Q.value = 5
      gain.gain.setValueAtTime(volume, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
      osc.start(now)
      osc.stop(now + 0.08)
      break
    }
    case 'hihat': {
      const bufferSize = audioContext.sampleRate * 0.05
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
      filter.frequency.value = isAccent ? 7000 : 8000
      source.connect(filter)
      filter.connect(gain)
      gain.connect(audioContext.destination)
      gain.gain.value = volume * 0.6
      source.start(now)
      break
    }
    case 'cowbell': {
      const osc1 = audioContext.createOscillator()
      const osc2 = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(audioContext.destination)
      osc1.frequency.value = isAccent ? 560 : 540
      osc2.frequency.value = isAccent ? 845 : 815
      osc1.type = 'square'
      osc2.type = 'square'
      gain.gain.setValueAtTime(volume * 0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.15)
      osc2.stop(now + 0.15)
      break
    }
    case 'beep': {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.frequency.value = isAccent ? 880 : 660
      osc.type = 'sine'
      gain.gain.setValueAtTime(volume * 0.5, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
      osc.start(now)
      osc.stop(now + 0.1)
      break
    }
  }
}

// ============================================================================
// ONSET DETECTION HOOK
// ============================================================================

interface UseOnsetDetectionOptions {
  threshold: number
  onOnset?: (time: number) => void
}

function useOnsetDetection({ threshold, onOnset }: UseOnsetDetectionOptions) {
  const [isListening, setIsListening] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const previousRmsRef = useRef(0)
  const onOnsetRef = useRef(onOnset)
  const thresholdRef = useRef(threshold)
  const lastOnsetTimeRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const processAudioRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onOnsetRef.current = onOnset
  }, [onOnset])

  useEffect(() => {
    thresholdRef.current = threshold
  }, [threshold])

  const processAudio = useCallback(() => {
    if (!analyserRef.current) return

    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Float32Array(bufferLength)
    analyserRef.current.getFloatTimeDomainData(dataArray)

    // Calculate RMS
    let sum = 0
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    const rms = Math.sqrt(sum / bufferLength)

    // Detect onset (sudden increase in amplitude)
    const now = Date.now()
    const onsetThreshold = 0.01 + (1 - thresholdRef.current / 100) * 0.1
    const minTimeBetweenOnsets = 100 // Minimum 100ms between onsets

    if (
      rms > onsetThreshold &&
      rms > previousRmsRef.current * 1.5 &&
      now - lastOnsetTimeRef.current > minTimeBetweenOnsets
    ) {
      lastOnsetTimeRef.current = now
      if (onOnsetRef.current) {
        onOnsetRef.current(now)
      }
    }

    previousRmsRef.current = rms
    if (processAudioRef.current) {
      animationFrameRef.current = requestAnimationFrame(processAudioRef.current)
    }
  }, [])

  // Keep processAudioRef in sync with processAudio
  useEffect(() => {
    processAudioRef.current = processAudio
  }, [processAudio])

  const startListening = useCallback(async () => {
    try {
      audioContextRef.current = createBrowserAudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      setIsListening(true)
      animationFrameRef.current = requestAnimationFrame(processAudio)
    } catch (error) {
      console.error('Microphone error:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }, [processAudio])

  const stopListening = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    setIsListening(false)
  }, [])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  return { isListening, startListening, stopListening }
}

// ============================================================================
// STATS CALCULATION
// ============================================================================

function calculateStats(timings: BeatTiming[]): SessionStats {
  const completedTimings = timings.filter(t => t.result !== 'missed' && t.offsetMs !== null)
  const onBeatCount = timings.filter(t => t.result === 'on-beat').length
  const earlyCount = timings.filter(t => t.result === 'early').length
  const lateCount = timings.filter(t => t.result === 'late').length
  const missedCount = timings.filter(t => t.result === 'missed').length

  const avgOffsetMs = completedTimings.length > 0
    ? completedTimings.reduce((sum, t) => sum + (t.offsetMs || 0), 0) / completedTimings.length
    : 0

  // Calculate consistency (inverse of standard deviation)
  // For singers: scale appropriately - 0ms stdDev = 100%, 150ms stdDev = 0%
  // This is more forgiving than the original 100ms scale
  // No completed taps at all (every beat missed) is no evidence of steadiness,
  // so it earns 0 rather than the benefit-of-the-doubt 100.
  let consistency = completedTimings.length > 0 ? 100 : 0
  if (completedTimings.length > 1) {
    const offsets = completedTimings.map(t => t.offsetMs || 0)
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length
    const variance = offsets.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / offsets.length
    const stdDev = Math.sqrt(variance)
    // 0ms stdDev = 100% consistency, 150ms stdDev = 0% consistency
    // This gives more credit for "pretty good" timing common in singers
    consistency = Math.max(0, 100 - (stdDev / 1.5))
  }

  // Calculate streaks
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

  const totalBeats = timings.length
  const onBeatPercent = totalBeats > 0 ? (onBeatCount / totalBeats) * 100 : 0

  // Calculate rhythm tendency (early/late bias) - important for singers
  const earlyTimings = completedTimings.filter(t => t.result === 'early')
  const lateTimings = completedTimings.filter(t => t.result === 'late')

  const avgEarlyMs = earlyTimings.length > 0
    ? earlyTimings.reduce((sum, t) => sum + (t.offsetMs || 0), 0) / earlyTimings.length
    : 0

  const avgLateMs = lateTimings.length > 0
    ? lateTimings.reduce((sum, t) => sum + (t.offsetMs || 0), 0) / lateTimings.length
    : 0

  // Determine overall tendency based on count and average offset
  let rhythmTendency: 'early' | 'late' | 'on-time' = 'on-time'
  if (completedTimings.length > 0) {
    // If more than 40% of non-on-beat hits are one direction, that's the tendency
    const nonOnBeat = earlyCount + lateCount
    if (nonOnBeat > 0) {
      const earlyRatio = earlyCount / nonOnBeat
      if (earlyRatio > 0.6) {
        rhythmTendency = 'early'
      } else if (earlyRatio < 0.4) {
        rhythmTendency = 'late'
      }
    }
  }

  return {
    totalBeats,
    onBeatCount,
    earlyCount,
    lateCount,
    missedCount,
    avgOffsetMs,
    consistency,
    onBeatPercent,
    bestStreak,
    currentStreak,
    rhythmTendency,
    avgEarlyMs,
    avgLateMs,
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

  // Metronome settings
  const [bpm, setBpm] = useState(90)
  const [timeSignature, setTimeSignature] = useState<TimeSignature>('4/4')
  const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>('click')
  const [volume, setVolume] = useState(70)
  const [isPlaying, setIsPlaying] = useState(false)

  // Beat tracking
  const [currentBeat, setCurrentBeat] = useState(0)
  const [recentTimings, setRecentTimings] = useState<BeatTiming[]>([])

  // Onset detection
  const [sensitivity, setSensitivity] = useState(60)

  // Session tracking
  const [session, setSession] = useState<SessionMetrics>({
    startedAt: null,
    endedAt: null,
    bpm: 90,
    timeSignature: '4/4',
    beatTimings: [],
    isActive: false,
  })

  // Saving
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const nextBeatTimeRef = useRef(0)
  const schedulerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const beatCounterRef = useRef(0)
  const sessionRef = useRef(session)
  // Scheduled beats awaiting a tap. Entries leave when matched by a tap or
  // swept as missed once their timing window has expired, so the array stays
  // small without the old 32-slot cap (whose shifting indices produced
  // duplicate beat numbers in long sessions).
  const pendingBeatsRef = useRef<PendingBeat[]>([])
  const lastMatchedBeatNumberRef = useRef(0)
  // Time synchronization refs - store reference points for both time bases
  const audioContextStartTimeRef = useRef(0) // audioContext.currentTime at start
  const dateNowStartTimeRef = useRef(0) // Date.now() at start
  const volumeRef = useRef(volume) // Volume ref for use in callbacks

  // Keep volume ref in sync
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Keep session ref in sync
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const beatsPerMeasure = TIME_SIGNATURES.find(t => t.value === timeSignature)?.beats || 4

  // Handle onset detection
  /**
   * Register a hit against the nearest expected beat.
   *
   * Shared by both input methods: microphone onsets and the tap pad. Returns
   * the timing result so the tap pad can flash feedback, or null when the hit
   * landed outside the matching window (or the metronome is not running).
   */
  const handleOnset = useCallback((onsetTime: number): TimingResult | null => {
    if (!isPlaying || pendingBeatsRef.current.length === 0) return null

    // Find the closest expected beat
    let closestBeatIndex = -1
    let closestOffset = Infinity

    pendingBeatsRef.current.forEach((beat, index) => {
      if (beat.beatNumber <= lastMatchedBeatNumberRef.current) return

      const offset = onsetTime - beat.timeMs
      if (Math.abs(offset) < TIMING_THRESHOLDS.window && Math.abs(offset) < Math.abs(closestOffset)) {
        closestOffset = offset
        closestBeatIndex = index
      }
    })

    if (closestBeatIndex === -1) return null

    const matchedBeat = pendingBeatsRef.current[closestBeatIndex]
    lastMatchedBeatNumberRef.current = matchedBeat.beatNumber
    // Matched beats leave the pending list so the missed-beat sweep cannot
    // also count them. Any skipped-over earlier beats stay pending and will be
    // swept as missed once their window expires.
    pendingBeatsRef.current.splice(closestBeatIndex, 1)

    const result: TimingResult = Math.abs(closestOffset) <= TIMING_THRESHOLDS.onBeat
      ? 'on-beat'
      : closestOffset < 0
        ? 'early'
        : 'late'

    const newTiming: BeatTiming = {
      beatNumber: matchedBeat.beatNumber,
      expectedTime: matchedBeat.timeMs,
      actualTime: onsetTime,
      offsetMs: closestOffset,
      result,
    }

    setRecentTimings(prev => [...prev.slice(-19), newTiming])
    setSession(prev => ({
      ...prev,
      beatTimings: [...prev.beatTimings, newTiming],
    }))

    return result
  }, [isPlaying])

  const { isListening, startListening, stopListening } = useOnsetDetection({
    threshold: sensitivity,
    onOnset: handleOnset,
  })

  // ==========================================================================
  // TAP INPUT
  // ==========================================================================
  // Until now the only way to register a beat was the microphone, so the tool
  // was unusable without mic permission, in a quiet room, or anywhere the
  // metronome bleeding into the mic would false-trigger onsets. Tapping is the
  // standard input for a rhythm trainer and works everywhere.

  /** Flash feedback on the pad: the result of the most recent tap. */
  const [tapFeedback, setTapFeedback] = useState<{ result: TimingResult | 'no-match'; id: number } | null>(null)
  const tapFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null)
  const tapIdRef = useRef(0)

  const registerTap = useCallback(() => {
    // Timestamp as early as possible. Expected beat times are stored on the
    // Date.now() axis (synchronised to audioContext at start), so this is
    // directly comparable without conversion.
    const tapTime = Date.now()

    const result = handleOnset(tapTime)

    tapIdRef.current += 1
    setTapFeedback({ result: result ?? 'no-match', id: tapIdRef.current })

    if (tapFeedbackTimerRef.current) clearTimeout(tapFeedbackTimerRef.current)
    tapFeedbackTimerRef.current = setTimeout(() => setTapFeedback(null), 350)
  }, [handleOnset])

  // Spacebar as an alias for the pad. Ignored while typing or when modal is closed.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.code !== 'Space' && e.key !== ' ') return

      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return

      e.preventDefault() // stop the page scrolling on every tap
      if (e.repeat) return // holding the key is not a stream of beats
      registerTap()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, registerTap])

  useEffect(() => {
    return () => {
      if (tapFeedbackTimerRef.current) clearTimeout(tapFeedbackTimerRef.current)
    }
  }, [])

  // ==========================================================================
  // TAP TEMPO
  // ==========================================================================
  // Set the BPM by tapping a few times, rather than hunting on the slider.

  const tapTempoTimesRef = useRef<number[]>([])
  const [tapTempoCount, setTapTempoCount] = useState(0)

  const registerTempoTap = useCallback(() => {
    const now = Date.now()
    const taps = tapTempoTimesRef.current

    // A long gap means this is the start of a new attempt, not a continuation.
    // This mirrors common tap-tempo counters: reset when the pause is much
    // longer than the tempo established so far, with a 2s fallback for the
    // first interval.
    if (taps.length > 0) {
      const intervals: number[] = []
      for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1])
      const averageInterval = intervals.length > 0
        ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
        : 0
      const resetThreshold = averageInterval > 0
        ? averageInterval * TAP_TEMPO_RESET_FACTOR
        : 2000
      if (now - taps[taps.length - 1] > resetThreshold) {
        taps.length = 0
      }
    }

    if (taps.length > 0 && now <= taps[taps.length - 1]) {
      taps.length = 0
    }

    taps.push(now)
    if (taps.length > 8) taps.shift() // rolling window, recent taps win

    setTapTempoCount(taps.length)

    // Two taps give one interval, which is far too noisy to trust.
    if (taps.length < 3) return

    const intervals: number[] = []
    for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1])

    // Median rather than mean: one hesitant tap should not drag the tempo.
    const sorted = [...intervals].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianInterval = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]

    if (medianInterval <= 0) return

    const derived = Math.round(60000 / medianInterval)
    // Clamp to the slider's range so the two controls cannot disagree.
    setBpm(Math.max(40, Math.min(220, derived)))
  }, [])

  const resetTapTempo = useCallback(() => {
    tapTempoTimesRef.current = []
    setTapTempoCount(0)
  }, [])

  // Mark beats the user never answered. A beat whose ±window has fully passed
  // can no longer be matched by any tap (handleOnset rejects offsets beyond
  // TIMING_THRESHOLDS.window), so it is definitively missed. Without this,
  // accuracy was computed over attempts only - three good taps across a
  // hundred metronome beats scored ~100%.
  const sweepMissedBeats = useCallback(() => {
    const now = Date.now()
    const expired = pendingBeatsRef.current.filter(b => now - b.timeMs > TIMING_THRESHOLDS.window)
    if (expired.length === 0) return

    pendingBeatsRef.current = pendingBeatsRef.current.filter(b => now - b.timeMs <= TIMING_THRESHOLDS.window)

    const missedTimings: BeatTiming[] = expired.map(b => ({
      beatNumber: b.beatNumber,
      expectedTime: b.timeMs,
      actualTime: null,
      offsetMs: null,
      result: 'missed',
    }))

    setRecentTimings(prev => [...prev, ...missedTimings].slice(-20))
    setSession(prev => ({
      ...prev,
      beatTimings: [...prev.beatTimings, ...missedTimings],
    }))
  }, [])

  // Schedule metronome beats
  const scheduleBeats = useCallback(() => {
    if (!audioContextRef.current) return

    const currentTime = audioContextRef.current.currentTime
    const secondsPerBeat = 60.0 / bpm
    // Must be larger than TIMING_THRESHOLDS.window so early taps can match a
    // beat that is about to happen.
    const scheduleAhead = SCHEDULE_AHEAD_SECONDS

    while (nextBeatTimeRef.current < currentTime + scheduleAhead) {
      const beatInMeasure = beatCounterRef.current % beatsPerMeasure
      const isAccent = beatInMeasure === 0

      // Schedule the sound
      const beatTime = nextBeatTimeRef.current
      const currentVolume = volumeRef.current
      setTimeout(() => {
        if (audioContextRef.current) {
          createMetronomeSound(audioContextRef.current, metronomeSound, isAccent, currentVolume)
        }
      }, (beatTime - audioContextRef.current.currentTime) * 1000)

      // Track expected beat time for onset detection
      // Use synchronized time bases to avoid drift between audioContext.currentTime and Date.now()
      // Calculate: dateNow at beat = dateNowStart + (beatTime - audioContextStart) * 1000
      const expectedTimeMs = dateNowStartTimeRef.current +
        (beatTime - audioContextStartTimeRef.current) * 1000
      // beatCounterRef is 0-based and never resets mid-session, giving a
      // monotonic 1-based beat number (the DB has UNIQUE(session_id, beat_number)).
      pendingBeatsRef.current.push({
        beatNumber: beatCounterRef.current + 1,
        timeMs: expectedTimeMs,
      })

      // Update visual beat indicator
      setTimeout(() => {
        setCurrentBeat(beatInMeasure + 1)
      }, (beatTime - audioContextRef.current.currentTime) * 1000)

      beatCounterRef.current++
      nextBeatTimeRef.current += secondsPerBeat
    }
  }, [bpm, beatsPerMeasure, metronomeSound])

  // Start metronome
  const startMetronome = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = createBrowserAudioContext()
    }

    // Initialize synchronized time references
    // This ensures Date.now() and audioContext.currentTime stay in sync throughout the session
    audioContextStartTimeRef.current = audioContextRef.current.currentTime
    dateNowStartTimeRef.current = Date.now()

    beatCounterRef.current = 0
    nextBeatTimeRef.current = audioContextRef.current.currentTime
    pendingBeatsRef.current = []
    lastMatchedBeatNumberRef.current = 0

    setIsPlaying(true)
    setSession({
      startedAt: new Date(),
      endedAt: null,
      bpm,
      timeSignature,
      beatTimings: [],
      isActive: true,
    })
    setRecentTimings([])

    schedulerIntervalRef.current = setInterval(() => {
      scheduleBeats()
      sweepMissedBeats()
    }, 25)
    scheduleBeats()
  }, [bpm, timeSignature, scheduleBeats, sweepMissedBeats])

  // Stop metronome
  const stopMetronome = useCallback(() => {
    if (schedulerIntervalRef.current) {
      clearInterval(schedulerIntervalRef.current)
      schedulerIntervalRef.current = null
    }

    setIsPlaying(false)
    setCurrentBeat(0)
    setSession(prev => ({
      ...prev,
      endedAt: new Date(),
      isActive: false,
    }))
  }, [])

  // Toggle play/pause
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

      // Prepare beat metrics for saving
      const beatMetrics = session.beatTimings.map((bt) => ({
        beatNumber: bt.beatNumber,
        expectedTimeMs: bt.expectedTime,
        actualTimeMs: bt.actualTime,
        timingOffsetMs: bt.offsetMs,
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
          // New singer-focused metrics
          rhythmTendency: stats.rhythmTendency,
          avgEarlyMs: stats.avgEarlyMs,
          avgLateMs: stats.avgLateMs,
          // Include detailed beat metrics
          beatMetrics,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save session')
      }

      if (result.saved) {
        setSaveMessage(`Session saved! Score: ${result.overallScore?.toFixed(1) || stats.onBeatPercent.toFixed(1)}%`)
      } else {
        setSaveMessage(result.message || 'Session not saved')
      }
    } catch (error: any) {
      console.error('Save error:', error)
      setSaveMessage(error?.message || 'Failed to save session')
    } finally {
      setIsSaving(false)
      setTimeout(() => setSaveMessage(null), 5000)
    }
  }, [session])

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      stopMetronome()
      stopListening()
    }
  }, [isOpen, stopMetronome, stopListening])

  // Handle escape key
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

  // Prevent body scroll when modal is open
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

  // Render beat indicators
  const renderBeatIndicators = () => (
    <div className="flex justify-center gap-3 mb-4">
      {Array.from({ length: beatsPerMeasure }).map((_, i) => {
        const beatNum = i + 1
        const isActive = currentBeat === beatNum && isPlaying
        const isAccent = i === 0

        return (
          <div
            key={i}
            className={`rounded-full transition-all duration-75 ${
              isActive
                ? isAccent
                  ? 'bg-gold-300 shadow-lg shadow-gold-400/50 scale-110'
                  : 'bg-gold-400 shadow-lg shadow-gold-400/40'
                : 'bg-white/[0.06] border border-white/10'
            }`}
            style={{
              width: isAccent ? '52px' : '44px',
              height: isAccent ? '52px' : '44px',
            }}
          >
            {isActive && (
              <div className="w-full h-full rounded-full animate-ping bg-gold-400/30" />
            )}
          </div>
        )
      })}
    </div>
  )

  // Render timing history dots
  const renderTimingHistory = () => (
    <div className="flex flex-wrap justify-center gap-1.5 mb-4 min-h-[32px]">
      {recentTimings.slice(-20).map((timing, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full transition-all ${
            timing.result === 'on-beat'
              ? 'bg-emerald-500'
              : timing.result === 'early'
                ? 'bg-blue-500'
                : timing.result === 'late'
                  ? 'bg-amber-500'
                  : 'bg-white/20'
          }`}
          title={timing.offsetMs !== null ? `${timing.result}: ${timing.offsetMs.toFixed(0)}ms` : 'missed: no tap'}
        />
      ))}
    </div>
  )

  // Render BPM slider + tap tempo
  const renderBpmControl = () => (
    <Panel data-tour="rhythm-bpm-control">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-400">Speed (beats per minute)</span>
        <span className="text-xl font-bold tabular-nums text-white">{bpm}</span>
      </div>
      <input
        type="range"
        min="40"
        max="220"
        value={bpm}
        onChange={(e) => setBpm(parseInt(e.target.value))}
        disabled={isPlaying}
        aria-label="Beats per minute"
        className="va-range w-full"
      />
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        <span>40</span>
        <span>220</span>
      </div>

      {/* Tap tempo: derive BPM from tapping instead of hunting on the slider.
          Disabled while playing, matching the slider - changing tempo mid-run
          would invalidate the beat schedule the session is measured against. */}
      <div className="mt-3 flex items-center gap-2">
        <Button
          className="flex-1 touch-none"
          onPointerDown={(e) => {
            e.preventDefault()
            registerTempoTap()
          }}
          disabled={isPlaying}
        >
          {tapTempoCount === 0
            ? 'Tap the speed you want'
            : tapTempoCount < 3
              ? `Keep tapping (${tapTempoCount}/3)`
              : `Tapping · ${bpm}`}
        </Button>
        {tapTempoCount > 0 && !isPlaying && (
          <Button variant="ghost" onClick={resetTapTempo} title="Clear tapped speed">
            Reset
          </Button>
        )}
      </div>
    </Panel>
  )

  // Render session stats
  const renderSessionStats = () => (
    <Panel padding="sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-sans text-sm font-semibold text-white">
          <TrendingUp className="size-4 text-gold-400" />
          Session stats
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={saveSession}
          disabled={isSaving || session.beatTimings.length === 0}
        >
          <Save />
          {isSaving ? 'Saving…' : 'Save session'}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="On beat" value={stats.onBeatCount} tone="success" />
        <Stat label="Early" value={stats.earlyCount} tone="info" />
        <Stat label="Late" value={stats.lateCount} tone="warning" />
        <Stat label="Accuracy" value={`${stats.onBeatPercent.toFixed(0)}%`} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3 border-t border-white/10 pt-2">
        <Stat size="sm" label="Steadiness" value={`${stats.consistency.toFixed(0)}%`} />
        <Stat size="sm" label="Best streak" value={stats.bestStreak} />
        <Stat
          size="sm"
          label="You tend to be"
          value={stats.rhythmTendency === 'early' ? 'Early' : stats.rhythmTendency === 'late' ? 'Late' : 'On time'}
          tone={stats.rhythmTendency === 'early' ? 'info' : stats.rhythmTendency === 'late' ? 'warning' : 'success'}
        />
      </div>

      {saveMessage && (
        <p className={`mt-2 text-center text-sm ${saveMessage.includes('saved') ? 'text-emerald-400' : 'text-amber-400'}`}>
          {saveMessage}
        </p>
      )}
    </Panel>
  )

  // Render settings panel
  const renderSettings = () => (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-ink-800 p-4 shadow-2xl shadow-black/60">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-sans text-base font-semibold text-white">
          <Settings2 className="size-4 text-gold-400" />
          More settings
        </h3>
        <Button size="sm" variant="primary" onClick={() => setShowSettings(false)}>
          Done
        </Button>
      </div>

      <div>
        <p className="mb-2 text-xs text-gray-400">Beats in a bar</p>
        <Segmented
          aria-label="Time signature"
          value={timeSignature}
          onChange={setTimeSignature}
          disabled={isPlaying}
          options={TIME_SIGNATURES.map((ts) => ({ value: ts.value, label: ts.label }))}
        />
      </div>

      <div>
        <p className="mb-2 text-xs text-gray-400">Click sound</p>
        <Segmented
          aria-label="Click sound"
          value={metronomeSound}
          onChange={setMetronomeSound}
          options={SOUND_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <label htmlFor="rhythm-volume" className="flex items-center gap-2 text-gray-400">
            <Volume2 className="size-3.5" /> Volume
          </label>
          <span className="tabular-nums text-gray-300">{volume}%</span>
        </div>
        <input
          id="rhythm-volume"
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(parseInt(e.target.value))}
          className="va-range w-full"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <label htmlFor="rhythm-sensitivity" className="flex items-center gap-2 text-gray-400">
            <Mic className="size-3.5" /> Mic sensitivity
          </label>
          <span className="tabular-nums text-gray-300">{sensitivity}%</span>
        </div>
        <input
          id="rhythm-sensitivity"
          type="range"
          min="10"
          max="100"
          value={sensitivity}
          onChange={(e) => setSensitivity(parseInt(e.target.value))}
          className="va-range w-full"
        />
      </div>
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
          className="group flex h-full min-h-[88px] w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 px-5 py-4 text-white transition-all duration-300"
          style={{ boxShadow: '0 8px 32px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 transition-transform duration-300 group-hover:scale-110">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[15px] font-bold leading-tight">Rhythm Trainer</p>
            <p className="mt-0.5 text-xs leading-snug text-white/75">BPM & timing practice</p>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 transition-colors group-hover:bg-white/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      )}

      {isOpen && (
        <ToolDialog
          titleId="rhythm-trainer-title"
          title="Rhythm Trainer"
          subtitle="Tap, clap, or sing along with the beat."
          icon={<Volume2 />}
          onClose={() => {
            setIsOpen(false)
            setIsFullscreen(false)
          }}
          fullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          actions={<SpotlightTriggerButton tourKey="rhythm_trainer_v4" label="How to" />}
          beforeBody={<SpotlightTour tourKey="rhythm_trainer_v4" steps={rhythmTourSteps} />}
        >
              {/* Settings open over the tool instead of pushing it down the page */}
              {showSettings && (
                <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-ink-950/85 p-4 backdrop-blur-sm sm:p-5">
                  <div className="w-full max-w-md">{renderSettings()}</div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  {/* BPM Control */}
                  {renderBpmControl()}

                  <Button
                    size="lg"
                    variant="outline"
                    block
                    className="my-4 justify-start"
                    onClick={() => setShowSettings(true)}
                  >
                    <Settings2 />
                    <span className="flex flex-col items-start leading-tight">
                      <span>More settings</span>
                      <span className="text-xs font-normal text-gray-400">Bar length, click sound, volume and mic</span>
                    </span>
                  </Button>

                  {/* Session Stats */}
                  {session.beatTimings.length > 0 && renderSessionStats()}
                </div>

                <div className="min-w-0">
              {/* Beat Indicators */}
              <div className="text-center mb-2">
                <span className="text-sm text-gray-400">{timeSignature} time</span>
              </div>
              {renderBeatIndicators()}

              {/* Timing History */}
              {renderTimingHistory()}

              {/* Legend */}
              <div className="flex justify-center gap-4 mb-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-gray-400">On beat</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-gray-400">Early</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-gray-400">Late</span>
                </span>
              </div>

              {/* Play/Pause & Mic Controls */}
              <div className="flex justify-center gap-4 mb-4">
                <button
                  data-tour="rhythm-play-btn"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className={`size-16 rounded-full flex items-center justify-center transition-colors duration-150 shadow-lg shadow-black/30 ${
                    isPlaying
                      ? 'bg-red-500 text-white hover:bg-red-400'
                      : 'bg-gold-400 text-ink-900 hover:bg-gold-300'
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="size-7" />
                  ) : (
                    <Play className="size-7 ml-1" />
                  )}
                </button>

                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`size-16 rounded-full flex items-center justify-center transition-colors duration-150 shadow-lg shadow-black/30 ${
                    isListening
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'border border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1]'
                  }`}
                  title={isListening ? 'Turn the mic off' : 'Turn the mic on'}
                  aria-label={isListening ? 'Turn the mic off' : 'Turn the mic on'}
                >
                  {isListening ? (
                    <div className="relative">
                      <Mic className="size-7" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-pulse" />
                    </div>
                  ) : (
                    <MicOff className="size-7" />
                  )}
                </button>
              </div>

              {/* Tap pad - primary input, works with or without the microphone */}
              <div data-tour="rhythm-tap-pad" className="mb-3">
                <button
                  onPointerDown={(e) => {
                    // pointerdown, not click: fires on contact rather than
                    // release, which is what makes a tap pad feel accurate.
                    e.preventDefault()
                    registerTap()
                  }}
                  disabled={!isPlaying}
                  aria-label="Tap on the beat"
                  className={`w-full h-24 rounded-2xl border-2 select-none touch-none transition-all duration-100 flex flex-col items-center justify-center gap-1 ${
                    !isPlaying
                      ? 'border-white/10 bg-white/[0.03] cursor-not-allowed'
                      : tapFeedback?.result === 'on-beat'
                        ? 'border-emerald-400 bg-emerald-500/30 scale-[0.98]'
                        : tapFeedback?.result === 'early'
                          ? 'border-blue-400 bg-blue-500/25 scale-[0.98]'
                          : tapFeedback?.result === 'late'
                            ? 'border-amber-400 bg-amber-500/25 scale-[0.98]'
                            : tapFeedback?.result === 'no-match'
                              ? 'border-white/30 bg-white/10 scale-[0.98]'
                              : 'border-gold-400/50 bg-gold-400/10 hover:bg-gold-400/20 active:scale-[0.98] cursor-pointer'
                  }`}
                >
                  <span className={`text-lg font-bold ${!isPlaying ? 'text-gray-500' : 'text-white'}`}>
                    {!isPlaying
                      ? 'Press play to begin'
                      : tapFeedback?.result === 'on-beat'
                        ? 'On beat!'
                        : tapFeedback?.result === 'early'
                          ? 'A little early'
                          : tapFeedback?.result === 'late'
                            ? 'A little late'
                            : tapFeedback?.result === 'no-match'
                              ? 'Off the beat'
                              : 'TAP'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {isPlaying ? 'tap here or press spacebar' : ''}
                  </span>
                </button>
              </div>

              {/* Instructions */}
              <div className="text-center text-sm text-gray-400 min-h-[40px]">
                {!isPlaying && (
                  <p>Press play to start the metronome, then tap the pad or spacebar on each beat.</p>
                )}
                {isPlaying && !isListening && (
                  <p>Tap the pad or press spacebar on the beat. Turn on the mic to clap or sing instead.</p>
                )}
                {isPlaying && isListening && (
                  <p>Tap, clap, or sing on the beat - both tapping and the mic are being tracked.</p>
                )}
              </div>

                </div>
              </div>
        </ToolDialog>
      )}
    </>
  )
}
