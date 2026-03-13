'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Music, X, Maximize2, Minimize2, Circle, Piano, Mic, MicOff, TrendingUp, Save } from 'lucide-react'
import Script from 'next/script'
import { getSharedMicStream, subscribeSharedMicStream } from '@/lib/shared-mic-stream'

// ============================================================================
// TUNER LOGIC - Exact port from original tuner.js
// ============================================================================

const NOTE_STRINGS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const NOTE_STRINGS_DISPLAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Constants from original tuner.js
const MIDDLE_A = 440
const SEMITONE = 69
const BUFFER_SIZE = 4096

// In-tune threshold (cents)
const IN_TUNE_THRESHOLD = 15

// Maximum semitone range to track (±4 semitones = major third)
// Notes outside this range are likely mistakes, not actual attempts
const TRACKING_RANGE_SEMITONES = 4

declare global {
  interface Window {
    aubio: () => Promise<any>
  }
}

interface DetectedNote {
  name: string
  value: number
  cents: number
  octave: number
  frequency: number
}

// ============================================================================
// SESSION TRACKING TYPES
// ============================================================================

interface NoteAttempt {
  noteName: string
  octave: number
  targetFrequency: number
  startTime: number
  samples: PitchSample[]
  // Legacy fields (kept for API compatibility)
  pitchAccuracy: number
  pitchOnsetSpeedMs: number
  pitchStability: number
  inTuneSustainMs: number
  avgDetectedFrequency: number
  avgCentsDeviation: number
  maxCentsDeviation: number
  minCentsDeviation: number
  attemptNumber: number
  isComplete: boolean
  // NEW: Separate metrics for singing students
  targetAccuracy: number        // How close to the target note (0-100, considers semitones)
  voiceStability: number        // How steady the voice is regardless of target (0-100)
  avgSemitoneDeviation: number  // Average semitones away from target (can be negative = flat)
  mostSungNote: string | null   // The note they sang most often
  mostSungOctave: number | null // The octave they sang most often
  pitchDirection: 'sharp' | 'flat' | 'on-target' // Tendency
  timeToFirstSound: number      // Time until any pitch was detected (ms)
}

interface BasePitchSample {
  frequency: number
  cents: number
  timestamp: number
  isInTune: boolean
}

interface PitchSample extends BasePitchSample {
  // New fields to track what was actually sung (added in handleSampleRecorded)
  detectedNoteName: string
  detectedOctave: number
  detectedNoteValue: number
  // Distance from target (in semitones, can be negative)
  semitoneDeviationFromTarget: number
  // Cents deviation from the detected note's perfect pitch
  centsFromDetectedNote: number
}

interface SessionMetrics {
  startedAt: Date | null
  endedAt: Date | null
  noteAttempts: Map<string, NoteAttempt>
  isActive: boolean
}

// ============================================================================
// PITCH DETECTION HELPERS
// ============================================================================

function getNote(frequency: number): number {
  const note = 12 * (Math.log(frequency / MIDDLE_A) / Math.log(2))
  return Math.round(note) + SEMITONE
}

function getStandardFrequency(note: number): number {
  return MIDDLE_A * Math.pow(2, (note - SEMITONE) / 12)
}

function getCents(frequency: number, note: number): number {
  return Math.floor(
    (1200 * Math.log(frequency / getStandardFrequency(note))) / Math.log(2)
  )
}

function getMeterDegree(cents: number): number {
  return Math.round((cents / 250) * 45)
}

function getNoteFrequency(noteName: string, octave: number): number {
  const noteIndex = NOTE_STRINGS_DISPLAY.indexOf(noteName)
  if (noteIndex === -1) return 440
  const note = (octave + 1) * 12 + noteIndex
  return getStandardFrequency(note)
}

// ============================================================================
// METRICS CALCULATION HELPERS
// ============================================================================

