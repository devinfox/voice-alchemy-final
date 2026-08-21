'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Music, X, Maximize2, Minimize2, Circle, Piano, Mic, MicOff, TrendingUp, Save, Volume2, Sparkles, CheckCircle2 } from 'lucide-react'
import Script from 'next/script'
import { getSharedMicStream, subscribeSharedMicStream } from '@/lib/shared-mic-stream'
import {
  analyzeBuffer,
  getNoteFrequency,
  getTargetCentsError,
  calculateCentsStdDev,
  calculateMedian,
  calculateTargetAccuracy,
  NOTE_STRINGS,
  NOTE_STRINGS_ASCII,
  IN_TUNE_THRESHOLD_CENTS
} from '@/lib/pitch-detection'

// ============================================================================
// TUNER & PITCH CONSTANTS
// ============================================================================

const NOTE_STRINGS_DISPLAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BUFFER_SIZE = 4096
const IN_TUNE_THRESHOLD = IN_TUNE_THRESHOLD_CENTS // 15 cents
const IN_WINDOW_THRESHOLD = 50 // 50 cents (quarter tone)

// Usable human vocal octaves (C2 ~65Hz to B6 ~1975Hz)
const AVAILABLE_OCTAVES = [2, 3, 4, 5, 6]

type AubioPitchDetector = { do: (buffer: Float32Array) => number }
type AubioModule = { Pitch: new (method: string, bufferSize: number, hopSize: number, sampleRate: number) => AubioPitchDetector }
type AudioContextConstructor = typeof AudioContext

declare global {
  interface Window {
    aubio: () => Promise<AubioModule>
    webkitAudioContext?: AudioContextConstructor
  }
}

interface DetectedNote {
  name: string
  nameAscii: string
  value: number
  cents: number
  octave: number
  frequency: number
  isInTune: boolean
}

// ============================================================================
// SESSION TRACKING TYPES
// ============================================================================

interface PitchSample {
  frequency: number
  centsFromNearestNote: number
  targetErrorCents: number
  timestamp: number
  isInTune: boolean
  isInWindow: boolean
  detectedNoteName: string
  detectedOctave: number
  detectedNoteValue: number
}

interface NoteAttempt {
  noteName: string
  octave: number
  targetFrequency: number
  startTime: number
  samples: PitchSample[]
  attemptNumber: number
  isComplete: boolean

  // Statistically rigorous acoustic metrics
  targetAccuracy: number        // 0-100% based on Mean Absolute Error in cents
  maeCents: number              // Mean Absolute Error in cents from target
  pitchBiasCents: number        // Median signed error in cents (- = flat, + = sharp)
  pitchDirection: 'sharp' | 'flat' | 'on-target'
  voiceStability: number        // 0-100% based on logarithmic cents standard deviation
  centsStdDev: number           // Standard deviation in cents from singer's center
  inTunePercent: number         // % of frames within ±15 cents
  inWindowPercent: number       // % of frames within ±50 cents
  pitchOnsetSpeedMs: number     // ms to settle (3 consecutive frames in-window)
  inTuneSustainMs: number       // Max continuous in-tune duration with 1-frame grace
  timeToFirstSound: number      // ms until voiced sound detected
  mostSungNote: string | null
  mostSungOctave: number | null

  // Legacy fields (kept for API compatibility)
  pitchAccuracy: number
  pitchStability: number
  avgDetectedFrequency: number
  avgCentsDeviation: number
  maxCentsDeviation: number
  minCentsDeviation: number
  avgSemitoneDeviation: number
}

interface SessionMetrics {
  startedAt: Date | null
  endedAt: Date | null
  noteAttempts: Map<string, NoteAttempt>
  isActive: boolean
}

type TrainerState = 'idle' | 'listening_ref' | 'guard' | 'singing'

// ============================================================================
// NEEDLE & METER HELPERS
// ============================================================================

/**
 * Maps cents deviation (-50 to +50) across the full 90-degree arc (-45 deg to +45 deg)
 */
function getMeterDegree(cents: number): number {
  const clamped = Math.max(-50, Math.min(50, cents))
  return Math.round((clamped / 50) * 45)
}

// ============================================================================
// RIGOROUS METRICS CALCULATION
// ============================================================================

