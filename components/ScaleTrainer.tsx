'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Script from 'next/script'
import { Music, Play, Square, Save, RotateCcw, ChevronUp, ChevronDown, Mic, Check, X, ArrowUp, ArrowDown, ArrowUpDown, Maximize2, Minimize2, Volume2, VolumeX, Sparkles, HelpCircle, Activity, Headphones } from 'lucide-react'
import { analyzeBuffer, getNoteFrequency, getTargetCentsError, calculateTargetAccuracy, stdDev } from '@/lib/pitch-detection'

// ============================================================================
// MUSIC THEORY & SCALE DEFINITIONS
// ============================================================================

export interface ScaleDefinition {
  name: string
  intervalsAscending: number[]
  intervalsDescending: number[]
  description: string
}

export const SCALE_DEFINITIONS: Record<string, ScaleDefinition> = {
  major: {
    name: 'Major (Ionian)',
    intervalsAscending: [0, 2, 4, 5, 7, 9, 11, 12],
    intervalsDescending: [12, 11, 9, 7, 5, 4, 2, 0],
    description: 'Bright, diatonic foundation for vocal training'
  },
  natural_minor: {
    name: 'Natural Minor (Aeolian)',
    intervalsAscending: [0, 2, 3, 5, 7, 8, 10, 12],
    intervalsDescending: [12, 10, 8, 7, 5, 3, 2, 0],
    description: 'Melancholic, flat 3rd, 6th, and 7th'
  },
  harmonic_minor: {
    name: 'Harmonic Minor',
    intervalsAscending: [0, 2, 3, 5, 7, 8, 11, 12],
    intervalsDescending: [12, 11, 8, 7, 5, 3, 2, 0],
    description: 'Augmented 2nd interval between 6th & raised 7th'
  },
  classical_melodic_minor: {
    name: 'Classical Melodic Minor',
    intervalsAscending: [0, 2, 3, 5, 7, 9, 11, 12],
    intervalsDescending: [12, 10, 8, 7, 5, 3, 2, 0], // Reverts to natural minor descending
    description: 'Raised 6th & 7th ascending; natural minor descending'
  },
  jazz_melodic_minor: {
    name: 'Jazz Melodic Minor',
    intervalsAscending: [0, 2, 3, 5, 7, 9, 11, 12],
    intervalsDescending: [12, 11, 9, 7, 5, 3, 2, 0],
    description: 'Raised 6th & 7th in both directions'
  },
  pentatonic_major: {
    name: 'Pentatonic Major',
    intervalsAscending: [0, 2, 4, 7, 9, 12],
    intervalsDescending: [12, 9, 7, 4, 2, 0],
    description: '5-note pop/gospel melodic spine (no 4th or 7th)'
  },
  pentatonic_minor: {
    name: 'Pentatonic Minor',
    intervalsAscending: [0, 3, 5, 7, 10, 12],
    intervalsDescending: [12, 10, 7, 5, 3, 0],
    description: '5-note blues/rock vocal staple'
  },
  blues: {
    name: 'Blues Scale',
    intervalsAscending: [0, 3, 5, 6, 7, 10, 12],
    intervalsDescending: [12, 10, 7, 6, 5, 3, 0],
    description: 'Pentatonic minor with added diminished 5th (blue note)'
  },
  chromatic: {
    name: 'Chromatic Scale',
    intervalsAscending: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    intervalsDescending: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    description: 'All 12 consecutive semitones for vocal agility'
  },
}

// Key-aware note spelling (Sharps vs Flats)
const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const CHROMATIC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const FLAT_ROOTS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']

export function getSpelledNoteName(root: string, semitoneOffset: number): string {
  const rootIndex = CHROMATIC_SHARPS.indexOf(root) >= 0
    ? CHROMATIC_SHARPS.indexOf(root)
    : CHROMATIC_FLATS.indexOf(root)

  const isFlatKey = FLAT_ROOTS.includes(root)
  const targetIndex = ((rootIndex >= 0 ? rootIndex : 0) + semitoneOffset) % 12
  return isFlatKey ? CHROMATIC_FLATS[targetIndex] : CHROMATIC_SHARPS[targetIndex]
}

export const AVAILABLE_ROOT_NOTES = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

// ============================================================================
// TYPES & DATA STRUCTURES
// ============================================================================

type AubioPitchDetector = { do: (buffer: Float32Array) => number }
type AubioModule = { Pitch: new (method: string, bufferSize: number, hopSize: number, sampleRate: number) => AubioPitchDetector }
type AudioContextConstructor = typeof AudioContext

declare global {
  interface Window {
    aubio: () => Promise<AubioModule>
    webkitAudioContext?: AudioContextConstructor
  }
}

export interface ScaleNote {
  noteName: string
  octave: number
  frequency: number
  position: number
  semitoneOffset: number
  expectedDurationMs: number
}