function calculateNoteMetrics(attempt: NoteAttempt): NoteAttempt {
  const samples = attempt.samples
  if (samples.length === 0) return attempt

  // === CENTS DEVIATION (from detected note's perfect pitch) ===
  const centsDeviations = samples.map(s => s.centsFromDetectedNote)
  const avgCentsDeviation = centsDeviations.reduce((a, b) => a + b, 0) / centsDeviations.length
  const maxCentsDeviation = Math.max(...centsDeviations.map(Math.abs))
  const minCentsDeviation = Math.min(...centsDeviations.map(Math.abs))

  // === SEMITONE DEVIATION (from target note) ===
  const semitoneDeviations = samples.map(s => s.semitoneDeviationFromTarget)
  const avgSemitoneDeviation = semitoneDeviations.reduce((a, b) => a + b, 0) / semitoneDeviations.length

  // === MOST SUNG NOTE (mode of detected notes) ===
  const noteCount: Record<string, number> = {}
  samples.forEach(s => {
    const key = `${s.detectedNoteName}-${s.detectedOctave}`
    noteCount[key] = (noteCount[key] || 0) + 1
  })
  const mostSungKey = Object.entries(noteCount).sort((a, b) => b[1] - a[1])[0]?.[0]
  const [mostSungNote, mostSungOctaveStr] = mostSungKey?.split('-') || [null, null]
  const mostSungOctave = mostSungOctaveStr ? parseInt(mostSungOctaveStr) : null

  // === PITCH DIRECTION (tendency) ===
  const sharpCount = semitoneDeviations.filter(d => d > 0).length
  const flatCount = semitoneDeviations.filter(d => d < 0).length
  const onTargetCount = semitoneDeviations.filter(d => d === 0).length
  let pitchDirection: 'sharp' | 'flat' | 'on-target' = 'on-target'
  if (sharpCount > flatCount && sharpCount > onTargetCount) pitchDirection = 'sharp'
  else if (flatCount > sharpCount && flatCount > onTargetCount) pitchDirection = 'flat'

  // === TARGET ACCURACY (NEW - considers semitone distance) ===
  // 100% = hit target note with <15 cents deviation
  // Decreases by 25% per semitone away, plus cents penalty
  // This means singing 1 semitone off = max 75%, 2 semitones = max 50%, etc.
  const avgAbsSemitones = Math.abs(avgSemitoneDeviation)
  const semitonePenalty = avgAbsSemitones * 25 // 25% per semitone
  const avgAbsCents = Math.abs(avgCentsDeviation)
  const centsPenalty = Math.min(25, avgAbsCents * 0.5) // Max 25% for cents, 0.5% per cent
  const targetAccuracy = Math.max(0, Math.min(100, 100 - semitonePenalty - centsPenalty))

  // === VOICE STABILITY (NEW - independent of target) ===
  // Measures how steady their pitch is, regardless of which note they're singing
  // Based on variance of their detected frequencies
  const frequencies = samples.map(s => s.frequency)
  const avgFreq = frequencies.reduce((a, b) => a + b, 0) / frequencies.length
  const freqVariance = frequencies.reduce((sum, f) => sum + Math.pow(f - avgFreq, 2), 0) / frequencies.length
  const freqStdDev = Math.sqrt(freqVariance)
  // Convert to percentage: 0 stdDev = 100%, 50Hz stdDev = 0%
  // (50Hz stdDev would mean their pitch is all over the place)
  const voiceStability = Math.max(0, Math.min(100, 100 - (freqStdDev * 2)))

  // === LEGACY: Pitch Accuracy (old formula for API compatibility) ===
  const pitchAccuracy = Math.max(0, Math.min(100, 100 - (Math.abs(avgCentsDeviation) * 2)))

  // === PITCH ONSET SPEED (time to first in-tune sample) ===
  const firstInTuneIndex = samples.findIndex(s => s.isInTune)
  const pitchOnsetSpeedMs = firstInTuneIndex >= 0
    ? samples[firstInTuneIndex].timestamp - attempt.startTime
    : samples.length > 0 ? samples[samples.length - 1].timestamp - attempt.startTime : 5000

  // === TIME TO FIRST SOUND ===
  const timeToFirstSound = samples.length > 0 ? samples[0].timestamp - attempt.startTime : 5000

  // === LEGACY: Pitch Stability (old formula for API compatibility) ===
  const variance = centsDeviations.reduce((sum, c) => sum + Math.pow(c - avgCentsDeviation, 2), 0) / centsDeviations.length
  const stdDev = Math.sqrt(variance)
  const pitchStability = Math.max(0, Math.min(100, 100 - (stdDev * 3.33)))

  // === IN-TUNE SUSTAIN ===
  let maxSustain = 0
  let currentSustain = 0
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].isInTune && samples[i - 1].isInTune) {
      currentSustain += samples[i].timestamp - samples[i - 1].timestamp
      maxSustain = Math.max(maxSustain, currentSustain)
    } else if (!samples[i].isInTune) {
      currentSustain = 0
    }
  }
  const inTuneSustainMs = maxSustain

  // === AVERAGE DETECTED FREQUENCY ===
  const avgDetectedFrequency = avgFreq

  return {
    ...attempt,
    // Legacy metrics
    pitchAccuracy,
    pitchOnsetSpeedMs,
    pitchStability,
    inTuneSustainMs,
    avgDetectedFrequency,
    avgCentsDeviation,
    maxCentsDeviation,
    minCentsDeviation,
    isComplete: true,
    // New singer-focused metrics
    targetAccuracy,
    voiceStability,
    avgSemitoneDeviation,
    mostSungNote,
    mostSungOctave,
    pitchDirection,
    timeToFirstSound,
  }
}