function calculateNoteMetrics(attempt: NoteAttempt): NoteAttempt {
  const samples = attempt.samples
  if (samples.length === 0) return attempt

  // 1. Target errors in continuous cents
  const targetErrors = samples.map(s => s.targetErrorCents)
  const absErrors = targetErrors.map(e => Math.min(1200, Math.abs(e))) // Cap at 1 octave to dampen wild artifacts without ignoring errors
  const maeCents = absErrors.reduce((a, b) => a + b, 0) / absErrors.length
  const pitchBiasCents = calculateMedian(targetErrors)

  // 2. Pitch direction / tendency based on median signed cents
  let pitchDirection: 'sharp' | 'flat' | 'on-target' = 'on-target'
  if (pitchBiasCents > 10) pitchDirection = 'sharp'
  else if (pitchBiasCents < -10) pitchDirection = 'flat'

  // 3. Target Accuracy (0-100%): Steep pedagogical curve (10c=95%, 15c=83%, 25c=60%, 50c=20%, >=75c=0%)
  const targetAccuracy = calculateTargetAccuracy(maeCents)

  // 4. Voice Stability in Logarithmic Cents (Standard deviation in cents relative to singer's own mean frequency)
  const frequencies = samples.map(s => s.frequency)
  const centsStdDev = calculateCentsStdDev(frequencies)
  // 0 cents stdDev = 100%, 25 cents stdDev = 50%, 50 cents stdDev = 0%
  const voiceStability = Math.max(0, Math.min(100, Math.round(100 - (centsStdDev * 2))))

  // 5. In-tune and In-window frame percentages
  const inTuneCount = samples.filter(s => s.isInTune).length
  const inWindowCount = samples.filter(s => s.isInWindow).length
  const inTunePercent = Math.round((inTuneCount / samples.length) * 100)
  const inWindowPercent = Math.round((inWindowCount / samples.length) * 100)

  // 6. Settled Onset Speed: Requires 3 consecutive in-window frames (<= 25 cents from target) to avoid transient false positives
  let settledIndex = -1
  for (let i = 0; i < samples.length - 2; i++) {
    if (
      Math.abs(samples[i].targetErrorCents) <= 25 &&
      Math.abs(samples[i + 1].targetErrorCents) <= 25 &&
      Math.abs(samples[i + 2].targetErrorCents) <= 25
    ) {
      settledIndex = i
      break
    }
  }
  const pitchOnsetSpeedMs = settledIndex >= 0
    ? Math.max(0, samples[settledIndex].timestamp - attempt.startTime)
    : Math.max(0, samples[samples.length - 1].timestamp - attempt.startTime)

  // 7. Time to first voiced sound
  const timeToFirstSound = Math.max(0, samples[0].timestamp - attempt.startTime)

  // 8. In-Tune Sustain (with 1-frame grace period hysteresis)
  let maxSustain = 0
  let currentSustain = 0
  let graceUsed = false

  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].timestamp - samples[i - 1].timestamp
    if (samples[i].isInTune) {
      currentSustain += dt
      graceUsed = false
      maxSustain = Math.max(maxSustain, currentSustain)
    } else if (!graceUsed && i < samples.length - 1 && samples[i + 1].isInTune) {
      // 1 frame grace glitch allowed
      currentSustain += dt
      graceUsed = true
    } else {
      currentSustain = 0
      graceUsed = false
    }
  }
  const inTuneSustainMs = maxSustain

  // 9. Most sung note
  const noteCount: Record<string, number> = {}
  samples.forEach(s => {
    const key = `${s.detectedNoteName}-${s.detectedOctave}`
    noteCount[key] = (noteCount[key] || 0) + 1
  })
  const mostSungKey = Object.entries(noteCount).sort((a, b) => b[1] - a[1])[0]?.[0]
  const [mostSungNote, mostSungOctaveStr] = mostSungKey?.split('-') || [null, null]
  const mostSungOctave = mostSungOctaveStr ? parseInt(mostSungOctaveStr) : null

  // 10. Legacy fields for DB compatibility
  const avgDetectedFrequency = frequencies.reduce((a, b) => a + b, 0) / frequencies.length
  const nearestCentsDeviations = samples.map(s => s.centsFromNearestNote)
  const avgCentsDeviation = nearestCentsDeviations.reduce((a, b) => a + b, 0) / nearestCentsDeviations.length
  const maxCentsDeviation = Math.max(...nearestCentsDeviations.map(Math.abs))
  const minCentsDeviation = Math.min(...nearestCentsDeviations.map(Math.abs))
  const avgSemitoneDeviation = pitchBiasCents / 100

  return {
    ...attempt,
    targetAccuracy,
    maeCents: Math.round(maeCents * 10) / 10,
    pitchBiasCents: Math.round(pitchBiasCents * 10) / 10,
    pitchDirection,
    voiceStability,
    centsStdDev: Math.round(centsStdDev * 10) / 10,
    inTunePercent,
    inWindowPercent,
    pitchOnsetSpeedMs,
    inTuneSustainMs,
    timeToFirstSound,
    mostSungNote,
    mostSungOctave,
    // Legacy metrics
    pitchAccuracy: targetAccuracy,
    pitchStability: voiceStability,
    avgDetectedFrequency: Math.round(avgDetectedFrequency * 10) / 10,
    avgCentsDeviation: Math.round(avgCentsDeviation * 10) / 10,
    maxCentsDeviation: Math.round(maxCentsDeviation * 10) / 10,
    minCentsDeviation: Math.round(minCentsDeviation * 10) / 10,
    avgSemitoneDeviation: Math.round(avgSemitoneDeviation * 100) / 100,
    isComplete: true,
  }
}

// ============================================================================
// CUSTOM HOOK - usePitchDetection
// ============================================================================

interface UsePitchDetectionOptions {
  sensitivity: number
  externalMicStream?: MediaStream | null
  onNoteDetected?: (note: DetectedNote) => void
  onSampleRecorded?: (note: DetectedNote) => void
}