export interface SungNoteObservation {
  noteName: string
  octave: number
  targetFrequency: number
  avgDetectedFrequency: number
  maeCents: number
  medianSignedCents: number
  centsDeviation: number
  pitchAccuracy: number
  targetAccuracy: number
  voiceStability: number
  timeToSingMs: number | null
  settleTimeMs: number
  wasInOrder: boolean
  sampleCount: number
  timestamp: number
}

export interface NoteMetric {
  noteName: string
  octave: number
  expectedPosition: number
  actualPosition: number | null
  targetFrequency: number
  pitchAccuracy: number
  centsDeviation: number
  targetAccuracy: number
  voiceStability: number
  timeToSingMs: number | null
  wasInOrder: boolean
  sampleCount: number
  avgDetectedFrequency: number
}

export type Direction = 'ascending' | 'descending' | 'both'

export interface ScaleStats {
  notesAttempted: number
  notesCompleted: number
  completionRatePercent: number
  sequenceAccuracy: number
  pitchAccuracy: number
  voiceStability: number
  timingConsistency: number
  overallScore: number
}

interface ScaleTrainerProps {
  variant?: 'floating' | 'card'
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ScaleTrainer({ variant = 'floating' }: ScaleTrainerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showTutorial, setShowTutorial] = useState(true)

  // Settings
  const [scaleType, setScaleType] = useState<string>('major')
  const [rootNote, setRootNote] = useState<string>('C')
  const [octave, setOctave] = useState<number>(3) // 2 to 5 for vocal comfort
  const [direction, setDirection] = useState<Direction>('ascending')
  const [sensitivity, setSensitivity] = useState<number>(60)
  const [tempo, setTempo] = useState<number>(80) // 40 - 200 BPM

  // Session State
  const [isPracticing, setIsPracticing] = useState(false)
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [scaleNotes, setScaleNotes] = useState<ScaleNote[]>([])
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number>(0)
  const [sungNotes, setSungNotes] = useState<SungNoteObservation[]>([])
  const [noteMetrics, setNoteMetrics] = useState<Map<string, NoteMetric>>(new Map())

  // Audio Detection State
  const [detectedNote, setDetectedNote] = useState<string | null>(null)
  const [detectedOctave, setDetectedOctave] = useState<number | null>(null)
  const [, setDetectedFrequency] = useState<number | null>(null)
  const [centsDeviation, setCentsDeviation] = useState<number>(0)
  const [isListening, setIsListening] = useState(false)

  // Web Audio Context & Playback Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const pitchDetectorRef = useRef<AubioPitchDetector | null>(null)
  const BUFFER_SIZE = 4096

  // Playback scheduler refs
  const [playingNoteIndex, setPlayingNoteIndex] = useState<number | null>(null)
  const [isPlayingScale, setIsPlayingScale] = useState(false)
  const [volume, setVolume] = useState(0.6)
  const scalePlaybackGenIdRef = useRef(0)
  const scalePlaybackTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Real-time Segmentation Refs
  const noteStartTimeRef = useRef<number>(0)
  const lastNoteEndTimeRef = useRef<number>(0)
  const currentNoteSamplesRef = useRef<{ freq: number; cents: number; time: number }[]>([])
  const sustainedWrongNoteSamplesRef = useRef<{ key: string; start: number }>({ key: '', start: 0 })
  const wrongAttemptsCountRef = useRef(0)
  const hadErrorOnStepRef = useRef(false)

  // Stats
  const [sessionStats, setSessionStats] = useState<ScaleStats>({
    notesAttempted: 0,
    notesCompleted: 0,
    completionRatePercent: 0,
    sequenceAccuracy: 0,
    pitchAccuracy: 0,
    voiceStability: 0,
    timingConsistency: 0,
    overallScore: 0,
  })

  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [, setAubioLoaded] = useState(false)

  // ==========================================================================
  // SCALE GENERATION WITH KEY-AWARE SPELLING
  // ==========================================================================

  useEffect(() => {
    const scaleDef = SCALE_DEFINITIONS[scaleType] || SCALE_DEFINITIONS.major
    const cleanRoot = rootNote.replace('b', 'b')
    const rootIndex = CHROMATIC_SHARPS.indexOf(cleanRoot) >= 0
      ? CHROMATIC_SHARPS.indexOf(cleanRoot)
      : CHROMATIC_FLATS.indexOf(cleanRoot)

    const baseIndex = rootIndex >= 0 ? rootIndex : 0
    const noteDurationMs = Math.round(60000 / tempo)

    let intervals: number[] = []

    if (direction === 'ascending') {
      intervals = scaleDef.intervalsAscending
    } else if (direction === 'descending') {
      intervals = scaleDef.intervalsDescending
    } else {
      // Both: Ascending then Descending turnaround without repeating top note
      const asc = scaleDef.intervalsAscending
      const desc = scaleDef.intervalsDescending.slice(1) // omit top octave repetition
      intervals = [...asc, ...desc]
    }

    const generated: ScaleNote[] = intervals.map((interval, idx) => {
      const spelledName = getSpelledNoteName(cleanRoot, interval)
      const noteOctave = octave + Math.floor((baseIndex + interval) / 12)
      const frequency = getNoteFrequency(spelledName, noteOctave)

      return {
        noteName: spelledName,
        octave: noteOctave,
        frequency,
        position: idx + 1,
        semitoneOffset: interval,
        expectedDurationMs: noteDurationMs,
      }
    })

    setScaleNotes(generated)
    resetSession()
  }, [scaleType, rootNote, octave, direction, tempo])