// ============================================================================
// CUSTOM HOOK - usePitchDetection
// ============================================================================

interface UsePitchDetectionOptions {
  sensitivity: number
  externalMicStream?: MediaStream | null
  onNoteDetected?: (note: DetectedNote) => void
  onSampleRecorded?: (sample: BasePitchSample) => void
}

function usePitchDetection({ sensitivity, externalMicStream, onNoteDetected, onSampleRecorded }: UsePitchDetectionOptions) {
  const [isListening, setIsListening] = useState(false)
  const [aubioLoaded, setAubioLoaded] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const pitchDetectorRef = useRef<any>(null)
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

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
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
        // Clone the class mic track so tuner analysis never mutates the live class stream.
        inputStream = new MediaStream([externalAudioTrack.clone()])
      } else {
        inputStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }

      streamRef.current = inputStream

      const source = audioContextRef.current.createMediaStreamSource(inputStream)
      source.connect(analyserRef.current)
      analyserRef.current.connect(scriptProcessorRef.current)
      scriptProcessorRef.current.connect(audioContextRef.current.destination)

      scriptProcessorRef.current.addEventListener('audioprocess', (event: AudioProcessingEvent) => {
        if (sensitivityRef.current === 0) return

        const input = event.inputBuffer.getChannelData(0)
        let sum = 0.0
        for (let i = 0; i < input.length; ++i) {
          sum += input[i] * input[i]
        }
        const rms = Math.sqrt(sum / input.length)

        const minThresh = 0.001
        const maxThresh = 0.1
        const threshold = maxThresh - ((sensitivityRef.current / 100) * (maxThresh - minThresh))
        if (rms < threshold) return

        const frequency = pitchDetectorRef.current.do(input)
        if (frequency) {
          const note = getNote(frequency)
          const cents = getCents(frequency, note)
          const detectedNote = {
            name: NOTE_STRINGS[note % 12],
            value: note,
            cents,
            octave: parseInt(String(note / 12)) - 1,
            frequency,
          }

          if (onNoteDetectedRef.current) {
            onNoteDetectedRef.current(detectedNote)
          }

          // Record sample for metrics
          if (onSampleRecordedRef.current) {
            onSampleRecordedRef.current({
              frequency,
              cents,
              timestamp: Date.now(),
              isInTune: Math.abs(cents) <= IN_TUNE_THRESHOLD
            })
          }
        }
      })

      setIsListening(true)
    } catch (error: any) {
      console.error('Microphone error:', error)
      alert(error.name + ': ' + error.message)
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
  const [isPlaying, setIsPlaying] = useState(false)
  const [sensitivity, setSensitivity] = useState(50)
  const [detectedNote, setDetectedNote] = useState<DetectedNote | null>(null)
  const [showProgress, setShowProgress] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [sharedMicStream, setSharedMicStream] = useState<MediaStream | null>(() => getSharedMicStream())

  // Session tracking state
  const [session, setSession] = useState<SessionMetrics>({
    startedAt: null,
    endedAt: null,
    noteAttempts: new Map(),
    isActive: false
  })
  const [currentAttempt, setCurrentAttempt] = useState<NoteAttempt | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sessionRef = useRef(session)

  // Keep session ref in sync
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    return subscribeSharedMicStream(setSharedMicStream)
  }, [])

  const availableOctaves = [0, 2, 3, 4, 5, 6, 7, 8]

  // Handle sample recording for current attempt - RECORDS PITCHES WITHIN RANGE
  const handleSampleRecorded = useCallback((sample: BasePitchSample) => {
    if (!currentAttempt || !selectedNote || !detectedNote) return

    // Calculate target note value for comparison
    const targetNoteName = selectedNote.replace('#', '♯')
    const targetNoteIndex = NOTE_STRINGS.indexOf(targetNoteName)
    const targetNoteValue = (selectedOctave + 1) * 12 + targetNoteIndex

    // Calculate semitone deviation from target
    const semitoneDeviationFromTarget = detectedNote.value - targetNoteValue

    // RANGE FILTER: Only track notes within ±TRACKING_RANGE_SEMITONES of target
    // Notes outside this range are likely mistakes, background noise, or speech
    if (Math.abs(semitoneDeviationFromTarget) > TRACKING_RANGE_SEMITONES) {
      return // Skip this sample - too far from target
    }

    // Enrich sample with detected note info
    const enrichedSample: PitchSample = {
      ...sample,
      detectedNoteName: detectedNote.name,
      detectedOctave: detectedNote.octave,
      detectedNoteValue: detectedNote.value,
      semitoneDeviationFromTarget,
      centsFromDetectedNote: detectedNote.cents,
      // Update isInTune to consider being on the target note AND within cents threshold
      isInTune: semitoneDeviationFromTarget === 0 && Math.abs(detectedNote.cents) <= IN_TUNE_THRESHOLD,
    }

    setCurrentAttempt(prev => {
      if (!prev) return prev
      return {
        ...prev,
        samples: [...prev.samples, enrichedSample]
      }
    })
  }, [currentAttempt, selectedNote, detectedNote, selectedOctave])

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

  // Start session when first note is played
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

    const newAttempt: NoteAttempt = {
      noteName,
      octave,
      targetFrequency: getNoteFrequency(noteName, octave),
      startTime: Date.now(),
      samples: [],
      // Legacy metrics
      pitchAccuracy: 0,
      pitchOnsetSpeedMs: 0,
      pitchStability: 0,
      inTuneSustainMs: 0,
      avgDetectedFrequency: 0,
      avgCentsDeviation: 0,
      maxCentsDeviation: 0,
      minCentsDeviation: 0,
      attemptNumber: existingAttempt ? existingAttempt.attemptNumber + 1 : 1,
      isComplete: false,
      // New singer-focused metrics
      targetAccuracy: 0,
      voiceStability: 0,
      avgSemitoneDeviation: 0,
      mostSungNote: null,
      mostSungOctave: null,
      pitchDirection: 'on-target',
      timeToFirstSound: 0,
    }

    setCurrentAttempt(newAttempt)
  }, [session, startSession])

  // Complete current note attempt and save if better
  const completeNoteAttempt = useCallback(() => {
    if (!currentAttempt || currentAttempt.samples.length === 0) {
      setCurrentAttempt(null)
      return
    }

    const completedAttempt = calculateNoteMetrics(currentAttempt)
    const key = `${completedAttempt.noteName}-${completedAttempt.octave}`

    setSession(prev => {
      const existingAttempt = prev.noteAttempts.get(key)

      // Only save if this attempt is better
      if (!existingAttempt || completedAttempt.pitchAccuracy > existingAttempt.pitchAccuracy) {
        const newAttempts = new Map(prev.noteAttempts)
        newAttempts.set(key, completedAttempt)
        return { ...prev, noteAttempts: newAttempts }
      }

      return prev
    })

    setCurrentAttempt(null)
  }, [currentAttempt])

  // Save session to database
  const saveSession = useCallback(async () => {
    if (!session.isActive || session.noteAttempts.size === 0) {
      setSaveMessage('No notes to save')
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const noteMetrics = Array.from(session.noteAttempts.values()).map(attempt => ({
        // Legacy metrics
        noteName: attempt.noteName,
        octave: attempt.octave,
        targetFrequency: attempt.targetFrequency,
        pitchAccuracy: attempt.pitchAccuracy,
        pitchOnsetSpeedMs: attempt.pitchOnsetSpeedMs,
        pitchStability: attempt.pitchStability,
        inTuneSustainMs: attempt.inTuneSustainMs,
        avgDetectedFrequency: attempt.avgDetectedFrequency,
        avgCentsDeviation: attempt.avgCentsDeviation,
        maxCentsDeviation: attempt.maxCentsDeviation,
        minCentsDeviation: attempt.minCentsDeviation,
        attemptNumber: attempt.attemptNumber,
        // New singer-focused metrics
        targetAccuracy: attempt.targetAccuracy,
        voiceStability: attempt.voiceStability,
        avgSemitoneDeviation: attempt.avgSemitoneDeviation,
        mostSungNote: attempt.mostSungNote,
        mostSungOctave: attempt.mostSungOctave,
        pitchDirection: attempt.pitchDirection,
        timeToFirstSound: attempt.timeToFirstSound,
        sampleCount: attempt.samples.length,
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
      setIsPlaying(false)
      setSelectedNote(null)
      stopListening()
      completeNoteAttempt()
    }
  }, [isOpen, stopListening, completeNoteAttempt])

  // Complete attempt when note changes
  useEffect(() => {
    if (currentAttempt && selectedNote !== currentAttempt.noteName) {
      completeNoteAttempt()
    }
  }, [selectedNote, currentAttempt, completeNoteAttempt])

  // Get audio file path
  const getAudioPath = (note: string, octave: number) => {
    const actualOctave = octave === 1 ? 2 : octave
    if (actualOctave === 0) {
      const noteFile = note.replace('#', 'SHARP').replace('♯', 'SHARP').toUpperCase()
      return `/chromatic-tuner/octave0/${noteFile}0.mp3`
    } else {
      const noteFile = note.replace('#', 'sharp').replace('♯', 'sharp').toLowerCase()
      return `/chromatic-tuner/octave${actualOctave}/${noteFile}.mp3`
    }
  }

  // Play selected note
  const playNote = (note: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    // Complete previous attempt before starting new one
    if (currentAttempt && currentAttempt.noteName !== note) {
      completeNoteAttempt()
    }

    if (selectedNote === note && isPlaying) {
      setIsPlaying(false)
      setSelectedNote(null)
      completeNoteAttempt()
      return
    }

    const audio = new Audio(getAudioPath(note, selectedOctave))
    audioRef.current = audio
    audio.play()
    setSelectedNote(note)
    setIsPlaying(true)

    // Start tracking this note attempt
    startNoteAttempt(note, selectedOctave)

    audio.onended = () => {
      setIsPlaying(false)
    }
  }

  // Toggle play/pause
  const togglePlay = () => {
    if (!selectedNote) return

    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
    } else if (selectedNote) {
      const audio = new Audio(getAudioPath(selectedNote, selectedOctave))
      audioRef.current = audio
      audio.play()
      setIsPlaying(true)
      audio.onended = () => setIsPlaying(false)
    }
  }

  // Check if detected note matches selected note
  const isNoteMatching = () => {
    if (!detectedNote || !selectedNote) return false
    const cleanSelected = selectedNote.replace('#', '♯')
    return detectedNote.name === cleanSelected && detectedNote.octave === selectedOctave
  }

  // Calculate meter rotation
  const meterDegree = detectedNote ? getMeterDegree(detectedNote.cents) : 0

  // Get session stats - now with separate accuracy and stability
  const sessionStats = useMemo(() => {
    const attempts = Array.from(session.noteAttempts.values())
    const completedAttempts = attempts.filter(a => a.isComplete)

    return {
      notesAttempted: session.noteAttempts.size,
      // New: separate target accuracy and voice stability
      avgTargetAccuracy: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, n) => sum + n.targetAccuracy, 0) / completedAttempts.length
        : 0,
      avgVoiceStability: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, n) => sum + n.voiceStability, 0) / completedAttempts.length
        : 0,
      // Legacy: combined accuracy
      avgAccuracy: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, n) => sum + n.pitchAccuracy, 0) / completedAttempts.length
        : 0,
      totalDuration: session.startedAt
        ? Math.round((Date.now() - session.startedAt.getTime()) / 1000)
        : 0,
      // Pitch tendency across session
      overallDirection: (() => {
        if (completedAttempts.length === 0) return 'on-target'
        const avgSemitones = completedAttempts.reduce((sum, n) => sum + n.avgSemitoneDeviation, 0) / completedAttempts.length
        if (avgSemitones > 0.3) return 'sharp'
        if (avgSemitones < -0.3) return 'flat'
        return 'on-target'
      })() as 'sharp' | 'flat' | 'on-target'
    }
  }, [session])

  // Render the pitch meter
  const renderMeter = () => (
    <div className="relative w-48 h-24 mx-auto mb-4">
      <div className="absolute inset-0 flex items-end justify-center">
        <div className="w-full h-full relative">
          {[...Array(11)].map((_, i) => {
            const deg = i * 9 - 45
            const isStrong = i % 5 === 0
            return (
              <div
                key={i}
                className={`absolute bottom-0 left-1/2 origin-bottom ${
                  isStrong ? 'w-0.5 h-5 bg-slate-400' : 'w-px h-3 bg-slate-600'
                }`}
                style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
              />
            )
          })}
          <div
            className="absolute bottom-0 left-1/2 w-0.5 h-20 bg-red-500 origin-bottom transition-transform duration-150"
            style={{ transform: `translateX(-50%) rotate(${meterDegree}deg)` }}
          />
          <div className="absolute bottom-0 left-1/2 w-3 h-3 bg-slate-300 rounded-full -translate-x-1/2 translate-y-1/2" />
        </div>
      </div>
      <div className="absolute bottom-0 left-4 text-xs text-slate-500">♭</div>
      <div className="absolute bottom-0 right-4 text-xs text-slate-500">♯</div>
    </div>
  )

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
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white scale-110 shadow-lg shadow-blue-500/50'
                : isDetected
                  ? 'bg-gradient-to-br from-red-500 to-red-600 text-white scale-105'
                  : hasAttempt
                    ? 'bg-gradient-to-br from-green-600 to-green-700 text-white'
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

      <button
        onClick={togglePlay}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200
          ${selectedNote
            ? 'bg-gradient-to-br from-blue-500 to-purple-600 hover:scale-105 cursor-pointer'
            : 'bg-slate-700 cursor-not-allowed'
          }`}
      >
        {isPlaying ? (
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {isNoteMatching() && (
        <div className="absolute inset-0 rounded-full border-4 border-green-500 animate-pulse pointer-events-none" />
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
                    ? 'bg-gradient-to-b from-blue-400 to-blue-500 shadow-inner'
                    : isDetected
                      ? 'bg-gradient-to-b from-red-400 to-red-500'
                      : hasAttempt
                        ? 'bg-gradient-to-b from-green-300 to-green-400'
                        : 'bg-gradient-to-b from-white to-slate-100 hover:from-slate-100 hover:to-slate-200'
                  }`}
              >
                <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium
                  ${isSelected || isDetected ? 'text-white' : hasAttempt ? 'text-green-800' : 'text-slate-600'}`}>
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
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg'
                  : isDetected
                    ? 'bg-gradient-to-b from-red-600 to-red-700'
                    : hasAttempt
                      ? 'bg-gradient-to-b from-green-700 to-green-800'
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
          <div className="absolute -inset-2 rounded-xl border-4 border-green-500 animate-pulse pointer-events-none" />
        )}
      </div>
    )
  }

  // Render session stats panel
  const renderSessionStats = () => (
    <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          Session Stats
        </h3>
        <button
          onClick={saveSession}
          disabled={isSaving || session.noteAttempts.size === 0}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            isSaving || session.noteAttempts.size === 0
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          <Save className="w-3 h-3" />
          {isSaving ? 'Saving...' : 'Save Session'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{sessionStats.notesAttempted}</p>
          <p className="text-xs text-slate-400">Notes</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${sessionStats.avgTargetAccuracy >= 70 ? 'text-green-400' : sessionStats.avgTargetAccuracy >= 40 ? 'text-yellow-400' : 'text-white'}`}>
            {sessionStats.avgTargetAccuracy.toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400">Target Acc</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${sessionStats.avgVoiceStability >= 70 ? 'text-green-400' : sessionStats.avgVoiceStability >= 40 ? 'text-yellow-400' : 'text-white'}`}>
            {sessionStats.avgVoiceStability.toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400">Stability</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">
            {Math.floor(sessionStats.totalDuration / 60)}:{(sessionStats.totalDuration % 60).toString().padStart(2, '0')}
          </p>
          <p className="text-xs text-slate-400">Time</p>
        </div>
      </div>

      {/* Pitch Tendency Indicator */}
      {sessionStats.notesAttempted > 0 && sessionStats.overallDirection !== 'on-target' && (
        <div className={`mt-3 text-center text-xs px-3 py-1.5 rounded-lg ${
          sessionStats.overallDirection === 'sharp' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'
        }`}>
          Tendency: singing {sessionStats.overallDirection === 'sharp' ? '↑ sharp' : '↓ flat'}
        </div>
      )}

      {saveMessage && (
        <div className={`mt-3 text-center text-sm ${
          saveMessage.includes('saved') ? 'text-green-400' : 'text-yellow-400'
        }`}>
          {saveMessage}
        </div>
      )}

      {currentAttempt && currentAttempt.samples.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400">Target: <span className="text-white font-medium">{currentAttempt.noteName}{currentAttempt.octave}</span></p>
            {(() => {
              // Calculate live stats from current samples
              const samples = currentAttempt.samples
              if (samples.length === 0) return null

              // Find most sung note
              const noteCount: Record<string, number> = {}
              samples.forEach(s => {
                const key = `${s.detectedNoteName}${s.detectedOctave}`
                noteCount[key] = (noteCount[key] || 0) + 1
              })
              const mostSung = Object.entries(noteCount).sort((a, b) => b[1] - a[1])[0]?.[0]

              // Calculate average semitone deviation
              const avgSemitones = samples.reduce((sum, s) => sum + s.semitoneDeviationFromTarget, 0) / samples.length

              const isOnTarget = Math.abs(avgSemitones) < 0.5
              const direction = avgSemitones > 0.5 ? 'sharp' : avgSemitones < -0.5 ? 'flat' : 'on-target'

              return (
                <div className="text-xs">
                  {isOnTarget ? (
                    <span className="text-green-400 font-medium">On target!</span>
                  ) : (
                    <span className={direction === 'sharp' ? 'text-orange-400' : 'text-blue-400'}>
                      Singing {mostSung} ({Math.abs(avgSemitones).toFixed(1)} semitones {direction})
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-slate-300">Samples: {currentAttempt.samples.length}</span>
            <span className="text-green-400">
              In-tune: {currentAttempt.samples.filter(s => s.isInTune).length}
            </span>
            <span className="text-slate-300">
              In range: {currentAttempt.samples.filter(s => Math.abs(s.semitoneDeviationFromTarget) <= 1).length}
            </span>
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
            <p className="text-sm text-white/70">Modern ear training</p>
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
                : 'w-full h-full rounded-none lg:w-[90vw] lg:max-w-3xl lg:h-[85vh] lg:max-h-[750px] lg:rounded-3xl'
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
                  <p className="text-sm text-slate-400">Click a note, play it, and match your voice!</p>
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
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
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
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
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

              {/* Mic Sensitivity */}
              <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
                <span className="text-sm text-slate-400">Mic Sensitivity:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseInt(e.target.value))}
                  className="w-48 h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-sm text-slate-300 w-8">{sensitivity}</span>
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isListening
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
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

              {/* Pitch Meter */}
              {isListening && renderMeter()}

              {/* Detected Note Display */}
              <div className="text-center mb-6">
                <div className="inline-flex items-baseline gap-2 min-h-[60px]">
                  {detectedNote ? (
                    <>
                      {NOTE_STRINGS.map((note, index) => {
                        const isActive = detectedNote.name === note
                        const detectedIndex = NOTE_STRINGS.indexOf(detectedNote.name)
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
                                ? 'text-5xl font-bold text-red-500'
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
                      detectedNote.cents > 0
                        ? 'text-orange-400'
                        : detectedNote.cents < 0
                          ? 'text-blue-400'
                          : 'text-green-400'
                    }>
                      {detectedNote.cents > 0 ? '+' : ''}{detectedNote.cents} cents
                    </span>
                    {isNoteMatching() && (
                      <span className="text-green-400 font-medium">Match!</span>
                    )}
                  </div>
                )}
              </div>

              {/* Note Selector */}
              <div className="mb-8">
                {mode === 'wheel' ? renderWheel() : renderKeyboard()}
              </div>

              {/* Octave Selector */}
              <div className="flex justify-center">
                <div className="inline-flex bg-slate-800/50 rounded-2xl p-2 border border-slate-700/50 gap-1">
                  {availableOctaves.map((octave) => (
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
                <div className="mt-6 text-center">
                  <p className="text-slate-400">
                    Playing: <span className="text-white font-semibold">{selectedNote}{selectedOctave}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Script
        src="https://cdn.jsdelivr.net/npm/aubiojs@0.1.1/build/aubio.min.js"
        strategy="lazyOnload"
        onLoad={() => setAubioLoaded(true)}
      />
    </>
  )
}
