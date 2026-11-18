'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Music, Circle, Piano, Mic, MicOff, TrendingUp, Save, Play, Pause, SkipForward, Volume2, CheckCircle2, RotateCcw } from 'lucide-react'
import { getSharedMicStream, subscribeSharedMicStream } from '@/lib/shared-mic-stream'
import { getNoteFrequency } from '@/lib/pitch-detection'
import { useVoiceTracker, type VoiceFrame } from '@/lib/use-voice-tracker'
import {
  analyzeHeldNote,
  describeHeldNote,
  hzToMidi,
  midiToHz,
  targetAccuracyOf,
  tuningAccuracyOf,
  type NoteFrame,
  type NoteVerdict,
} from '@/lib/pitch-scoring'
import { PitchTrail, type PitchTrailHandle } from '@/components/ui/pitch-trail'
import { SpotlightTour, SpotlightTriggerButton, SpotlightStep } from '@/components/spotlight-tour'
import { useDraggableFab } from '@/lib/use-draggable-fab'
import { Button } from '@/components/ui/button'
import { Panel, Stat } from '@/components/ui/panel'
import { Segmented } from '@/components/ui/segmented'
import { ToolDialog } from '@/components/ui/tool-dialog'

const pitchTourSteps: SpotlightStep[] = [
  {
    target: '[data-tour="pitch-mic-btn"]',
    title: '1. Turn On Your Mic',
    content: 'Tap "Start Mic" so the app can hear you sing. The button turns green when it is listening.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="pitch-note-display"]',
    title: '2. See What You Sang',
    content: 'When you sing, the note you are singing shows up here. The moving line underneath is your voice: keep it inside the green band. Tap a note below first, then sing it back. After each note you get a short tip on how it went.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="pitch-wheel-keyboard"]',
    title: '3. Pick a Note',
    content: 'Tap any note to hear it played, then sing it back. Hold it for a second and the next note starts on its own. Pause or Skip are there if you need them.',
    placement: 'top',
  },
  {
    target: '[data-tour="pitch-octave-selector"]',
    title: '4. Choose Your Range',
    content: 'These numbers set how high or low the notes are. Lower number, deeper notes; higher number, higher notes. Pick whatever feels comfortable for your voice.',
    placement: 'top',
  },
]

// ============================================================================
// NOTE NAMES AND PRACTICE TIMING
// ============================================================================

const NOTE_STRINGS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const NOTE_STRINGS_DISPLAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Maximum semitone range to track (±4 semitones = major third)
// Notes outside this range are likely mistakes, not actual attempts
const TRACKING_RANGE_SEMITONES = 4

// A settled pitch this far from the note (in cents) counts as leaning high or low.
const LEANING_CENTS = 20

// Guided practice: the reference note plays briefly, then the singer answers.
// Holding the match this long moves on to the next note automatically.
const REFERENCE_TONE_MS = 2000
const MATCH_HOLD_MS = 1000
// A gap shorter than this (a breath, a consonant) keeps the hold going.
const MATCH_GAP_TOLERANCE_MS = 350

type PracticeState = 'idle' | 'running' | 'paused' | 'done'

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
  /** Same moment as startTime, on the performance.now() clock the mic uses. */
  startPerf: number
  /** Readings taken while the singer was on or near the note. */
  samples: NoteFrame[]
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
  // Singer-focused metrics
  targetAccuracy: number        // How close to the target note (0-100, considers semitones)
  voiceStability: number        // How steady the voice is; vibrato is not marked down (0-100)
  avgSemitoneDeviation: number  // Settled pitch relative to the target, in semitones (negative = flat)
  mostSungNote: string | null   // The note they sang most often
  mostSungOctave: number | null // The octave they sang most often
  pitchDirection: 'sharp' | 'flat' | 'on-target' // Tendency
  timeToFirstSound: number      // Time until any pitch was detected (ms)
  // What a teacher would say about it, for the screen and the AI coach
  verdict: NoteVerdict | null
  vibratoRateHz: number | null
  vibratoDepthCents: number | null
  scoopCents: number
  driftCents: number
}