function usePitchDetection({ sensitivity, externalMicStream, onNoteDetected, onSampleRecorded }: UsePitchDetectionOptions) {
  const [isListening, setIsListening] = useState(false)
  const [aubioLoaded, setAubioLoaded] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const pitchDetectorRef = useRef<AubioPitchDetector | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sensitivityRef = useRef(sensitivity)
  const onNoteDetectedRef = useRef(onNoteDetected)
  const onSampleRecordedRef = useRef(onSampleRecorded)
  const externalMicStreamRef = useRef<MediaStream | null | undefined>(externalMicStream)

  useEffect(() => {
    sensitivityRef.current = sensitivity
  }, [sensitivity])

  useEffect(() => {
    onNoteDetectedRef.current = onNoteDetected
  }, [onNoteDetected])

  useEffect(() => {
    onSampleRecordedRef.current = onSampleRecorded
  }, [onSampleRecorded])

  useEffect(() => {
    externalMicStreamRef.current = externalMicStream
  }, [externalMicStream])

  const startListening = useCallback(async () => {
    try {
      if (!window.aubio) {
        alert('Audio library is still loading. Please wait a moment and try again.')
        return
      }

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext
      if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser')
      audioContextRef.current = new AudioContextCtor()
      analyserRef.current = audioContextRef.current.createAnalyser()
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(BUFFER_SIZE, 1, 1)

      const aubioModule = await window.aubio()
      pitchDetectorRef.current = new aubioModule.Pitch(
        'default',
        BUFFER_SIZE,
        1,
        audioContextRef.current.sampleRate
      )

      let inputStream: MediaStream
      const externalStream = externalMicStreamRef.current
      const externalAudioTrack = externalStream?.getAudioTracks()[0]

      if (externalAudioTrack && externalAudioTrack.readyState === 'live') {
        inputStream = new MediaStream([externalAudioTrack.clone()])
      } else {
        // High fidelity vocal microphone constraints (disable aggressive AGC / noise suppression for musical purity)
        inputStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            autoGainControl: false,
            noiseSuppression: false,
            channelCount: 1
          }
        })
      }

      streamRef.current = inputStream

      const source = audioContextRef.current.createMediaStreamSource(inputStream)
      source.connect(analyserRef.current)
      analyserRef.current.connect(scriptProcessorRef.current)

      const muteGain = audioContextRef.current.createGain()
      muteGain.gain.value = 0
      scriptProcessorRef.current.connect(muteGain)
      muteGain.connect(audioContextRef.current.destination)

      scriptProcessorRef.current.addEventListener('audioprocess', (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0)
        if (!pitchDetectorRef.current) return

        const detected = analyzeBuffer(input, pitchDetectorRef.current, sensitivityRef.current)
        if (!detected) return

        if (onNoteDetectedRef.current) {
          onNoteDetectedRef.current(detected)
        }

        if (onSampleRecordedRef.current) {
          onSampleRecordedRef.current(detected)
        }
      })

      setIsListening(true)
    } catch (error) {
      console.error('Microphone error:', error)
      alert(error instanceof Error ? `${error.name}: ${error.message}` : 'Could not access microphone')
    }
  }, [])

  const stopListening = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    pitchDetectorRef.current = null
    setIsListening(false)
  }, [])

  return {
    isListening,
    aubioLoaded,
    setAubioLoaded,
    startListening,
    stopListening,
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ModernPitchTrainerProps {
  variant?: 'floating' | 'card'
}

export default function ModernPitchTrainer({ variant = 'floating' }: ModernPitchTrainerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mode, setMode] = useState<'wheel' | 'keyboard'>('wheel')
  const [selectedOctave, setSelectedOctave] = useState(4)
  const [selectedNote, setSelectedNote] = useState<string | null>(null)
  const [sensitivity, setSensitivity] = useState(50)
  const [detectedNote, setDetectedNote] = useState<DetectedNote | null>(null)
  const [showProgress, setShowProgress] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [sharedMicStream, setSharedMicStream] = useState<MediaStream | null>(() => getSharedMicStream())

  // Lifecycle state machine to prevent reference audio bleed into microphone scoring
  const [trainerState, setTrainerState] = useState<TrainerState>('idle')

  // Real-time pitch history for scrolling vocal contour display
  const [pitchHistory, setPitchHistory] = useState<Array<{ timestamp: number; centsError: number; isInTune: boolean }>>([])

  // Session tracking state
  const [session, setSession] = useState<SessionMetrics>({
    startedAt: null,
    endedAt: null,
    noteAttempts: new Map(),
    isActive: false
  })
  const [currentAttempt, setCurrentAttempt] = useState<NoteAttempt | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const guardTimerRef = useRef<NodeJS.Timeout | null>(null)
  const trainerStateRef = useRef(trainerState)

  useEffect(() => {
    trainerStateRef.current = trainerState
  }, [trainerState])

  useEffect(() => {
    return subscribeSharedMicStream(setSharedMicStream)
  }, [])

  // Start session on first note interaction
  const startSession = useCallback(() => {
    if (!session.isActive) {
      setSession({
        startedAt: new Date(),
        endedAt: null,
        noteAttempts: new Map(),
        isActive: true
      })
    }
  }, [session.isActive])

  // Start a new note attempt
  const startNoteAttempt = useCallback((noteName: string, octave: number) => {
    startSession()

    const key = `${noteName}-${octave}`
    const existingAttempt = session.noteAttempts.get(key)
    const targetFreq = getNoteFrequency(noteName, octave)

    const newAttempt: NoteAttempt = {
      noteName,
      octave,
      targetFrequency: targetFreq,
      startTime: Date.now(),
      samples: [],
      attemptNumber: existingAttempt ? existingAttempt.attemptNumber + 1 : 1,
      isComplete: false,
      targetAccuracy: 0,
      maeCents: 0,
      pitchBiasCents: 0,
      pitchDirection: 'on-target',
      voiceStability: 0,
      centsStdDev: 0,
      inTunePercent: 0,
      inWindowPercent: 0,
      pitchOnsetSpeedMs: 0,
      inTuneSustainMs: 0,
      timeToFirstSound: 0,
      mostSungNote: null,
      mostSungOctave: null,
      // Legacy
      pitchAccuracy: 0,
      pitchStability: 0,
      avgDetectedFrequency: 0,
      avgCentsDeviation: 0,
      maxCentsDeviation: 0,
      minCentsDeviation: 0,
      avgSemitoneDeviation: 0,
    }

    setCurrentAttempt(newAttempt)
    setPitchHistory([])
  }, [session, startSession])

  // Complete current note attempt and retain if better target accuracy
  const completeNoteAttempt = useCallback(() => {
    if (!currentAttempt || currentAttempt.samples.length === 0) {
      setCurrentAttempt(null)
      return
    }

    const completedAttempt = calculateNoteMetrics(currentAttempt)
    const key = `${completedAttempt.noteName}-${completedAttempt.octave}`

    setSession(prev => {
      const existingAttempt = prev.noteAttempts.get(key)

      // Only save if this attempt is better based on TRUE Target Accuracy (not flawed legacy cents)
      if (!existingAttempt || completedAttempt.targetAccuracy > existingAttempt.targetAccuracy) {
        const newAttempts = new Map(prev.noteAttempts)
        newAttempts.set(key, completedAttempt)
        return { ...prev, noteAttempts: newAttempts }
      }

      return prev
    })

    setCurrentAttempt(null)
  }, [currentAttempt])

  // Handle incoming audio sample from detection engine
  const handleSampleRecorded = useCallback((note: DetectedNote) => {
    // GUARD CHECK: Never score when reference audio is playing or during room reverberation guard interval
    if (trainerStateRef.current === 'listening_ref' || trainerStateRef.current === 'guard') {
      return
    }

    if (!currentAttempt || !selectedNote || !note) return

    // Calculate continuous target error in cents
    const targetErrorCents = getTargetCentsError(note.frequency, currentAttempt.targetFrequency)
    const isInTune = Math.abs(targetErrorCents) <= IN_TUNE_THRESHOLD
    const isInWindow = Math.abs(targetErrorCents) <= IN_WINDOW_THRESHOLD

    const sample: PitchSample = {
      frequency: note.frequency,
      centsFromNearestNote: note.cents,
      targetErrorCents,
      timestamp: Date.now(),
      isInTune,
      isInWindow,
      detectedNoteName: note.name,
      detectedOctave: note.octave,
      detectedNoteValue: note.value,
    }

    setCurrentAttempt(prev => {
      if (!prev) return prev
      return {
        ...prev,
        samples: [...prev.samples, sample]
      }
    })

    // Update real-time scrolling pitch contour
    setPitchHistory(prev => {
      const next = [...prev, { timestamp: sample.timestamp, centsError: targetErrorCents, isInTune }]
      return next.slice(-60) // Keep last 60 frames (~2-3 seconds)
    })
  }, [currentAttempt, selectedNote])

  const {
    isListening,
    setAubioLoaded,
    startListening,
    stopListening,
  } = usePitchDetection({
    sensitivity,
    externalMicStream: sharedMicStream,
    onNoteDetected: setDetectedNote,
    onSampleRecorded: handleSampleRecorded,
  })

  // Save session to database
  const saveSession = useCallback(async () => {
    if (!session.startedAt || session.noteAttempts.size === 0) {
      setSaveMessage('No notes to save')
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const noteMetrics = Array.from(session.noteAttempts.values()).map(attempt => ({
        noteName: attempt.noteName,
        octave: attempt.octave,
        targetFrequency: attempt.targetFrequency,
        targetAccuracy: attempt.targetAccuracy,
        voiceStability: attempt.voiceStability,
        maeCents: attempt.maeCents,
        pitchBiasCents: attempt.pitchBiasCents,
        pitchDirection: attempt.pitchDirection,
        inTunePercent: attempt.inTunePercent,
        inWindowPercent: attempt.inWindowPercent,
        pitchOnsetSpeedMs: attempt.pitchOnsetSpeedMs,
        inTuneSustainMs: attempt.inTuneSustainMs,
        timeToFirstSound: attempt.timeToFirstSound,
        sampleCount: attempt.samples.length,
        mostSungNote: attempt.mostSungNote,
        mostSungOctave: attempt.mostSungOctave,
        // Legacy
        pitchAccuracy: attempt.pitchAccuracy,
        pitchStability: attempt.pitchStability,
        avgDetectedFrequency: attempt.avgDetectedFrequency,
        avgCentsDeviation: attempt.avgCentsDeviation,
        maxCentsDeviation: attempt.maxCentsDeviation,
        minCentsDeviation: attempt.minCentsDeviation,
        attemptNumber: attempt.attemptNumber,
        avgSemitoneDeviation: attempt.avgSemitoneDeviation,
      }))

      const response = await fetch('/api/pitch-training/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt: session.startedAt?.toISOString(),
          endedAt: new Date().toISOString(),
          noteMetrics
        })
      })

      const result = await response.json()

      if (result.saved) {
        setSaveMessage(`Session saved! Score: ${result.overallScore.toFixed(1)}%${result.isNewBest ? ' (New best!)' : ''}`)
      } else {
        setSaveMessage(result.message || 'Session recorded')
      }
    } catch (error) {
      console.error('Save error:', error)
      setSaveMessage('Failed to save session')
    } finally {
      setIsSaving(false)
      setTimeout(() => setSaveMessage(null), 5000)
    }
  }, [session])

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

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      if (guardTimerRef.current) {
        clearTimeout(guardTimerRef.current)
      }
      setTrainerState('idle')
      setSelectedNote(null)
      stopListening()
      completeNoteAttempt()
    }
  }, [isOpen, stopListening, completeNoteAttempt])

  // Complete attempt when note or octave changes
  useEffect(() => {
    if (currentAttempt && (selectedNote !== currentAttempt.noteName || selectedOctave !== currentAttempt.octave)) {
      completeNoteAttempt()
    }
  }, [selectedNote, selectedOctave, currentAttempt, completeNoteAttempt])

  // Get audio file path
  const getAudioPath = (note: string, octave: number) => {
    const actualOctave = octave === 1 ? 2 : octave
    const noteFile = note.replace('#', 'sharp').replace('♯', 'sharp').toLowerCase()
    return `/chromatic-tuner/octave${actualOctave}/${noteFile}.mp3`
  }

  // Play reference note with Listen -> Guard -> Sing pipeline
  const playNote = (note: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (guardTimerRef.current) {
      clearTimeout(guardTimerRef.current)
    }

    // Complete previous attempt before starting new one
    if (currentAttempt && (currentAttempt.noteName !== note || currentAttempt.octave !== selectedOctave)) {
      completeNoteAttempt()
    }

    setSelectedNote(note)

    // Phase 1: Reference audio playback (mic is ignored)
    setTrainerState('listening_ref')
    const audio = new Audio(getAudioPath(note, selectedOctave))
    audioRef.current = audio

    audio.play().catch(err => {
      console.warn('Audio playback error:', err)
      // Fallback directly to singing phase if playback fails
      setTrainerState('singing')
      startNoteAttempt(note, selectedOctave)
    })

    audio.onended = () => {
      // Phase 2: Guard interval (400ms for room echo / speaker decay)
      setTrainerState('guard')
      guardTimerRef.current = setTimeout(() => {
        // Phase 3: Sing phase
        setTrainerState('singing')
        startNoteAttempt(note, selectedOctave)
      }, 400)
    }
  }

  // Check if detected note matches selected note
  const isNoteMatching = () => {
    if (!detectedNote || !selectedNote) return false
    const cleanSelected = selectedNote.replace('#', '♯')
    return (
      detectedNote.name === cleanSelected &&
      detectedNote.octave === selectedOctave &&
      Math.abs(detectedNote.cents) <= IN_TUNE_THRESHOLD
    )
  }

  // Needle meter rotation (-45 deg to +45 deg mapped to -50 to +50 cents)
  const meterDegree = detectedNote ? getMeterDegree(detectedNote.cents) : 0

  // Aggregate session statistics
  const sessionStats = useMemo(() => {
    const attempts = Array.from(session.noteAttempts.values())
    const completedAttempts = attempts.filter(a => a.isComplete)

    return {
      notesAttempted: session.noteAttempts.size,
      avgTargetAccuracy: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, n) => sum + n.targetAccuracy, 0) / completedAttempts.length
        : 0,
      avgVoiceStability: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, n) => sum + n.voiceStability, 0) / completedAttempts.length
        : 0,
      totalDuration: session.startedAt
        ? Math.round((Date.now() - session.startedAt.getTime()) / 1000)
        : 0,
      overallDirection: (() => {
        if (completedAttempts.length === 0) return 'on-target'
        const avgBias = completedAttempts.reduce((sum, n) => sum + n.pitchBiasCents, 0) / completedAttempts.length
        if (avgBias > 10) return 'sharp'
        if (avgBias < -10) return 'flat'
        return 'on-target'
      })() as 'sharp' | 'flat' | 'on-target'
    }
  }, [session])

  // Render the analog needle meter
  const renderMeter = () => (
    <div className="relative w-56 h-28 mx-auto mb-4 bg-slate-900/60 rounded-2xl p-3 border border-slate-700/60 shadow-inner">
      <div className="absolute inset-0 flex items-end justify-center pb-2">
        <div className="w-full h-full relative">
          {/* Target in-tune zone (±15 cents) */}
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 w-12 h-16 bg-emerald-500/10 border-x border-emerald-500/30 rounded-t-lg"
            title="In-Tune Zone (±15 cents)"
          />

          {/* Tick marks (-50 to +50 cents) */}
          {[...Array(11)].map((_, i) => {
            const cents = (i - 5) * 10
            const deg = (cents / 50) * 45
            const isCenter = i === 5
            const isMajor = i % 5 === 0

            return (
              <div
                key={i}
                className={`absolute bottom-2 left-1/2 origin-bottom transition-all ${
                  isCenter
                    ? 'w-1 h-6 bg-emerald-400'
                    : isMajor
                      ? 'w-0.5 h-4 bg-slate-300'
                      : 'w-px h-2.5 bg-slate-500'
                }`}
                style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
              />
            )
          })}

          {/* Needle */}
          <div
            className={`absolute bottom-2 left-1/2 w-0.5 h-20 origin-bottom transition-transform duration-100 ease-out shadow-lg ${
              isNoteMatching() ? 'bg-emerald-400' : 'bg-rose-500'
            }`}
            style={{ transform: `translateX(-50%) rotate(${meterDegree}deg)` }}
          />
          <div className="absolute bottom-2 left-1/2 w-3.5 h-3.5 bg-slate-200 border-2 border-slate-700 rounded-full -translate-x-1/2 translate-y-1/2 shadow" />
        </div>
      </div>
      <div className="absolute bottom-2 left-4 text-xs font-semibold text-sky-400">♭ Flat</div>
      <div className="absolute bottom-2 right-4 text-xs font-semibold text-amber-400">Sharp ♯</div>
    </div>
  )

  // Render Real-Time Scrolling Pitch Contour
  const renderPitchContour = () => {
    if (pitchHistory.length === 0) return null

    const width = 320
    const height = 64
    const midY = height / 2

    // Map -100 cents to 100 cents to Y [height, 0]
    const getY = (cents: number) => {
      const clamped = Math.max(-100, Math.min(100, cents))
      return midY - (clamped / 100) * (height / 2 - 4)
    }

    const points = pitchHistory.map((p, idx) => {
      const x = (idx / Math.max(1, pitchHistory.length - 1)) * width
      const y = getY(p.centsError)
      return `${x},${y}`
    }).join(' ')

    return (
      <div className="w-full max-w-xs mx-auto mb-4 bg-slate-900/80 rounded-xl p-2.5 border border-slate-700/50">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 px-1">
          <span>Pitch Contour</span>
          <span className="text-emerald-400 font-mono text-[10px]">±15¢ Zone</span>
        </div>
        <div className="relative w-full h-16 overflow-hidden rounded bg-slate-950">
          {/* Target in-tune band */}
          <div
            className="absolute left-0 right-0 bg-emerald-500/15 border-y border-emerald-500/30"
            style={{
              top: `${midY - (15 / 100) * (height / 2 - 4)}px`,
              bottom: `${midY - (15 / 100) * (height / 2 - 4)}px`,
            }}
          />
          {/* Center target line */}
          <div className="absolute left-0 right-0 h-px bg-slate-600 top-1/2 -translate-y-1/2" />

          {/* Vocal pitch curve */}
          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </svg>
        </div>
      </div>
    )
  }

  // Render circular wheel mode
  const renderWheel = () => (
    <div className="relative w-64 h-64 mx-auto">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-slate-700" />

      {NOTE_STRINGS_DISPLAY.map((note, index) => {
        const angle = (index * 30 - 90) * (Math.PI / 180)
        const radius = 100
        const x = Math.cos(angle) * radius + 128
        const y = Math.sin(angle) * radius + 128
        const isSharp = note.includes('#')
        const isSelected = selectedNote === note
        const isDetected = detectedNote?.name === note.replace('#', '♯')
        const attemptKey = `${note}-${selectedOctave}`
        const hasAttempt = session.noteAttempts.has(attemptKey)

        return (
          <button
            key={note}
            onClick={() => playNote(note)}
            className={`absolute w-10 h-10 -ml-5 -mt-5 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200
              ${isSelected
                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white scale-110 shadow-lg shadow-indigo-500/50 ring-2 ring-white/50'
                : isDetected
                  ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white scale-105'
                  : hasAttempt
                    ? 'bg-gradient-to-br from-emerald-600 to-green-700 text-white'
                    : isSharp
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-600 text-white hover:bg-slate-500'
              }`}
            style={{ left: x, top: y }}
          >
            {note}
          </button>
        )
      })}

      {/* Center Action Button & Status */}
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center transition-all duration-200 border-2 ${
          trainerState === 'listening_ref'
            ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 animate-pulse'
            : trainerState === 'guard'
              ? 'bg-amber-950/80 border-amber-500 text-amber-200'
              : trainerState === 'singing'
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-300'
        }`}
      >
        {trainerState === 'listening_ref' ? (
          <>
            <Volume2 className="w-6 h-6 text-indigo-400 animate-bounce" />
            <span className="text-[10px] font-medium leading-tight mt-1">Listen...</span>
          </>
        ) : trainerState === 'guard' ? (
          <>
            <Sparkles className="w-6 h-6 text-amber-400 animate-spin" />
            <span className="text-[10px] font-medium leading-tight mt-1">Get Ready...</span>
          </>
        ) : trainerState === 'singing' ? (
          <>
            <Mic className="w-6 h-6 text-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold leading-tight mt-1">Sing Now!</span>
          </>
        ) : selectedNote ? (
          <button onClick={() => playNote(selectedNote)} className="flex flex-col items-center">
            <Volume2 className="w-6 h-6 text-white" />
            <span className="text-[10px] font-medium mt-1">Replay</span>
          </button>
        ) : (
          <span className="text-[11px] text-slate-400 font-medium">Pick Note</span>
        )}
      </div>

      {isNoteMatching() && (
        <div className="absolute inset-0 rounded-full border-4 border-emerald-500 animate-pulse pointer-events-none" />
      )}
    </div>
  )

  // Render keyboard mode
  const renderKeyboard = () => {
    const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    const blackNotePositions = [
      { note: 'C#', offset: 0 },
      { note: 'D#', offset: 1 },
      { note: 'F#', offset: 3 },
      { note: 'G#', offset: 4 },
      { note: 'A#', offset: 5 },
    ]

    return (
      <div className="relative mx-auto" style={{ width: '336px', height: '160px' }}>
        <div className="flex h-full">
          {whiteNotes.map((note) => {
            const isSelected = selectedNote === note
            const isDetected = detectedNote?.name === note
            const attemptKey = `${note}-${selectedOctave}`
            const hasAttempt = session.noteAttempts.has(attemptKey)

            return (
              <button
                key={note}
                onClick={() => playNote(note)}
                className={`relative w-12 h-full rounded-b-lg border border-slate-600 transition-all duration-100
                  ${isSelected
                    ? 'bg-gradient-to-b from-indigo-400 to-indigo-600 shadow-inner'
                    : isDetected
                      ? 'bg-gradient-to-b from-rose-400 to-red-500'
                      : hasAttempt
                        ? 'bg-gradient-to-b from-emerald-300 to-emerald-400'
                        : 'bg-gradient-to-b from-white to-slate-100 hover:from-slate-100 hover:to-slate-200'
                  }`}
              >
                <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium
                  ${isSelected || isDetected ? 'text-white' : hasAttempt ? 'text-emerald-900' : 'text-slate-600'}`}>
                  {note}
                </span>
              </button>
            )
          })}
        </div>

        {blackNotePositions.map(({ note, offset }) => {
          const isSelected = selectedNote === note
          const isDetected = detectedNote?.name === note.replace('#', '♯')
          const attemptKey = `${note}-${selectedOctave}`
          const hasAttempt = session.noteAttempts.has(attemptKey)

          return (
            <button
              key={note}
              onClick={() => playNote(note)}
              className={`absolute top-0 w-8 h-24 rounded-b-lg z-10 transition-all duration-100
                ${isSelected
                  ? 'bg-gradient-to-b from-indigo-600 to-violet-700 shadow-lg'
                  : isDetected
                    ? 'bg-gradient-to-b from-rose-600 to-red-700'
                    : hasAttempt
                      ? 'bg-gradient-to-b from-emerald-700 to-green-800'
                      : 'bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800'
                }`}
              style={{ left: `${offset * 48 + 32}px` }}
            >
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-white font-medium">
                {note}
              </span>
            </button>
          )
        })}

        {isNoteMatching() && (
          <div className="absolute -inset-2 rounded-xl border-4 border-emerald-500 animate-pulse pointer-events-none" />
        )}
      </div>
    )
  }

  // Render session stats panel
  const renderSessionStats = () => (
    <div className="bg-slate-800/60 rounded-xl p-4 mb-6 border border-slate-700/60 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          Acoustic Session Stats
        </h3>
        <button
          onClick={saveSession}
          disabled={isSaving || session.noteAttempts.size === 0}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            isSaving || session.noteAttempts.size === 0
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/25'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving...' : 'Save Session'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="text-center p-2 rounded-lg bg-slate-900/40">
          <p className="text-2xl font-bold text-white">{sessionStats.notesAttempted}</p>
          <p className="text-xs text-slate-400">Notes Attempted</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-900/40">
          <p className={`text-2xl font-bold ${sessionStats.avgTargetAccuracy >= 75 ? 'text-emerald-400' : sessionStats.avgTargetAccuracy >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
            {sessionStats.avgTargetAccuracy.toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400">Target Accuracy</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-900/40">
          <p className={`text-2xl font-bold ${sessionStats.avgVoiceStability >= 75 ? 'text-emerald-400' : sessionStats.avgVoiceStability >= 50 ? 'text-amber-400' : 'text-slate-300'}`}>
            {sessionStats.avgVoiceStability.toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400">Voice Stability</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-900/40">
          <p className="text-2xl font-bold text-white">
            {Math.floor(sessionStats.totalDuration / 60)}:{(sessionStats.totalDuration % 60).toString().padStart(2, '0')}
          </p>
          <p className="text-xs text-slate-400">Practice Time</p>
        </div>
      </div>

      {/* Pitch Tendency Indicator */}
      {sessionStats.notesAttempted > 0 && sessionStats.overallDirection !== 'on-target' && (
        <div className={`mt-3 text-center text-xs px-3 py-1.5 rounded-lg font-medium ${
          sessionStats.overallDirection === 'sharp' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
        }`}>
          Vocal Tendency: singing {sessionStats.overallDirection === 'sharp' ? '↑ sharp' : '↓ flat'} on average
        </div>
      )}

      {saveMessage && (
        <div className={`mt-3 text-center text-sm font-medium ${
          saveMessage.includes('saved') ? 'text-emerald-400' : 'text-amber-400'
        }`}>
          {saveMessage}
        </div>
      )}

      {/* Active Attempt Live Feedback */}
      {currentAttempt && currentAttempt.samples.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400">
              Target: <span className="text-white font-semibold">{currentAttempt.noteName}{currentAttempt.octave}</span> ({currentAttempt.targetFrequency.toFixed(1)} Hz)
            </p>
            {(() => {
              const live = calculateNoteMetrics(currentAttempt)
              return (
                <div className="text-xs font-medium">
                  {live.maeCents <= 15 ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> In-Tune (MAE: {live.maeCents}¢)
                    </span>
                  ) : (
                    <span className={live.pitchDirection === 'sharp' ? 'text-amber-400' : 'text-sky-400'}>
                      {live.pitchBiasCents > 0 ? `+${live.pitchBiasCents}¢ sharp` : `${live.pitchBiasCents}¢ flat`} (MAE: {live.maeCents}¢)
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Frames: {currentAttempt.samples.length}</span>
            <span className="text-emerald-400">In-Tune: {currentAttempt.samples.filter(s => s.isInTune).length} ({currentAttempt.samples.length > 0 ? Math.round((currentAttempt.samples.filter(s => s.isInTune).length / currentAttempt.samples.length) * 100) : 0}%)</span>
            <span>In-Window (±50¢): {currentAttempt.samples.filter(s => s.isInWindow).length}</span>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {variant === 'floating' ? (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-[76px] w-12 h-12 lg:bottom-6 lg:right-24 lg:w-14 lg:h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-300 z-50"
          style={{ boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)' }}
          title="Pitch Perfect"
        >
          <Music className="w-5 h-5 lg:w-6 lg:h-6" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-4 px-6 py-5 bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl transition-all duration-300 w-full group border border-white/10"
          style={{ boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Music className="w-6 h-6" />
          </div>
          <div className="text-left flex-1">
            <p className="font-semibold text-lg">Pitch Perfect</p>
            <p className="text-sm text-white/70">Acoustic ear training & vocal precision</p>
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
                : 'w-full h-full rounded-none lg:w-[90vw] lg:max-w-3xl lg:h-[85vh] lg:max-h-[780px] lg:rounded-3xl'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-600/20 via-violet-600/20 to-purple-600/20 border-b border-slate-700/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg">
                  <Music className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Pitch Perfect</h2>
                  <p className="text-sm text-slate-400">Click a note, listen to the pitch, then match with your voice!</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowProgress(!showProgress)}
                  className={`p-2.5 rounded-xl transition-colors ${
                    showProgress ? 'bg-indigo-600/30 text-indigo-400' : 'hover:bg-white/10 text-slate-400'
                  }`}
                  title="View Progress"
                >
                  <TrendingUp className="w-5 h-5" />
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

            {/* Main Content */}
            <div className="p-6 h-[calc(100%-72px)] overflow-y-auto">
              {/* Session Stats */}
              {session.isActive && renderSessionStats()}

              {/* Mode Toggle */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex bg-slate-800/50 rounded-2xl p-1.5 border border-slate-700/50">
                  <button
                    onClick={() => setMode('wheel')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      mode === 'wheel'
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Circle className="w-4 h-4" />
                    Wheel
                  </button>
                  <button
                    onClick={() => setMode('keyboard')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      mode === 'keyboard'
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Piano className="w-4 h-4" />
                    Keyboard
                  </button>
                </div>
              </div>

              {/* Mic Sensitivity & Start/Stop */}
              <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
                <span className="text-sm text-slate-400">Mic Sensitivity:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseInt(e.target.value))}
                  className="w-44 h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-sm text-slate-300 w-8">{sensitivity}</span>
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isListening
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
                  }`}
                >
                  {isListening ? (
                    <>
                      <Mic className="w-4 h-4" />
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      Listening
                    </>
                  ) : (
                    <>
                      <MicOff className="w-4 h-4" />
                      Start Mic
                    </>
                  )}
                </button>
                {sharedMicStream && (
                  <span className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-lg">
                    Class mic linked
                  </span>
                )}
              </div>

              {/* Needle Meter */}
              {isListening && renderMeter()}

              {/* Scrolling Pitch Contour Graph */}
              {isListening && renderPitchContour()}

              {/* Detected Note Display */}
              <div className="text-center mb-6">
                <div className="inline-flex items-baseline gap-2 min-h-[50px]">
                  {detectedNote ? (
                    <>
                      {NOTE_STRINGS.map((note, index) => {
                        const isActive = detectedNote.name === note
                        const detectedIndex = NOTE_STRINGS.indexOf(detectedNote.name as (typeof NOTE_STRINGS)[number])
                        const isAdjacent = (
                          index === (detectedIndex + 1) % 12 ||
                          index === (detectedIndex - 1 + 12) % 12
                        )

                        if (!isActive && !isAdjacent) return null

                        return (
                          <span
                            key={note}
                            className={`transition-all duration-200 ${
                              isActive
                                ? isNoteMatching()
                                  ? 'text-5xl font-bold text-emerald-400 scale-105'
                                  : 'text-5xl font-bold text-rose-400'
                                : 'text-2xl text-slate-600'
                            }`}
                          >
                            {note}
                            <sub className="text-lg ml-0.5">{detectedNote.octave}</sub>
                          </span>
                        )
                      })}
                    </>
                  ) : (
                    <span className="text-4xl text-slate-600">--</span>
                  )}
                </div>

                {detectedNote && (
                  <div className="mt-2 text-sm space-x-4">
                    <span className="text-slate-400">
                      {detectedNote.frequency.toFixed(1)} <span className="text-xs">Hz</span>
                    </span>
                    <span className={
                      Math.abs(detectedNote.cents) <= IN_TUNE_THRESHOLD
                        ? 'text-emerald-400 font-semibold'
                        : detectedNote.cents > 0
                          ? 'text-amber-400'
                          : 'text-sky-400'
                    }>
                      {detectedNote.cents > 0 ? '+' : ''}{detectedNote.cents} cents
                    </span>
                    {isNoteMatching() && (
                      <span className="text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                        In Tune!
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Note Selector */}
              <div className="mb-6">
                {mode === 'wheel' ? renderWheel() : renderKeyboard()}
              </div>

              {/* Octave Selector (2-6: covering full vocal range) */}
              <div className="flex justify-center">
                <div className="inline-flex bg-slate-800/50 rounded-2xl p-2 border border-slate-700/50 gap-1.5">
                  {AVAILABLE_OCTAVES.map((octave) => (
                    <button
                      key={octave}
                      onClick={() => setSelectedOctave(octave)}
                      className={`w-10 h-10 rounded-xl text-sm font-semibold transition-all duration-200 ${
                        selectedOctave === octave
                          ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg scale-105'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      {octave}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Note Info */}
              {selectedNote && (
                <div className="mt-4 text-center">
                  <p className="text-slate-400 text-sm">
                    Target: <span className="text-white font-semibold">{selectedNote}{selectedOctave}</span> ({getNoteFrequency(selectedNote, selectedOctave).toFixed(1)} Hz)
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Script
        src="/vendor/aubio.min.js"
        strategy="lazyOnload"
        onLoad={() => setAubioLoaded(true)}
        onError={() => {
          const fallback = document.createElement('script')
          fallback.src = 'https://cdn.jsdelivr.net/npm/aubiojs@0.1.1/build/aubio.min.js'
          fallback.onload = () => setAubioLoaded(true)
          document.head.appendChild(fallback)
        }}
      />
    </>
  )
}