  // ==========================================================================
  // WEB AUDIO SAMPLE-ACCURATE REFERENCE SYNTHESIZER
  // ==========================================================================

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext
      if (!AudioContextCtor) throw new Error('Web Audio is not supported')
      audioContextRef.current = new AudioContextCtor()
      masterGainRef.current = audioContextRef.current.createGain()
      masterGainRef.current.connect(audioContextRef.current.destination)
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
    return audioContextRef.current
  }, [])

  const playSingleTone = useCallback((frequency: number, durationMs: number = 700) => {
    const ctx = initAudioContext()
    if (!masterGainRef.current) return

    const osc = ctx.createOscillator()
    const noteGain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)

    const now = ctx.currentTime
    const durSec = durationMs / 1000
    const targetVol = volume * 0.4

    // Smooth ADSR envelope
    noteGain.gain.setValueAtTime(0.0001, now)
    noteGain.gain.linearRampToValueAtTime(targetVol, now + 0.04)
    noteGain.gain.setValueAtTime(targetVol, now + durSec - 0.06)
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec)

    osc.connect(noteGain)
    noteGain.connect(masterGainRef.current)

    osc.start(now)
    osc.stop(now + durSec)
  }, [initAudioContext, volume])

  const playScaleNote = useCallback((index: number) => {
    if (index < 0 || index >= scaleNotes.length) return
    const note = scaleNotes[index]
    setPlayingNoteIndex(index)
    playSingleTone(note.frequency, 800)
    setTimeout(() => setPlayingNoteIndex(null), 800)
  }, [scaleNotes, playSingleTone])

  // Automated Lookahead Full-Scale Playback
  const playEntireScale = useCallback(() => {
    if (isPlayingScale || scaleNotes.length === 0) return

    const ctx = initAudioContext()
    setIsPlayingScale(true)
    scalePlaybackGenIdRef.current += 1
    const currentGen = scalePlaybackGenIdRef.current

    const noteDurationSec = 60.0 / tempo
    const startTime = ctx.currentTime + 0.05

    scaleNotes.forEach((note, idx) => {
      const noteTime = startTime + (idx * noteDurationSec)
      const osc = ctx.createOscillator()
      const noteGain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.frequency, noteTime)

      const targetVol = volume * 0.4
      noteGain.gain.setValueAtTime(0.0001, noteTime)
      noteGain.gain.linearRampToValueAtTime(targetVol, noteTime + 0.03)
      noteGain.gain.setValueAtTime(targetVol, noteTime + noteDurationSec - 0.04)
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + noteDurationSec)

      osc.connect(noteGain)
      if (masterGainRef.current) {
        noteGain.connect(masterGainRef.current)
      }

      osc.start(noteTime)
      osc.stop(noteTime + noteDurationSec)

      // UI highlight synchronization
      const delayMs = Math.max(0, (noteTime - ctx.currentTime) * 1000)
      setTimeout(() => {
        if (scalePlaybackGenIdRef.current === currentGen) {
          setPlayingNoteIndex(idx)
        }
      }, delayMs)
    })

    const totalDurationMs = (scaleNotes.length * noteDurationSec + 0.1) * 1000
    scalePlaybackTimerRef.current = setTimeout(() => {
      if (scalePlaybackGenIdRef.current === currentGen) {
        setIsPlayingScale(false)
        setPlayingNoteIndex(null)
      }
    }, totalDurationMs)
  }, [isPlayingScale, scaleNotes, tempo, initAudioContext, volume])

  const stopScalePlayback = useCallback(() => {
    scalePlaybackGenIdRef.current += 1
    if (scalePlaybackTimerRef.current) {
      clearTimeout(scalePlaybackTimerRef.current)
      scalePlaybackTimerRef.current = null
    }
    if (masterGainRef.current && audioContextRef.current) {
      masterGainRef.current.gain.setValueAtTime(0, audioContextRef.current.currentTime)
      masterGainRef.current.gain.setValueAtTime(1, audioContextRef.current.currentTime + 0.05)
    }
    setIsPlayingScale(false)
    setPlayingNoteIndex(null)
  }, [])

  // ==========================================================================
  // RIGOROUS STATS CALCULATION
  // ==========================================================================

  const calculateStats = useCallback((
    totalExpected: number,
    completedObservations: SungNoteObservation[],
    wrongAttempts: number
  ): ScaleStats => {
    const totalCompleted = completedObservations.length

    if (totalExpected === 0 || totalCompleted === 0) {
      return {
        notesAttempted: totalExpected,
        notesCompleted: 0,
        completionRatePercent: 0,
        sequenceAccuracy: 0,
        pitchAccuracy: 0,
        voiceStability: 0,
        timingConsistency: 0,
        overallScore: 0,
      }
    }

    const completionRate = totalCompleted / totalExpected
    const sequenceFidelity = Math.max(0, (totalExpected - wrongAttempts) / totalExpected)
    const sequenceAccuracy = Math.round(completionRate * sequenceFidelity * 100)

    const avgPitchAcc = completedObservations.reduce((s, o) => s + o.pitchAccuracy, 0) / totalCompleted
    const avgVoiceStab = completedObservations.reduce((s, o) => s + o.voiceStability, 0) / totalCompleted

    // Timing consistency across note transitions
    const timings = completedObservations
      .map(o => o.timeToSingMs)
      .filter((t): t is number => t !== null && t > 0)

    let timingConsistency = 100
    if (timings.length > 1) {
      const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length
      const timingStdDev = stdDev(timings)
      timingConsistency = Math.max(0, Math.min(100, Math.round(100 - (timingStdDev / avgTiming) * 50)))
    }

    // Multiplicative score gated by completion rate
    const qualityScore = (sequenceAccuracy * 0.40) + (avgPitchAcc * 0.40) + (avgVoiceStab * 0.20)
    const overallScore = Math.round(completionRate * qualityScore)

    return {
      notesAttempted: totalExpected,
      notesCompleted: totalCompleted,
      completionRatePercent: Math.round(completionRate * 100),
      sequenceAccuracy,
      pitchAccuracy: Math.round(avgPitchAcc),
      voiceStability: Math.round(avgVoiceStab),
      timingConsistency,
      overallScore: Math.max(0, Math.min(100, overallScore)),
    }
  }, [])

  // ==========================================================================
  // REAL-TIME SEGMENTATION & PITCH DETECTION
  // ==========================================================================

  const processPitchFrame = useCallback((
    noteName: string,
    detectedOct: number,
    freq: number,
    cents: number
  ) => {
    if (!isPracticing || currentNoteIndex >= scaleNotes.length) return

    const expectedNote = scaleNotes[currentNoteIndex]
    const noteKey = `${noteName}-${detectedOct}`
    const expectedKey = `${expectedNote.noteName}-${expectedNote.octave}`
    const now = performance.now()

    // Measure continuous cents error from the exact target frequency
    const targetErrorCents = getTargetCentsError(freq, expectedNote.frequency)
    const isInsideTargetWindow = Math.abs(targetErrorCents) <= 45

    if (isInsideTargetWindow) {
      // Singer is in the target note window
      sustainedWrongNoteSamplesRef.current = { key: '', start: 0 }
      currentNoteSamplesRef.current.push({ freq, cents: targetErrorCents, time: now })

      // Adaptive duration requirement: ~90ms (or ~30% of beat at high tempo)
      const minRequiredDurationMs = Math.min(110, Math.max(70, expectedNote.expectedDurationMs * 0.30))
      const sampleDurationMs = currentNoteSamplesRef.current.length > 1
        ? now - currentNoteSamplesRef.current[0].time
        : 0

      if (sampleDurationMs >= minRequiredDurationMs && currentNoteSamplesRef.current.length >= 3) {
        // Lock in confirmed scale degree
        const samples = currentNoteSamplesRef.current
        const avgFreq = samples.reduce((s, x) => s + x.freq, 0) / samples.length
        const centsList = samples.map(x => x.cents)
        const absCentsList = centsList.map(Math.abs)

        const maeCents = absCentsList.reduce((s, x) => s + x, 0) / absCentsList.length
        const sortedCents = [...centsList].sort((a, b) => a - b)
        const medianSignedCents = sortedCents[Math.floor(sortedCents.length / 2)]

        // Logarithmic stability
        const stabilityStdDev = stdDev(centsList)
        const voiceStability = Math.max(0, Math.min(100, Math.round(100 - (stabilityStdDev * 2))))

        // Continuous intonation accuracy with steep pedagogical curve
        const pitchAccuracy = calculateTargetAccuracy(maeCents)
        const targetAccuracy = pitchAccuracy

        const timeFromLast = lastNoteEndTimeRef.current > 0
          ? Math.round(now - lastNoteEndTimeRef.current)
          : null
        const settleTimeMs = Math.round(now - noteStartTimeRef.current)
        const wasInOrder = !hadErrorOnStepRef.current

        const newObservation: SungNoteObservation = {
          noteName: expectedNote.noteName,
          octave: expectedNote.octave,
          targetFrequency: expectedNote.frequency,
          avgDetectedFrequency: avgFreq,
          maeCents,
          medianSignedCents,
          centsDeviation: medianSignedCents,
          pitchAccuracy,
          targetAccuracy,
          voiceStability,
          timeToSingMs: timeFromLast,
          settleTimeMs,
          wasInOrder,
          sampleCount: samples.length,
          timestamp: Date.now(),
        }

        const newSungList = [...sungNotes, newObservation]
        setSungNotes(newSungList)

        const metric: NoteMetric = {
          noteName: expectedNote.noteName,
          octave: expectedNote.octave,
          expectedPosition: expectedNote.position,
          actualPosition: newSungList.length,
          targetFrequency: expectedNote.frequency,
          pitchAccuracy,
          centsDeviation: medianSignedCents,
          targetAccuracy,
          voiceStability,
          timeToSingMs: timeFromLast,
          wasInOrder,
          sampleCount: samples.length,
          avgDetectedFrequency: avgFreq,
        }

        const updatedMetrics = new Map(noteMetrics).set(`${expectedNote.position}`, metric)
        setNoteMetrics(updatedMetrics)

        const newStats = calculateStats(scaleNotes.length, newSungList, wrongAttemptsCountRef.current)
        setSessionStats(newStats)

        // Advance to next scale degree
        setCurrentNoteIndex(prev => prev + 1)
        lastNoteEndTimeRef.current = now
        noteStartTimeRef.current = now
        currentNoteSamplesRef.current = []
        hadErrorOnStepRef.current = false
      }
    } else {
      // Transition region or wrong note
      currentNoteSamplesRef.current = []

      // Portamento immunity: ignore rapid passing slides; only penalize if sustained wrong note for >220ms
      if (sustainedWrongNoteSamplesRef.current.key === noteKey) {
        if (now - sustainedWrongNoteSamplesRef.current.start > 220) {
          if (!hadErrorOnStepRef.current) {
            hadErrorOnStepRef.current = true
            wrongAttemptsCountRef.current += 1
          }
        }
      } else {
        sustainedWrongNoteSamplesRef.current = { key: noteKey, start: now }
      }
    }
  }, [isPracticing, currentNoteIndex, scaleNotes, sungNotes, noteMetrics, calculateStats])

  const processPitchFrameRef = useRef(processPitchFrame)
  useEffect(() => {
    processPitchFrameRef.current = processPitchFrame
  }, [processPitchFrame])

  // ==========================================================================
  // AUDIO INPUT INITIALIZATION
  // ==========================================================================

  const initAudio = useCallback(async () => {
    try {
      if (!window.aubio) {
        alert('Audio engine is loading. Please wait a moment.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        }
      })
      mediaStreamRef.current = stream

      const ctx = initAudioContext()
      analyserRef.current = ctx.createAnalyser()
      scriptProcessorRef.current = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1)

      const aubioModule = await window.aubio()
      pitchDetectorRef.current = new aubioModule.Pitch(
        'default',
        BUFFER_SIZE,
        1,
        ctx.sampleRate
      )

      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.connect(scriptProcessorRef.current)
      scriptProcessorRef.current.connect(ctx.destination)

      scriptProcessorRef.current.addEventListener('audioprocess', (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0)
        if (!pitchDetectorRef.current) return

        const detected = analyzeBuffer(input, pitchDetectorRef.current, sensitivity)
        if (!detected) return

        setDetectedNote(detected.nameAscii)
        setDetectedOctave(detected.octave)
        setDetectedFrequency(detected.frequency)
        setCentsDeviation(detected.cents)

        processPitchFrameRef.current(detected.nameAscii, detected.octave, detected.frequency, detected.cents)
      })

      setIsListening(true)
    } catch (err) {
      console.error('Audio initialization error:', err)
      alert('Could not access microphone.')
    }
  }, [initAudioContext, sensitivity])

  // ==========================================================================
  // PRACTICE CONTROLS
  // ==========================================================================

  const resetSession = useCallback(() => {
    setCurrentNoteIndex(0)
    setSungNotes([])
    setNoteMetrics(new Map())
    setSessionStats({
      notesAttempted: scaleNotes.length,
      notesCompleted: 0,
      completionRatePercent: 0,
      sequenceAccuracy: 0,
      pitchAccuracy: 0,
      voiceStability: 0,
      timingConsistency: 0,
      overallScore: 0,
    })
    noteStartTimeRef.current = performance.now()
    lastNoteEndTimeRef.current = 0
    currentNoteSamplesRef.current = []
    sustainedWrongNoteSamplesRef.current = { key: '', start: 0 }
    wrongAttemptsCountRef.current = 0
    hadErrorOnStepRef.current = false
    setSaveMessage(null)
  }, [scaleNotes.length])

  const startPractice = async () => {
    stopScalePlayback()
    if (!isListening) {
      await initAudio()
    }
    resetSession()
    setStartedAt(new Date())
    noteStartTimeRef.current = performance.now()
    setIsPracticing(true)
  }

  const stopPractice = () => {
    setIsPracticing(false)
  }

  // ==========================================================================
  // SAVE SESSION
  // ==========================================================================

  const saveSession = async () => {
    if (!startedAt || sungNotes.length === 0) {
      setSaveMessage('No scale notes recorded')
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const inOrderCount = Array.from(noteMetrics.values()).filter(m => m.wasInOrder).length

      const response = await fetch('/api/scale-training/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt: startedAt.toISOString(),
          endedAt: new Date().toISOString(),
          scaleType,
          rootNote,
          octave,
          direction,
          tempo,
          totalNotesExpected: scaleNotes.length,
          totalNotesSung: sungNotes.length,
          notesInCorrectOrder: inOrderCount,
          sequenceAccuracy: sessionStats.sequenceAccuracy,
          pitchAccuracy: sessionStats.pitchAccuracy,
          overallScore: sessionStats.overallScore,
          noteMetrics: Array.from(noteMetrics.values()),
        }),
      })

      const data = await response.json()
      if (response.ok) {
        setSaveMessage(`Session saved! Score: ${sessionStats.overallScore}%`)
      } else {
        setSaveMessage(data.message || 'Failed to save session')
      }
    } catch (err) {
      console.error('Error saving session:', err)
      setSaveMessage('Failed to save session')
    } finally {
      setIsSaving(false)
      setTimeout(() => setSaveMessage(null), 5000)
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      stopScalePlayback()
    }
  }, [stopScalePlayback])

  const handleClose = () => {
    stopPractice()
    stopScalePlayback()
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    pitchDetectorRef.current = null
    setIsListening(false)
    setIsOpen(false)
    setIsFullscreen(false)
    resetSession()
  }

  const getDirectionIcon = () => {
    switch (direction) {
      case 'ascending': return <ArrowUp size={16} />
      case 'descending': return <ArrowDown size={16} />
      case 'both': return <ArrowUpDown size={16} />
    }
  }

  // ==========================================================================
  // RENDER INTERFACE
  // ==========================================================================

  const renderTrainer = () => (
    <div className={`${isFullscreen ? 'fixed inset-0 z-[60] bg-[#0d0d1a]' : ''}`}>
      <div className={`${isFullscreen ? 'h-full overflow-y-auto p-6' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Scale & Vocal Agility Trainer</h2>
              <p className="text-xs text-white/50">Interval intonation, legato transitions, and melodic sequence mastery</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isListening && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mr-2 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                <Mic size={14} className="animate-pulse" />
                <span>Mic Active</span>
              </div>
            )}
            <button
              onClick={() => setShowTutorial(!showTutorial)}
              className={`p-2 rounded-lg transition-colors ${showTutorial ? 'bg-pink-500/20 text-pink-300' : 'hover:bg-white/10 text-white/70'}`}
              title="How to practice"
            >
              <HelpCircle size={18} />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 3-Step Guided Practice Workflow Banner */}
        {showTutorial && (
          <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 border border-pink-500/20 rounded-2xl p-4 mb-6 relative">
            <button
              onClick={() => setShowTutorial(false)}
              className="absolute top-3 right-3 text-white/40 hover:text-white"
            >
              <X size={14} />
            </button>
            <h3 className="text-xs font-bold text-pink-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles size={14} /> Guided Scale Practice Flow
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5">
                <div className="font-semibold text-pink-400 mb-1">Step 1: 🔊 Listen & Internalize</div>
                <p className="text-slate-300">Click <strong>Listen to Scale</strong> to hear the pitch and rhythm at your chosen BPM.</p>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5">
                <div className="font-semibold text-purple-400 mb-1">Step 2: 🎙️ Sing in Tempo</div>
                <p className="text-slate-300">Press <strong>Start Practice</strong> and sing each note in sequence without stopping.</p>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5">
                <div className="font-semibold text-indigo-400 mb-1">Step 3: 📊 Review & Save</div>
                <p className="text-slate-300">Examine interval accuracy, transition settle time, and save your attempt.</p>
              </div>
            </div>
          </div>
        )}

        {/* Settings Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 bg-slate-900/40 p-4 rounded-2xl border border-white/5">
          <div>
            <label className="block text-[11px] font-medium text-white/50 mb-1">Scale Type</label>
            <select
              value={scaleType}
              onChange={(e) => setScaleType(e.target.value)}
              disabled={isPracticing || isPlayingScale}
              className="glass-select w-full text-xs font-medium py-2 rounded-xl"
            >
              {Object.entries(SCALE_DEFINITIONS).map(([key, scale]) => (
                <option key={key} value={key}>{scale.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-white/50 mb-1">Root Key</label>
            <select
              value={rootNote}
              onChange={(e) => setRootNote(e.target.value)}
              disabled={isPracticing || isPlayingScale}
              className="glass-select w-full text-xs font-medium py-2 rounded-xl"
            >
              {AVAILABLE_ROOT_NOTES.map(note => (
                <option key={note} value={note}>{note}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-white/50 mb-1">Starting Octave</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOctave(o => Math.max(2, o - 1))}
                disabled={isPracticing || isPlayingScale || octave <= 2}
                className="glass-button p-1.5 rounded-lg disabled:opacity-40"
              >
                <ChevronDown size={14} />
              </button>
              <span className="text-white font-mono font-bold w-6 text-center text-xs">{octave}</span>
              <button
                onClick={() => setOctave(o => Math.min(5, o + 1))}
                disabled={isPracticing || isPlayingScale || octave >= 5}
                className="glass-button p-1.5 rounded-lg disabled:opacity-40"
              >
                <ChevronUp size={14} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-white/50 mb-1">Tempo (BPM)</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTempo(t => Math.max(40, t - 10))}
                disabled={isPracticing || isPlayingScale || tempo <= 40}
                className="glass-button p-1.5 rounded-lg disabled:opacity-40"
              >
                <ChevronDown size={14} />
              </button>
              <span className="text-white font-mono font-bold w-8 text-center text-xs">{tempo}</span>
              <button
                onClick={() => setTempo(t => Math.min(200, t + 10))}
                disabled={isPracticing || isPlayingScale || tempo >= 200}
                className="glass-button p-1.5 rounded-lg disabled:opacity-40"
              >
                <ChevronUp size={14} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-white/50 mb-1">Direction</label>
            <button
              onClick={() => setDirection(d => d === 'ascending' ? 'descending' : d === 'descending' ? 'both' : 'ascending')}
              disabled={isPracticing || isPlayingScale}
              className="glass-button px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-semibold w-full justify-center"
            >
              {getDirectionIcon()}
              <span className="capitalize">{direction}</span>
            </button>
          </div>
        </div>

        {/* Sensitivity & Volume Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 px-1">
          <div>
            <div className="flex items-center justify-between text-xs text-white/60 mb-1">
              <span>Mic Sensitivity: <strong className="text-white">{sensitivity}%</strong></span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-white/60 mb-1">
              <span className="flex items-center gap-1.5"><Volume2 size={13} /> Tone Volume: <strong className="text-white">{Math.round(volume * 100)}%</strong></span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume * 100}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
          </div>
        </div>

        {/* Scale Display & Note Pills */}
        <div className="mb-6 bg-slate-900/60 p-4 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-bold text-pink-400">{rootNote} {SCALE_DEFINITIONS[scaleType]?.name}</span>
              <span className="text-xs text-white/40 ml-2">({SCALE_DEFINITIONS[scaleType]?.description})</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {tempo} BPM · {Math.round(60000 / tempo)}ms / note
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {scaleNotes.map((note, idx) => {
              const isCurrent = isPracticing && idx === currentNoteIndex
              const isCompleted = idx < currentNoteIndex
              const isPlayingNow = playingNoteIndex === idx
              const metric = noteMetrics.get(`${note.position}`)

              return (
                <button
                  key={`${note.noteName}-${note.octave}-${idx}`}
                  onClick={() => !isPracticing && playScaleNote(idx)}
                  disabled={isPracticing}
                  className={`
                    relative px-4 py-3 rounded-2xl border transition-all duration-200 select-none
                    ${isPlayingNow ? 'border-amber-400 bg-amber-500/25 scale-105 shadow-lg shadow-amber-500/20' : ''}
                    ${isCurrent && !isPlayingNow ? 'border-pink-500 bg-pink-500/25 scale-110 shadow-lg shadow-pink-500/20' : ''}
                    ${isCompleted && !isPlayingNow ? 'border-emerald-500/60 bg-emerald-500/15' : ''}
                    ${!isCurrent && !isCompleted && !isPlayingNow ? 'border-slate-700/80 bg-slate-800/40 hover:border-slate-600' : ''}
                  `}
                >
                  <div className="text-center">
                    <div className={`text-base font-extrabold ${
                      isPlayingNow ? 'text-amber-300' :
                      isCurrent ? 'text-pink-300' :
                      isCompleted ? 'text-emerald-300' :
                      'text-white/80'
                    }`}>
                      {note.noteName}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">{note.octave}</div>
                  </div>

                  {isPlayingNow && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center animate-ping" />
                  )}
                  {isCompleted && !isPlayingNow && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={10} className="text-slate-950 stroke-[3]" />
                    </div>
                  )}
                  {isCompleted && metric && (
                    <div className="text-[9px] font-bold text-emerald-400 mt-0.5">
                      {Math.round(metric.pitchAccuracy)}%
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Live Pitch Detection HUD */}
        {isPracticing && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-900/80 border border-pink-500/30 shadow-xl">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <span className="text-[11px] text-white/50 block mb-0.5">Detected Note</span>
                <span className="text-2xl font-extrabold text-white font-mono">
                  {detectedNote ? `${detectedNote}${detectedOctave}` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-white/50 block mb-0.5">Intonation Error</span>
                <span className={`text-2xl font-extrabold font-mono ${
                  Math.abs(centsDeviation) <= 15 ? 'text-emerald-400' :
                  Math.abs(centsDeviation) <= 30 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {centsDeviation > 0 ? `+${Math.round(centsDeviation)}` : Math.round(centsDeviation)}¢
                </span>
              </div>
              <div>
                <span className="text-[11px] text-white/50 block mb-0.5">Target Pitch</span>
                <span className="text-2xl font-extrabold text-pink-400 font-mono">
                  {scaleNotes[currentNoteIndex]?.noteName}{scaleNotes[currentNoteIndex]?.octave}
                </span>
              </div>
            </div>

            {/* Paced Progress Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/50 mb-1 font-mono">
                <span>Scale Progress</span>
                <span>{currentNoteIndex} / {scaleNotes.length}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-200"
                  style={{ width: `${(currentNoteIndex / Math.max(1, scaleNotes.length)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Session Analytics */}
        {sungNotes.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6 text-center">
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
              <div className="text-2xl font-extrabold text-white font-mono">{sessionStats.overallScore}%</div>
              <div className="text-[10px] text-white/50 font-medium">Overall Score</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
              <div className="text-2xl font-extrabold text-pink-400 font-mono">{sessionStats.sequenceAccuracy}%</div>
              <div className="text-[10px] text-white/50 font-medium">Sequence</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
              <div className="text-2xl font-extrabold text-purple-400 font-mono">{sessionStats.pitchAccuracy}%</div>
              <div className="text-[10px] text-white/50 font-medium">Intonation</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
              <div className="text-2xl font-extrabold text-emerald-400 font-mono">{sessionStats.voiceStability}%</div>
              <div className="text-[10px] text-white/50 font-medium">Stability</div>
            </div>
          </div>
        )}

        {/* 3 Primary Action Buttons Layout */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Button 1: Listen to Scale */}
          <button
            onClick={isPlayingScale ? stopScalePlayback : playEntireScale}
            disabled={isPracticing}
            className={`flex-1 min-w-[160px] py-3.5 px-4 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
              isPlayingScale
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30'
            } ${isPracticing ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {isPlayingScale ? (
              <>
                <Square size={16} /> Stop Reference
              </>
            ) : (
              <>
                <Volume2 size={16} /> 1. Listen to Scale
              </>
            )}
          </button>

          {/* Button 2: Start Practice */}
          {!isPracticing ? (
            <button
              onClick={startPractice}
              disabled={isPlayingScale}
              className="flex-1 min-w-[160px] py-3.5 px-4 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/25"
            >
              <Play size={16} /> 2. Start Practice
            </button>
          ) : (
            <button
              onClick={stopPractice}
              className="flex-1 min-w-[160px] py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25"
            >
              <Square size={16} /> Stop Practice
            </button>
          )}

          {/* Button 3: Reset */}
          <button
            onClick={resetSession}
            disabled={isPracticing || isPlayingScale}
            className="px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white/70 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-slate-700 disabled:opacity-40"
          >
            <RotateCcw size={16} /> Reset
          </button>

          {/* Save Button (when notes recorded) */}
          {sungNotes.length > 0 && !isPracticing && (
            <button
              onClick={saveSession}
              disabled={isSaving}
              className="px-5 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 text-slate-950 text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-40"
            >
              <Save size={16} /> {isSaving ? 'Saving...' : 'Save Session'}
            </button>
          )}
        </div>

        {/* Notification Messages */}
        {saveMessage && (
          <div className={`mt-4 p-3 rounded-xl text-xs font-semibold text-center ${
            saveMessage.includes('saved') ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
          }`}>
            {saveMessage}
          </div>
        )}

        {currentNoteIndex >= scaleNotes.length && scaleNotes.length > 0 && (
          <div className="mt-4 p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-center">
            <div className="text-emerald-400 font-bold text-sm mb-0.5">🎉 Scale Completed!</div>
            <div className="text-white/80 text-xs">
              Overall Score: <strong>{sessionStats.overallScore}%</strong> (Intonation: {sessionStats.pitchAccuracy}%, Sequence: {sessionStats.sequenceAccuracy}%)
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {variant === 'floating' ? (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-[140px] w-12 h-12 lg:bottom-6 lg:right-40 lg:w-14 lg:h-14 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-300 z-50"
          style={{ boxShadow: '0 8px 24px rgba(236, 72, 153, 0.4)' }}
          title="Scale Trainer"
        >
          <Music className="w-5 h-5 lg:w-6 lg:h-6" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-4 px-6 py-5 bg-gradient-to-br from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white rounded-2xl transition-all duration-300 w-full group border border-white/10"
          style={{ boxShadow: '0 8px 32px rgba(236, 72, 153, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Music className="w-6 h-6" />
          </div>
          <div className="text-left flex-1">
            <p className="font-semibold text-lg">Scale Trainer</p>
            <p className="text-sm text-white/70">Interval intonation, legato transitions & agility</p>
          </div>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <div className={`relative glass-card p-6 w-full ${isFullscreen ? 'max-w-none h-full' : 'max-w-2xl max-h-[90vh] overflow-y-auto'} rounded-2xl`}>
            {renderTrainer()}
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