interface SessionMetrics {
  startedAt: Date | null
  endedAt: Date | null
  noteAttempts: Map<string, NoteAttempt>
  isActive: boolean
}

// ============================================================================
// METRICS
// ============================================================================
// Note maths lives in lib/pitch-detection, scoring in lib/pitch-scoring, so
// every trainer measures the same way.

function getMeterDegree(cents: number): number {
  return Math.round((cents / 250) * 45)
}

/**
 * Score a finished note. The heavy lifting (settled pitch, steadiness with
 * vibrato set aside, slide-in, drift) is in lib/pitch-scoring.
 */
function calculateNoteMetrics(attempt: NoteAttempt): NoteAttempt {
  const samples = attempt.samples
  if (samples.length === 0) return attempt

  const targetMidi = hzToMidi(attempt.targetFrequency)
  const analysis = analyzeHeldNote(samples, targetMidi)

  // The note they were on most of the time
  const noteCount = new Map<number, number>()
  let maxCentsDeviation = 0
  let minCentsDeviation = Infinity
  for (const sample of samples) {
    const nearest = Math.round(sample.midi)
    noteCount.set(nearest, (noteCount.get(nearest) ?? 0) + 1)
    const cents = Math.abs(sample.midi - nearest) * 100
    maxCentsDeviation = Math.max(maxCentsDeviation, cents)
    minCentsDeviation = Math.min(minCentsDeviation, cents)
  }
  const mostSungMidi = [...noteCount.entries()].sort((a, b) => b[1] - a[1])[0][0]

  let pitchDirection: 'sharp' | 'flat' | 'on-target' = 'on-target'
  if (analysis.deviationCents > LEANING_CENTS) pitchDirection = 'sharp'
  else if (analysis.deviationCents < -LEANING_CENTS) pitchDirection = 'flat'

  const timeToFirstSound = Math.max(0, samples[0].t - attempt.startPerf)

  return {
    ...attempt,
    // Legacy metrics
    pitchAccuracy: tuningAccuracyOf(analysis.centsFromNearest),
    pitchOnsetSpeedMs: Math.round(timeToFirstSound + (analysis.timeToInTuneMs ?? analysis.durationMs)),
    pitchStability: analysis.steadiness,
    inTuneSustainMs: Math.round(analysis.inTuneSustainMs),
    avgDetectedFrequency: midiToHz(analysis.centerMidi),
    avgCentsDeviation: analysis.centsFromNearest,
    maxCentsDeviation,
    minCentsDeviation: Number.isFinite(minCentsDeviation) ? minCentsDeviation : 0,
    isComplete: true,
    // Singer-focused metrics
    targetAccuracy: targetAccuracyOf(analysis),
    voiceStability: analysis.steadiness,
    avgSemitoneDeviation: analysis.deviationCents / 100,
    mostSungNote: NOTE_STRINGS[((mostSungMidi % 12) + 12) % 12],
    mostSungOctave: Math.floor(mostSungMidi / 12) - 1,
    pitchDirection,
    timeToFirstSound: Math.round(timeToFirstSound),
    verdict: describeHeldNote(analysis),
    vibratoRateHz: analysis.vibrato?.rateHz ?? null,
    vibratoDepthCents: analysis.vibrato?.depthCents ?? null,
    scoopCents: analysis.scoopCents,
    driftCents: analysis.driftCents,
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

  // Guided practice (auto-advance) state
  const [practice, setPracticeState] = useState<PracticeState>('idle')
  const [holdProgress, setHoldProgress] = useState(0)
  const [matchedNotes, setMatchedNotes] = useState<string[]>([])
  const [skippedNotes, setSkippedNotes] = useState<string[]>([])
  const practiceRef = useRef<PracticeState>('idle')
  const targetRef = useRef<{ note: string; octave: number } | null>(null)
  const tonePlayingRef = useRef(false)
  const toneTokenRef = useRef(0)
  const toneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdStartRef = useRef<number | null>(null)
  const lastMatchRef = useRef(0)
  const advanceRef = useRef<(matched: boolean) => void>(() => {})
  const pendingSaveRef = useRef(false)
  const fab = useDraggableFab('va-fab-pitch')

  const setPractice = useCallback((next: PracticeState) => {
    practiceRef.current = next
    setPracticeState(next)
  }, [])

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

  // The note being scored right now. Readings are pushed straight into its
  // `samples` array (about 90 a second), so nothing re-renders per reading.
  const attemptRef = useRef<NoteAttempt | null>(null)
  const trailRef = useRef<PitchTrailHandle | null>(null)
  const [lastVerdict, setLastVerdict] = useState<{ label: string; verdict: NoteVerdict } | null>(null)

  const handleFrame = useCallback((frame: VoiceFrame) => {
    const target = targetRef.current
    // The reference note coming out of the speakers is not the singer.
    if (!target || tonePlayingRef.current) return
    const targetMidi = (target.octave + 1) * 12 + NOTE_STRINGS_DISPLAY.indexOf(target.note)
    trailRef.current?.push(frame.time, frame.midi, targetMidi)

    const attempt = attemptRef.current
    if (!attempt || practiceRef.current !== 'running') return
    // Only readings near the target are an attempt at it; anything further is
    // talking, a cough, or a different note altogether.
    if (Math.abs(frame.midi - targetMidi) > TRACKING_RANGE_SEMITONES + 0.5) return
    attempt.samples.push({ t: frame.time, midi: frame.midi })
  }, [])

  // Every detected pitch lands here. During guided practice it also runs the
  // "hold the note for a second" timer that moves on to the next note.
  const handleNoteDetected = useCallback((note: DetectedNote | null) => {
    setDetectedNote(note)
    if (!note) return

    const target = targetRef.current
    // The reference note itself must not count as the singer's answer.
    if (practiceRef.current !== 'running' || tonePlayingRef.current || !target) {
      holdStartRef.current = null
      return
    }

    const now = performance.now()
    const matching = note.name === target.note.replace('#', '♯') && note.octave === target.octave
    if (matching) {
      if (holdStartRef.current === null || now - lastMatchRef.current > MATCH_GAP_TOLERANCE_MS) {
        holdStartRef.current = now
      }
      lastMatchRef.current = now
      const progress = Math.min(1, (now - holdStartRef.current) / MATCH_HOLD_MS)
      setHoldProgress(progress)
      if (progress >= 1) {
        holdStartRef.current = null
        advanceRef.current(true)
      }
    } else if (holdStartRef.current !== null && now - lastMatchRef.current > MATCH_GAP_TOLERANCE_MS) {
      holdStartRef.current = null
      setHoldProgress(0)
    }
  }, [])

  const {
    isListening,
    start: startListening,
    stop: stopListening,
  } = useVoiceTracker({
    sensitivity,
    externalMicStream: sharedMicStream,
    onNote: handleNoteDetected,
    onFrame: handleFrame,
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
      startPerf: performance.now(),
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
      verdict: null,
      vibratoRateHz: null,
      vibratoDepthCents: null,
      scoopCents: 0,
      driftCents: 0,
    }

    attemptRef.current = newAttempt
    trailRef.current?.clear()
    setCurrentAttempt(newAttempt)
  }, [session, startSession])

  // Complete current note attempt and save if better
  const completeNoteAttempt = useCallback(() => {
    attemptRef.current = null
    // Fewer than a quarter of a second of singing is not enough to judge.
    if (!currentAttempt || currentAttempt.samples.length < 20) {
      setCurrentAttempt(null)
      return
    }

    const completedAttempt = calculateNoteMetrics(currentAttempt)
    const key = `${completedAttempt.noteName}-${completedAttempt.octave}`
    if (completedAttempt.verdict) {
      setLastVerdict({
        label: `${completedAttempt.noteName}${completedAttempt.octave}`,
        verdict: completedAttempt.verdict,
      })
    }

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
        // For the AI coach only (not stored as columns)
        coachNote: attempt.verdict
          ? [attempt.verdict.headline, attempt.verdict.detail].filter(Boolean).join('. ')
          : null,
        vibratoRateHz: attempt.vibratoRateHz,
        vibratoDepthCents: attempt.vibratoDepthCents,
        scoopCents: attempt.scoopCents,
        driftCents: attempt.driftCents,
      }))

      const response = await fetch('/api/pitch-training/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt: session.startedAt ? session.startedAt.toISOString() : new Date().toISOString(),
          endedAt: new Date().toISOString(),
          noteMetrics
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save session')
      }

      if (result.saved) {
        setSaveMessage(`Session saved! Score: ${result.overallScore?.toFixed(1) ?? 0}%${result.isNewBest ? ' (New best!)' : ''}`)
      } else {
        setSaveMessage(result.message || 'Session not saved')
      }
    } catch (caught: unknown) {
      const error = caught as { message?: string } | null | undefined
      console.error('Save error:', error)
      setSaveMessage(error?.message || 'Failed to save session')
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
      if (toneTimeoutRef.current) clearTimeout(toneTimeoutRef.current)
      tonePlayingRef.current = false
      targetRef.current = null
      holdStartRef.current = null
      setHoldProgress(0)
      setPractice('idle')
      setIsPlaying(false)
      setSelectedNote(null)
      stopListening()
      completeNoteAttempt()
    }
  }, [isOpen, stopListening, completeNoteAttempt, setPractice])

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

  // Stop the reference note
  const stopTone = () => {
    if (toneTimeoutRef.current) {
      clearTimeout(toneTimeoutRef.current)
      toneTimeoutRef.current = null
    }
    toneTokenRef.current += 1
    if (audioRef.current) {
      audioRef.current.pause()
    }
    tonePlayingRef.current = false
    setIsPlaying(false)
  }

  // Play the reference note briefly, then hand over to the singer.
  // One audio element is reused so Safari keeps allowing playback when the
  // next note starts on its own (not from a tap).
  const playTone = (note: string, octave: number) => {
    stopTone()
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    const token = ++toneTokenRef.current
    audio.src = getAudioPath(note, octave)
    audio.currentTime = 0
    tonePlayingRef.current = true
    setIsPlaying(true)
    holdStartRef.current = null
    setHoldProgress(0)

    const finish = () => {
      if (toneTokenRef.current !== token) return
      audio.pause()
      tonePlayingRef.current = false
      setIsPlaying(false)
      if (toneTimeoutRef.current) {
        clearTimeout(toneTimeoutRef.current)
        toneTimeoutRef.current = null
      }
    }
    audio.onended = finish
    toneTimeoutRef.current = setTimeout(finish, REFERENCE_TONE_MS)
    void audio.play().catch(finish)
  }

  // Turn the mic on for the singer
  const ensureMic = () => {
    if (!isListening) void startListening()
  }

  // Move the practice to a note: play it, then listen for the singer
  const goToNote = (note: string, octave: number) => {
    if (currentAttempt) completeNoteAttempt()
    targetRef.current = { note, octave }
    setSelectedNote(note)
    setPractice('running')
    startNoteAttempt(note, octave)
    playTone(note, octave)
    ensureMic()
  }

  // Tap a note (or press Play): start the guided practice from that note
  const playNote = (note: string) => {
    if (practice === 'idle' || practice === 'done') {
      setMatchedNotes([])
      setSkippedNotes([])
      setLastVerdict(null)
      if (practice === 'done') {
        // A finished run was already saved; begin a fresh session.
        setSession({ startedAt: new Date(), endedAt: null, noteAttempts: new Map(), isActive: true })
      }
    }
    goToNote(note, selectedOctave)
  }

  // Finish the run: stop, show the summary and save the session
  const finishPractice = () => {
    stopTone()
    if (currentAttempt) completeNoteAttempt()
    targetRef.current = null
    holdStartRef.current = null
    setHoldProgress(0)
    setSelectedNote(null)
    pendingSaveRef.current = true
    setPractice('done')
  }

  // Leave the current note (matched or skipped) for the next one in sequence
  const advance = (matched: boolean) => {
    const target = targetRef.current
    if (!target || practiceRef.current === 'idle' || practiceRef.current === 'done') return
    const label = `${target.note}${target.octave}`
    if (matched) setMatchedNotes((prev) => [...prev, label])
    else setSkippedNotes((prev) => [...prev, label])

    const index = NOTE_STRINGS_DISPLAY.indexOf(target.note)
    const next = NOTE_STRINGS_DISPLAY[index + 1]
    if (!next) {
      finishPractice()
      return
    }
    goToNote(next, target.octave)
  }
  advanceRef.current = advance

  const pausePractice = () => {
    stopTone()
    holdStartRef.current = null
    setHoldProgress(0)
    setPractice('paused')
  }

  const resumePractice = () => {
    const target = targetRef.current
    if (!target) return
    setPractice('running')
    playTone(target.note, target.octave)
    ensureMic()
  }

  const hearAgain = () => {
    const target = targetRef.current
    if (!target) return
    if (practiceRef.current === 'paused') setPractice('running')
    playTone(target.note, target.octave)
  }

  // Centre button: start, pause or resume
  const togglePlay = () => {
    if (practice === 'running') pausePractice()
    else if (practice === 'paused') resumePractice()
    else playNote(selectedNote || NOTE_STRINGS_DISPLAY[0])
  }

  // Changing octave mid-practice restarts the current note in the new octave
  const changeOctave = (octave: number) => {
    setSelectedOctave(octave)
    const target = targetRef.current
    if (target && (practice === 'running' || practice === 'paused')) {
      goToNote(target.note, octave)
    }
  }

  // If the singer goes quiet, let a half-filled hold bar drop back to empty
  useEffect(() => {
    if (practice !== 'running') return
    const interval = setInterval(() => {
      if (holdStartRef.current !== null && performance.now() - lastMatchRef.current > MATCH_GAP_TOLERANCE_MS) {
        holdStartRef.current = null
        setHoldProgress(0)
      }
    }, 200)
    return () => clearInterval(interval)
  }, [practice])

  // Save automatically once a finished run's last note has been scored
  useEffect(() => {
    if (practice === 'done' && pendingSaveRef.current && !currentAttempt) {
      pendingSaveRef.current = false
      void saveSession()
    }
  }, [practice, currentAttempt, saveSession])

  useEffect(() => {
    return () => {
      if (toneTimeoutRef.current) clearTimeout(toneTimeoutRef.current)
    }
  }, [])

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
    <div className="relative w-40 h-20 mx-auto">
      <div className="absolute inset-0 flex items-end justify-center">
        <div className="w-full h-full relative">
          {[...Array(11)].map((_, i) => {
            const deg = i * 9 - 45
            const isStrong = i % 5 === 0
            return (
              <div
                key={i}
                className={`absolute bottom-0 left-1/2 origin-bottom ${
                  isStrong ? 'w-0.5 h-5 bg-gray-400' : 'w-px h-3 bg-gray-600'
                }`}
                style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
              />
            )
          })}
          <div
            className="absolute bottom-0 left-1/2 w-0.5 h-16 bg-red-500 origin-bottom transition-transform duration-150"
            style={{ transform: `translateX(-50%) rotate(${meterDegree}deg)` }}
          />
          <div className="absolute bottom-0 left-1/2 w-3 h-3 bg-gray-300 rounded-full -translate-x-1/2 translate-y-1/2" />
        </div>
      </div>
      <div className="absolute bottom-0 left-4 text-xs text-gray-500">♭</div>
      <div className="absolute bottom-0 right-4 text-xs text-gray-500">♯</div>
    </div>
  )

  // Render circular wheel mode
  const renderWheel = () => (
    <div className="relative w-64 h-64 mx-auto">
      <div className="absolute inset-0 rounded-full border border-white/10 bg-white/[0.04]" />

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
                ? 'bg-gold-400 text-ink-900 scale-110 shadow-lg shadow-gold-400/30'
                : isDetected
                  ? 'bg-red-500 text-white scale-105'
                  : hasAttempt
                    ? 'bg-emerald-600 text-white'
                    : isSharp
                      ? 'bg-white/[0.08] text-gray-300 hover:bg-white/[0.14]'
                      : 'bg-white/[0.16] text-white hover:bg-white/[0.22]'
              }`}
            style={{ left: x, top: y }}
          >
            {note}
          </button>
        )
      })}

      <button
        onClick={togglePlay}
        aria-label={practice === 'running' ? 'Pause' : practice === 'paused' ? 'Resume' : 'Start'}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-150 bg-gold-400 text-ink-900 hover:bg-gold-300 shadow-lg shadow-gold-400/25"
      >
        {practice === 'running' ? (
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

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
                    ? 'bg-gold-400 shadow-inner'
                    : isDetected
                      ? 'bg-gradient-to-b from-red-400 to-red-500'
                      : hasAttempt
                        ? 'bg-gradient-to-b from-green-300 to-green-400'
                        : 'bg-gradient-to-b from-white to-slate-100 hover:from-slate-100 hover:to-slate-200'
                  }`}
              >
                <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium
                  ${isSelected ? 'text-ink-900' : isDetected ? 'text-white' : hasAttempt ? 'text-green-800' : 'text-slate-600'}`}>
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
                  ? 'bg-gold-500 shadow-lg'
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
          <div className="absolute -inset-2 rounded-2xl border-4 border-emerald-500 animate-pulse pointer-events-none" />
        )}
      </div>
    )
  }

  // Render session stats panel
  const accuracyTone = (value: number) => (value >= 70 ? 'success' : value >= 40 ? 'warning' : 'default')
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
          disabled={isSaving || session.noteAttempts.size === 0}
        >
          <Save />
          {isSaving ? 'Saving…' : 'Save session'}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Notes" value={sessionStats.notesAttempted} />
        <Stat
          label="On target"
          value={`${sessionStats.avgTargetAccuracy.toFixed(0)}%`}
          tone={accuracyTone(sessionStats.avgTargetAccuracy)}
        />
        <Stat
          label="Steadiness"
          value={`${sessionStats.avgVoiceStability.toFixed(0)}%`}
          tone={accuracyTone(sessionStats.avgVoiceStability)}
        />
        <Stat
          label="Time"
          value={`${Math.floor(sessionStats.totalDuration / 60)}:${(sessionStats.totalDuration % 60).toString().padStart(2, '0')}`}
        />
      </div>

      {sessionStats.notesAttempted > 0 && sessionStats.overallDirection !== 'on-target' && (
        <p className={`mt-2 rounded-lg px-3 py-1.5 text-center text-xs ${
          sessionStats.overallDirection === 'sharp' ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300'
        }`}>
          You tend to sing a little {sessionStats.overallDirection === 'sharp' ? 'high' : 'low'}
        </p>
      )}

      {saveMessage && (
        <p className={`mt-2 text-center text-sm ${saveMessage.includes('saved') ? 'text-emerald-400' : 'text-amber-400'}`}>
          {saveMessage}
        </p>
      )}
    </Panel>
  )

  return (
    <>
      {variant === 'floating' ? (
        <button
          ref={fab.ref}
          {...fab.bind}
          onClick={() => {
            if (fab.consumeDrag()) return
            setIsOpen(true)
          }}
          className="fixed bottom-4 right-[76px] w-12 h-12 lg:bottom-6 lg:right-24 lg:w-14 lg:h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-300 z-40"
          style={{ boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)', ...fab.style }}
          title="Pitch Perfect (drag to move)"
          aria-label="Pitch Perfect"
        >
          <Music className="w-5 h-5 lg:w-6 lg:h-6" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex h-full min-h-[88px] w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-5 py-4 text-white transition-all duration-300"
          style={{ boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 transition-transform duration-300 group-hover:scale-110">
            <Music className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[15px] font-bold leading-tight">Pitch Perfect</p>
            <p className="mt-0.5 text-xs leading-snug text-white/75">Modern ear training</p>
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
          titleId="pitch-trainer-title"
          title="Pitch Perfect"
          subtitle="Tap a note, sing it back, and the next one starts on its own."
          icon={<Music />}
          onClose={() => {
            setIsOpen(false)
            setIsFullscreen(false)
          }}
          fullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          actions={<SpotlightTriggerButton tourKey="pitch_trainer_v4" label="How to" />}
          beforeBody={<SpotlightTour tourKey="pitch_trainer_v4" steps={pitchTourSteps} />}
        >
          {/* Top bar: view, mic, sensitivity */}
          <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Segmented
              aria-label="Note layout"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'wheel', label: 'Wheel', icon: <Circle /> },
                { value: 'keyboard', label: 'Keyboard', icon: <Piano /> },
              ]}
            />

            <Button
              data-tour="pitch-mic-btn"
              variant={isListening ? 'success' : 'secondary'}
              onClick={isListening ? stopListening : startListening}
            >
              {isListening ? <Mic /> : <MicOff />}
              {isListening ? 'Listening' : 'Start mic'}
            </Button>

            <label className="flex items-center gap-2 text-sm text-gray-400">
              <span>Mic sensitivity</span>
              <input
                type="range"
                min="0"
                max="100"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseInt(e.target.value))}
                className="va-range w-28"
              />
            </label>

            {sharedMicStream && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                Class mic linked
              </span>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-center">
            {/* Left: pick a note and a range */}
            <div className="min-w-0">
              <div data-tour="pitch-wheel-keyboard" className="overflow-x-auto py-1">
                {mode === 'wheel' ? renderWheel() : renderKeyboard()}
              </div>

              <div data-tour="pitch-octave-selector" className="mt-3 flex flex-col items-center gap-1.5">
                <Segmented
                  aria-label="Octave"
                  compact
                  value={selectedOctave}
                  onChange={changeOctave}
                  options={availableOctaves.map((octave) => ({ value: octave, label: octave }))}
                />
                <p className="text-xs text-gray-400">Octave: lower numbers are deeper</p>
              </div>
            </div>

            {/* Right: what to do now, what we hear, how it is going */}
            <div className="min-w-0 space-y-3">
              {practice === 'done' ? (
                <Panel tone="success" className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="size-5 text-emerald-400" />
                    <p className="text-base font-semibold text-white">Sequence complete!</p>
                  </div>
                  <p className="mt-1 text-sm text-gray-300">
                    You matched{' '}
                    <span className="font-bold text-white">
                      {matchedNotes.length} of {matchedNotes.length + skippedNotes.length}
                    </span>{' '}
                    note{matchedNotes.length + skippedNotes.length === 1 ? '' : 's'}
                    {skippedNotes.length > 0 ? ` (skipped ${skippedNotes.join(', ')})` : ''}.
                  </p>
                  <Button variant="primary" className="mt-3" onClick={() => playNote(NOTE_STRINGS_DISPLAY[0])}>
                    <RotateCcw />
                    Practice again
                  </Button>
                </Panel>
              ) : (
                <Panel padding="sm">
                  <p className="min-h-5 text-center text-sm font-semibold text-white">
                    {practice === 'idle' && 'Tap a note or press Start to begin.'}
                    {practice === 'paused' && `Paused on ${selectedNote}${selectedOctave}`}
                    {practice === 'running' && isPlaying && `Listen… ${selectedNote}${selectedOctave}`}
                    {practice === 'running' && !isPlaying && `Your turn: sing ${selectedNote}${selectedOctave} and hold it`}
                  </p>
                  <p className="mt-0.5 text-center text-xs text-gray-400">
                    Hold the note for a second and the next one starts on its own.
                  </p>

                  <div
                    className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label="Hold progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(holdProgress * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-100"
                      style={{ width: `${Math.round(holdProgress * 100)}%` }}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button size="sm" onClick={hearAgain} disabled={practice === 'idle'}>
                      <Volume2 />
                      Hear again
                    </Button>
                    <Button size="sm" variant="primary" onClick={togglePlay}>
                      {practice === 'running' ? <Pause /> : <Play />}
                      {practice === 'running' ? 'Pause' : practice === 'paused' ? 'Resume' : 'Start'}
                    </Button>
                    <Button size="sm" onClick={() => advance(false)} disabled={practice === 'idle'}>
                      <SkipForward />
                      Skip note
                    </Button>
                  </div>
                </Panel>
              )}

              {/* What we hear */}
              <Panel padding="sm" data-tour="pitch-note-display" className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-400">{isListening ? 'We hear' : 'Turn the mic on to see your note'}</p>
                  <div className="inline-flex min-h-[52px] items-baseline gap-2">
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
                              className={`transition-colors duration-150 ${
                                isActive
                                  ? `text-4xl font-bold ${isNoteMatching() ? 'text-emerald-400' : 'text-red-400'}`
                                  : 'text-xl text-gray-600'
                              }`}
                            >
                              {note}
                              <sub className="ml-0.5 text-base">{detectedNote.octave}</sub>
                            </span>
                          )
                        })}
                      </>
                    ) : (
                      <span className="text-3xl text-gray-600">--</span>
                    )}
                  </div>

                  <p className="min-h-4 text-xs">
                    {detectedNote &&
                      (isNoteMatching() ? (
                        <span className="font-semibold text-emerald-400">Match!</span>
                      ) : detectedNote.cents > 0 ? (
                        <span className="text-amber-400">A little high</span>
                      ) : detectedNote.cents < 0 ? (
                        <span className="text-blue-400">A little low</span>
                      ) : (
                        <span className="text-gray-400">Keep going</span>
                      ))}
                  </p>
                </div>

                {isListening && <div className="shrink-0">{renderMeter()}</div>}
              </Panel>

              {/* Your voice against the note, and how the last note went */}
              {isListening && selectedNote && (
                <div>
                  <PitchTrail
                    ref={trailRef}
                    className="h-20"
                    aria-label={`Your voice against ${selectedNote}${selectedOctave}`}
                  />
                  <p className="mt-1 text-center text-xs text-gray-400">
                    Keep the line inside the green band
                  </p>
                </div>
              )}

              {lastVerdict && (
                <Panel
                  padding="sm"
                  tone={lastVerdict.verdict.tone === 'good' ? 'success' : 'default'}
                  className="text-center"
                  aria-live="polite"
                >
                  <p className="text-sm font-semibold text-white">
                    {lastVerdict.label}: {lastVerdict.verdict.headline}
                  </p>
                  {lastVerdict.verdict.detail && (
                    <p className="mt-0.5 text-xs text-gray-300">{lastVerdict.verdict.detail}</p>
                  )}
                </Panel>
              )}

              {/* Session Stats */}
              {session.isActive && renderSessionStats()}
            </div>
          </div>
        </ToolDialog>
      )}

    </>
  )
}
