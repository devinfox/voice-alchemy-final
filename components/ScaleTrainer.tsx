'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Music, Play, Square, Save, RotateCcw, ChevronUp, ChevronDown, Mic, Check, ArrowUp, ArrowDown, ArrowUpDown, Volume2, VolumeX, Piano } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ToolDialog } from '@/components/ui/tool-dialog'
import { PitchTrail, type PitchTrailHandle } from '@/components/ui/pitch-trail'
import { SpotlightTour, SpotlightTriggerButton, SpotlightStep } from '@/components/spotlight-tour'
import { useVoiceTracker, type VoiceFrame } from '@/lib/use-voice-tracker'
import { analyzeHeldNote, describeHeldNote, midiToHz, tuningAccuracyOf, type NoteFrame } from '@/lib/pitch-scoring'
import { SCALE_GROUPS, NOTE_NAMES, getScale, describeDegree, backingChordIntervals } from '@/lib/music-theory'
import { playTone, startBackingChord, type ToneHandle } from '@/lib/tone-synth'
import type { DetectedNote } from '@/lib/pitch-detection'

const scaleTourSteps: SpotlightStep[] = [
  {
    target: '[data-tour="scale-settings"]',
    title: '1. Set Your Scale',
    content: 'Pick the kind of scale, the starting note, how high or low it sits (octave), which way it goes, and how fast the app plays it back to you. Not sure? The starting settings are fine — and when you sing, you can go at your own pace.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="listen-scale-btn"]',
    title: '2. Listen First',
    content: 'Tap "Play Scale" to hear the whole scale played once for you, so your ear knows what the notes should sound like before you sing.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="start-practice-btn"]',
    title: '3. Sing the Scale',
    content: 'Tap "Start Practice" and sing each note one at a time. When you finish, you get a score for the whole scale.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="scale-notes-strip"]',
    title: '4. Follow the Notes',
    content: 'These boxes are the notes of your scale — tap any box to hear its note. Once you press "Start Practice", the gold box is the note to sing. Land on it and it turns green, then the next box lights up. Any octave counts, so sing where your voice is comfortable.',
    placement: 'top',
  },
]

// How long the singer must be on a note before it counts. Long enough that
// sliding through a note on the way to another does not count, short enough
// that a scale can be sung at a musical speed.
const NOTE_LANDED_MS = 220
// A gap shorter than this inside a note (a consonant, a flicker) is ignored.
const NOTE_GAP_MS = 150

interface ScaleNote {
  noteName: string
  octave: number
  frequency: number
  position: number
  midi: number
  /** Semitones above the home note, 0-11. */
  degree: number
}

interface NoteMetric {
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
  /** Plain-language note for the screen and the AI coach. Not a DB column. */
  coachNote: string
  degree: number
}

/** The note that has just been accepted, still being listened to until the singer leaves it. */
interface NoteInProgress {
  note: ScaleNote
  frames: NoteFrame[]
  lastT: number
  octaveShift: number
  timeToSingMs: number | null
  order: number
}

type Direction = 'ascending' | 'descending' | 'both'

interface ScaleTrainerProps {
  variant?: 'floating' | 'card'
}

/** Distance between two pitches ignoring which octave they are in (-6..+6 semitones). */
function foldOctave(semitones: number): number {
  return ((((semitones + 6) % 12) + 12) % 12) - 6
}

export default function ScaleTrainer({ variant = 'floating' }: ScaleTrainerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Settings
  const [scaleType, setScaleType] = useState<string>('major')
  const [rootNote, setRootNote] = useState<string>('C')
  const [octave, setOctave] = useState<number>(4)
  const [direction, setDirection] = useState<Direction>('ascending')
  const [sensitivity, setSensitivity] = useState<number>(50)
  const [tempo, setTempo] = useState<number>(80) // BPM - beats per minute
  const [backing, setBacking] = useState(false)

  // Session state
  const [isPracticing, setIsPracticing] = useState(false)
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number>(0)
  const [noteMetrics, setNoteMetrics] = useState<Map<string, NoteMetric>>(new Map())

  // What the mic hears, for the live readout
  const [detected, setDetected] = useState<DetectedNote | null>(null)

  // Refs for audio playback
  const playbackContextRef = useRef<AudioContext | null>(null)
  const toneRef = useRef<ToneHandle | null>(null)
  const backingRef = useRef<ToneHandle | null>(null)
  const scalePlaybackRef = useRef<{ isPlaying: boolean; timeoutId: NodeJS.Timeout | null }>({ isPlaying: false, timeoutId: null })

  // Saving state
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Audio playback state
  const [playingNoteIndex, setPlayingNoteIndex] = useState<number | null>(null)
  const [isPlayingScale, setIsPlayingScale] = useState(false)
  const [volume, setVolume] = useState(0.5)

  const scale = getScale(scaleType)

  // The notes to sing, from the settings
  const scaleNotes = useMemo<ScaleNote[]>(() => {
    const rootIndex = NOTE_NAMES.indexOf(rootNote as (typeof NOTE_NAMES)[number])
    const rootMidi = (octave + 1) * 12 + Math.max(0, rootIndex)
    // One octave of the scale, finishing on the home note at the top.
    const up: ScaleNote[] = [...getScale(scaleType).intervals, 12].map((interval, idx) => {
      const midi = rootMidi + interval
      return {
        noteName: NOTE_NAMES[((midi % 12) + 12) % 12],
        octave: Math.floor(midi / 12) - 1,
        frequency: midiToHz(midi),
        position: idx + 1,
        midi,
        degree: interval % 12,
      }
    })

    if (direction === 'descending') {
      return [...up].reverse().map((n, i) => ({ ...n, position: i + 1 }))
    }
    if (direction === 'both') {
      const down = up.slice(0, -1).reverse()
      return [...up, ...down.map((n, i) => ({ ...n, position: up.length + i + 1 }))]
    }
    return up
  }, [scaleType, rootNote, octave, direction])

  // Initialize playback audio context
  const initPlaybackContext = useCallback(() => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (playbackContextRef.current.state === 'suspended') void playbackContextRef.current.resume()
    return playbackContextRef.current
  }, [])

  // Play a single note with a warm keyboard-like tone
  const playNoteFrequency = useCallback((frequency: number, duration: number = 1000) => {
    const ctx = initPlaybackContext()
    toneRef.current?.stop()
    const handle = playTone(ctx, frequency, {
      duration: duration / 1000,
      volume,
      onEnded: () => {
        // Only the most recent note clears the highlight
        if (toneRef.current === handle) setPlayingNoteIndex(null)
      },
    })
    toneRef.current = handle
  }, [initPlaybackContext, volume])

  // Play a specific note from the scale
  const playScaleNote = useCallback((index: number) => {
    if (index < 0 || index >= scaleNotes.length) return

    const note = scaleNotes[index]
    setPlayingNoteIndex(index)
    playNoteFrequency(note.frequency, 800)
  }, [scaleNotes, playNoteFrequency])

  // Play the entire scale
  const playEntireScale = useCallback(() => {
    if (isPlayingScale || scaleNotes.length === 0) return

    setIsPlayingScale(true)
    scalePlaybackRef.current.isPlaying = true

    let currentIndex = 0
    // Convert BPM to milliseconds per note: 60000ms / BPM = ms per beat
    const noteDuration = Math.round(60000 / tempo)

    const playNext = () => {
      if (!scalePlaybackRef.current.isPlaying || currentIndex >= scaleNotes.length) {
        setIsPlayingScale(false)
        setPlayingNoteIndex(null)
        scalePlaybackRef.current.isPlaying = false
        return
      }

      const note = scaleNotes[currentIndex]
      setPlayingNoteIndex(currentIndex)
      playNoteFrequency(note.frequency, noteDuration - 20)

      currentIndex++
      scalePlaybackRef.current.timeoutId = setTimeout(playNext, noteDuration)
    }

    playNext()
  }, [isPlayingScale, scaleNotes, playNoteFrequency, tempo])

  // Stop scale playback
  const stopScalePlayback = useCallback(() => {
    scalePlaybackRef.current.isPlaying = false
    if (scalePlaybackRef.current.timeoutId) {
      clearTimeout(scalePlaybackRef.current.timeoutId)
      scalePlaybackRef.current.timeoutId = null
    }
    toneRef.current?.stop()
    toneRef.current = null
    setIsPlayingScale(false)
    setPlayingNoteIndex(null)
  }, [])

  const stopBacking = useCallback(() => {
    backingRef.current?.stop()
    backingRef.current = null
  }, [])

  // ==========================================================================
  // LISTENING AND SCORING
  // ==========================================================================
  // Readings arrive ~90 times a second, so progress lives in refs and React
  // state only changes when a note is actually landed or finished.

  const scaleNotesRef = useRef(scaleNotes)
  const isPracticingRef = useRef(false)
  const indexRef = useRef(0)
  const runRef = useRef<NoteFrame[]>([])
  const runShiftRef = useRef(0)
  const inProgressRef = useRef<NoteInProgress | null>(null)
  const lastLandedAtRef = useRef(0)
  const landedCountRef = useRef(0)
  const trailRef = useRef<PitchTrailHandle | null>(null)

  useEffect(() => {
    scaleNotesRef.current = scaleNotes
  }, [scaleNotes])

  /** Turn the readings for one note into its score. */
  const scoreNote = useCallback((item: NoteInProgress) => {
    const analysis = analyzeHeldNote(item.frames, item.note.midi)
    const verdict = describeHeldNote(analysis)
    const metric: NoteMetric = {
      noteName: item.note.noteName,
      octave: item.note.octave,
      expectedPosition: item.note.position,
      actualPosition: item.order,
      targetFrequency: item.note.frequency,
      pitchAccuracy: tuningAccuracyOf(analysis.deviationCents),
      centsDeviation: analysis.deviationCents,
      targetAccuracy: Math.max(0, 100 - Math.min(25, Math.abs(analysis.deviationCents) * 0.5)),
      voiceStability: analysis.steadiness,
      timeToSingMs: item.timeToSingMs,
      wasInOrder: true,
      sampleCount: item.frames.length,
      avgDetectedFrequency: midiToHz(analysis.centerMidi + item.octaveShift * 12),
      coachNote: [verdict.headline, verdict.detail].filter(Boolean).join('. '),
      degree: item.note.degree,
    }
    setNoteMetrics(prev => new Map(prev).set(`${item.note.position}`, metric))
  }, [])

  /** The singer has left the note (or gone quiet): its score is final. */
  const finishNoteInProgress = useCallback(() => {
    const item = inProgressRef.current
    if (!item) return
    inProgressRef.current = null
    scoreNote(item)
    // Last note of the scale finished: the run is over.
    if (indexRef.current >= scaleNotesRef.current.length && isPracticingRef.current) {
      isPracticingRef.current = false
      setIsPracticing(false)
      stopBacking()
    }
  }, [scoreNote, stopBacking])

  const handleFrame = useCallback((frame: VoiceFrame) => {
    if (!isPracticingRef.current) return

    // Still on the note that was just accepted? Keep listening to it, so it is
    // scored on the whole note rather than its first moment.
    const item = inProgressRef.current
    if (item) {
      const offset = foldOctave(frame.midi - item.note.midi)
      if (Math.abs(offset) <= 0.6 && frame.time - item.lastT < NOTE_GAP_MS && item.frames.length < 400) {
        item.frames.push({ t: frame.time, midi: item.note.midi + offset })
        item.lastT = frame.time
        trailRef.current?.push(frame.time, item.note.midi + offset, item.note.midi)
        return
      }
      finishNoteInProgress()
    }

    const notes = scaleNotesRef.current
    if (indexRef.current >= notes.length) return
    const expected = notes[indexRef.current]

    // Any octave counts: a low voice singing a scale written an octave up is
    // singing the right notes.
    const offset = foldOctave(frame.midi - expected.midi)
    trailRef.current?.push(frame.time, expected.midi + offset, expected.midi)

    if (Math.abs(offset) > 0.5) {
      runRef.current = []
      return
    }

    const run = runRef.current
    if (run.length > 0 && frame.time - run[run.length - 1].t > NOTE_GAP_MS) run.length = 0
    if (run.length === 0) runShiftRef.current = Math.round((frame.midi - expected.midi - offset) / 12)
    run.push({ t: frame.time, midi: expected.midi + offset })

    if (frame.time - run[0].t >= NOTE_LANDED_MS) {
      landedCountRef.current += 1
      inProgressRef.current = {
        note: expected,
        frames: run,
        lastT: frame.time,
        octaveShift: runShiftRef.current,
        timeToSingMs: lastLandedAtRef.current ? Math.round(frame.time - lastLandedAtRef.current) : null,
        order: landedCountRef.current,
      }
      lastLandedAtRef.current = frame.time
      runRef.current = []
      indexRef.current += 1
      setCurrentNoteIndex(indexRef.current)
      // Show a score straight away; it is refined when the note ends.
      scoreNote(inProgressRef.current)
    }
  }, [finishNoteInProgress, scoreNote])

  const handleNote = useCallback((note: DetectedNote | null) => {
    setDetected(note)
    // Silence ends whatever note was being held.
    if (!note) finishNoteInProgress()
  }, [finishNoteInProgress])

  const { isListening, start: startListening, stop: stopListening } = useVoiceTracker({
    sensitivity,
    onFrame: handleFrame,
    onNote: handleNote,
  })

  // Scores for the run so far, always in step with the notes scored
  const sessionStats = useMemo(() => {
    const metrics = Array.from(noteMetrics.values())
    const totalExpected = scaleNotes.length
    const totalSung = Math.min(totalExpected, metrics.length)
    const pitchAccuracy = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.pitchAccuracy, 0) / metrics.length
      : 0
    const sequenceAccuracy = totalExpected > 0 ? Math.min(100, (totalSung / totalExpected) * 100) : 0
    return {
      notesAttempted: totalExpected,
      notesCorrect: totalSung,
      sequenceAccuracy,
      pitchAccuracy,
      overallScore: Math.min(100, sequenceAccuracy * 0.5 + pitchAccuracy * 0.5),
    }
  }, [noteMetrics, scaleNotes])

  // What a teacher would point out after hearing the scale
  const insights = useMemo<string[]>(() => {
    const metrics = Array.from(noteMetrics.values())
    if (metrics.length < 3) return []
    const lines: string[] = []

    const toughest = [...metrics].sort((a, b) => Math.abs(b.centsDeviation) - Math.abs(a.centsDeviation))[0]
    if (Math.abs(toughest.centsDeviation) > 20) {
      const degree = describeDegree(toughest.degree)
      const where = toughest.centsDeviation > 0 ? 'high' : 'low'
      lines.push(`Trickiest note: ${toughest.noteName}, ${degree.name}. You sang it a little ${where}. ${degree.tip}`)
    } else {
      lines.push('Every note landed in tune. Try a faster speed or a new scale.')
    }

    // Going up against coming down
    if (direction === 'both') {
      const turn = Math.ceil(scaleNotes.length / 2)
      const average = (list: NoteMetric[]) =>
        list.length > 0 ? list.reduce((sum, m) => sum + m.centsDeviation, 0) / list.length : 0
      const up = average(metrics.filter(m => m.expectedPosition <= turn))
      const down = average(metrics.filter(m => m.expectedPosition > turn))
      if (down < -15 && down < up - 10) {
        lines.push('You sink a little on the way down. Keep the same energy coming down as going up.')
      } else if (up > 15 && up > down + 10) {
        lines.push('You push a little high on the way up. Stay relaxed as you climb.')
      }
    }

    const shaky = metrics.filter(m => m.voiceStability < 60).length
    if (shaky >= Math.ceil(metrics.length / 2)) {
      lines.push('Several notes wavered. Slow the scale down and give each note a steady breath.')
    }
    return lines
  }, [noteMetrics, direction, scaleNotes])

  const resetSession = useCallback(() => {
    indexRef.current = 0
    runRef.current = []
    inProgressRef.current = null
    lastLandedAtRef.current = 0
    landedCountRef.current = 0
    trailRef.current?.clear()
    setCurrentNoteIndex(0)
    setNoteMetrics(new Map())
    setSaveMessage(null)
  }, [])

  // New settings mean a new scale: start again
  useEffect(() => {
    resetSession()
  }, [scaleNotes, resetSession])

  const startPractice = async () => {
    if (!isListening) {
      const ok = await startListening()
      if (!ok) return
    }
    resetSession()
    setStartedAt(new Date())
    isPracticingRef.current = true
    setIsPracticing(true)

    if (backing) {
      const ctx = initPlaybackContext()
      const home = scaleNotes.find(n => n.degree === 0)?.midi ?? scaleNotes[0].midi
      // Sit the chord low so it supports the voice instead of covering it.
      let base = home
      while (base > 55) base -= 12
      stopBacking()
      backingRef.current = startBackingChord(ctx, backingChordIntervals(scale).map(i => midiToHz(base + i)), volume)
    }
  }

  const stopPractice = () => {
    finishNoteInProgress()
    isPracticingRef.current = false
    setIsPracticing(false)
    stopBacking()
  }

  const saveSession = async () => {
    if (!startedAt || noteMetrics.size === 0) {
      setSaveMessage('No notes to save')
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
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
          totalNotesSung: noteMetrics.size,
          notesInCorrectOrder: noteMetrics.size,
          sequenceAccuracy: sessionStats.sequenceAccuracy,
          pitchAccuracy: sessionStats.pitchAccuracy,
          overallScore: sessionStats.overallScore,
          noteMetrics: Array.from(noteMetrics.values()),
          // For the AI coach
          scaleName: scale.name,
          insights,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save session')
      }

      setSaveMessage(data.isNewBest ? 'New best score saved!' : 'Session saved!')
    } catch (err) {
      console.error('Error saving session:', err)
      setSaveMessage('Failed to save session')
    } finally {
      setIsSaving(false)
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      stopScalePlayback()
      backingRef.current?.stop()
      if (playbackContextRef.current) {
        void playbackContextRef.current.close().catch(() => {})
        playbackContextRef.current = null
      }
    }
  }, [stopScalePlayback])

  const handleClose = () => {
    if (isPracticing) {
      stopPractice()
    }
    stopScalePlayback()
    stopBacking()
    stopListening()
    setDetected(null)
    setIsOpen(false)
    setIsFullscreen(false)
    resetSession()
  }

  // The note to sing right now, and how the voice compares with it
  const targetNote = scaleNotes[currentNoteIndex]
  const liveOffsetCents = detected && targetNote
    ? foldOctave(69 + 12 * Math.log2(detected.frequency / 440) - targetNote.midi) * 100
    : null
  // Still holding the note that was just ticked off: that is a success, not
  // "too low" for a note they have not moved to yet.
  const previousNote = currentNoteIndex > 0 ? scaleNotes[currentNoteIndex - 1] : undefined
  const stillOnPrevious = detected && previousNote && liveOffsetCents !== null && Math.abs(liveOffsetCents) > 50
    ? Math.abs(foldOctave(69 + 12 * Math.log2(detected.frequency / 440) - previousNote.midi)) <= 0.6
    : false
  const liveHint = liveOffsetCents === null
    ? { text: 'Listening…', className: 'text-white/50' }
    : stillOnPrevious
      ? { text: 'Got it! Next note', className: 'text-emerald-400' }
    : Math.abs(liveOffsetCents) <= 15
      ? { text: 'Spot on', className: 'text-emerald-400' }
      : Math.abs(liveOffsetCents) <= 50
        ? { text: liveOffsetCents > 0 ? 'A little high' : 'A little low', className: 'text-amber-400' }
        : { text: liveOffsetCents > 0 ? 'Too high' : 'Too low', className: 'text-red-400' }
  const isComplete = scaleNotes.length > 0 && currentNoteIndex >= scaleNotes.length

  const getDirectionIcon = () => {
    switch (direction) {
      case 'ascending': return <ArrowUp size={16} />
      case 'descending': return <ArrowDown size={16} />
      case 'both': return <ArrowUpDown size={16} />
    }
  }

  // Render the trainer content
  const renderTrainer = () => (
    <div>
      <div>
        {/* Settings */}
        <div data-tour="scale-settings" className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Scale</label>
            <select
              value={scaleType}
              onChange={(e) => setScaleType(e.target.value)}
              disabled={isPracticing}
              className="glass-select w-full text-sm"
            >
              {SCALE_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.scales.map(option => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Root Note</label>
            <select
              value={rootNote}
              onChange={(e) => setRootNote(e.target.value)}
              disabled={isPracticing}
              className="glass-select w-full text-sm"
            >
              {NOTE_NAMES.map(note => (
                <option key={note} value={note}>{note}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Octave</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOctave(o => Math.max(2, o - 1))}
                disabled={isPracticing || octave <= 2}
                className={buttonVariants({ size: 'icon' })}
              >
                <ChevronDown size={16} />
              </button>
              <span className="w-8 text-center font-semibold tabular-nums text-white">{octave}</span>
              <button
                onClick={() => setOctave(o => Math.min(6, o + 1))}
                disabled={isPracticing || octave >= 6}
                className={buttonVariants({ size: 'icon' })}
              >
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Speed</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTempo(t => Math.max(40, t - 10))}
                disabled={isPracticing || tempo <= 40}
                className={buttonVariants({ size: 'icon' })}
              >
                <ChevronDown size={16} />
              </button>
              <span className="w-10 text-center font-semibold tabular-nums text-white">{tempo}</span>
              <button
                onClick={() => setTempo(t => Math.min(200, t + 10))}
                disabled={isPracticing || tempo >= 200}
                className={buttonVariants({ size: 'icon' })}
              >
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Direction</label>
            <button
              onClick={() => setDirection(d => d === 'ascending' ? 'descending' : d === 'descending' ? 'both' : 'ascending')}
              disabled={isPracticing}
              className={buttonVariants({ block: true })}
            >
              {getDirectionIcon()}
              <span className="capitalize">{direction}</span>
            </button>
          </div>
        </div>

        {/* Sensitivity */}
        <div className="mb-6">
          <label className="mb-1.5 block text-xs text-gray-400">Mic sensitivity: {sensitivity}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="va-range w-full"
          />
        </div>

        {/* Scale Display */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Scale: </span>
              <span className="text-gold-400 font-medium">
                {rootNote} {scale.name}
              </span>
              <span className="text-white/40 text-xs">
                ({scale.mood})
              </span>
            </div>
          </div>

          {/* Volume and backing chord */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <VolumeX size={14} className="text-white/40" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume * 100}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                aria-label="Volume"
                className="va-range w-24"
              />
              <Volume2 size={14} className="text-white/40" />
            </div>
            <Button
              size="sm"
              variant={backing ? 'success' : 'secondary'}
              aria-pressed={backing}
              onClick={() => setBacking(b => !b)}
              disabled={isPracticing}
              title="Hold a soft chord under you while you sing, like a teacher at the piano. Best with headphones."
            >
              <Piano />
              Backing chord: {backing ? 'On' : 'Off'}
            </Button>
          </div>

          <div data-tour="scale-notes-strip" className="flex flex-wrap gap-1.5 sm:gap-2">
            {scaleNotes.map((note, idx) => {
              const isCurrentNote = idx === currentNoteIndex
              const isCompleted = idx < currentNoteIndex
              const isPlaying = playingNoteIndex === idx
              const metric = noteMetrics.get(`${note.position}`)

              return (
                <button
                  key={`${note.noteName}-${note.octave}-${idx}`}
                  onClick={() => !isPracticing && playScaleNote(idx)}
                  disabled={isPracticing}
                  className={`
                    relative px-2.5 py-3 sm:px-4 rounded-xl border transition-all duration-300 cursor-pointer
                    ${isPlaying ? 'border-yellow-500 bg-yellow-500/20 scale-105 shadow-lg shadow-yellow-500/30' : ''}
                    ${isCurrentNote && !isPlaying ? 'border-gold-400 bg-gold-400/15 scale-110' : ''}
                    ${isCompleted && !isPlaying ? 'border-emerald-500/50 bg-emerald-500/10' : ''}
                    ${!isCurrentNote && !isCompleted && !isPlaying ? 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20' : ''}
                    ${isPracticing ? 'cursor-default' : ''}
                  `}
                >
                  <div className="text-center">
                    <div className={`text-lg font-bold ${
                      isPlaying ? 'text-amber-400' :
                      isCurrentNote ? 'text-gold-400' :
                      isCompleted ? 'text-emerald-400' :
                      'text-white/70'
                    }`}>
                      {note.noteName}
                    </div>
                    <div className="text-xs text-white/40">{note.octave}</div>
                  </div>

                  {isPlaying && (
                    <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center animate-pulse">
                      <Volume2 size={10} className="text-white" />
                    </div>
                  )}

                  {isCompleted && !isPlaying && (
                    <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}

                  {isCompleted && metric && (
                    <div
                      className={`absolute -bottom-1 left-1/2 -translate-x-1/2 text-[11px] ${
                        metric.pitchAccuracy >= 70 ? 'text-emerald-400' : metric.pitchAccuracy >= 40 ? 'text-amber-400' : 'text-red-400'
                      }`}
                      title={metric.coachNote}
                    >
                      {Math.round(metric.pitchAccuracy)}%
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Hint */}
          {!isPracticing && (
            <p className="text-xs text-white/40 mt-2">
              Click any note to hear it, or use &quot;Play Scale&quot; below to hear the whole scale once
            </p>
          )}
        </div>

        {/* Live Detection */}
        {isPracticing && (
          <div className="mb-4 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-white/50">Sing this</span>
                <div className="text-xl font-bold tabular-nums text-gold-400">
                  {targetNote ? `${targetNote.noteName}${targetNote.octave}` : '—'}
                </div>
              </div>
              <div className="text-center">
                <span className="text-xs text-white/50">How close</span>
                <div className={`text-xl font-bold ${liveHint.className}`}>{liveHint.text}</div>
              </div>
              <div className="text-right">
                <span className="text-xs text-white/50">We hear</span>
                <div className="text-xl font-bold tabular-nums text-white">
                  {detected ? `${detected.nameAscii}${detected.octave}` : '—'}
                </div>
              </div>
            </div>

            <PitchTrail ref={trailRef} className="mt-3 h-20" />
            <p className="mt-1 text-center text-xs text-white/40">
              The line is your voice. Keep it inside the green band. Any octave counts.
            </p>

            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/50 mb-1">
                <span>Progress</span>
                <span>{currentNoteIndex} / {scaleNotes.length}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-300"
                  style={{ width: `${(currentNoteIndex / scaleNotes.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {noteMetrics.size > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 rounded-2xl border border-white/10 bg-white/[0.04]">
              <div className="text-xl font-bold tabular-nums text-gold-400">
                {Math.round(sessionStats.sequenceAccuracy)}%
              </div>
              <div className="text-xs text-white/50">Sequence</div>
            </div>
            <div className="text-center p-3 rounded-2xl border border-white/10 bg-white/[0.04]">
              <div className="text-xl font-bold tabular-nums text-white">
                {Math.round(sessionStats.pitchAccuracy)}%
              </div>
              <div className="text-xs text-white/50">Pitch Accuracy</div>
            </div>
            <div className="text-center p-3 rounded-2xl border border-white/10 bg-white/[0.04]">
              <div className="text-xl font-bold tabular-nums text-emerald-400">
                {Math.round(sessionStats.overallScore)}%
              </div>
              <div className="text-xs text-white/50">Overall Score</div>
            </div>
          </div>
        )}

        {/* Controls: every action is the same size; nothing competes */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Play Scale: plays the scale once so the singer can hear and copy it */}
          <Button
            size="lg"
            data-tour="listen-scale-btn"
            onClick={isPlayingScale ? stopScalePlayback : playEntireScale}
            disabled={isPracticing}
            title="Hear the scale once before singing"
          >
            {isPlayingScale ? <Square /> : <Volume2 />}
            {isPlayingScale ? 'Stop' : 'Play Scale'}
          </Button>

          {!isPracticing ? (
            <Button
              size="lg"
              data-tour="start-practice-btn"
              onClick={startPractice}
              disabled={isPlayingScale}
              title="Sing and practice the scale"
            >
              <Play />
              Start Practice
            </Button>
          ) : (
            <Button size="lg" variant="danger" onClick={stopPractice}>
              <Square />
              Stop Practice
            </Button>
          )}

          <Button size="lg" onClick={resetSession} disabled={isPracticing}>
            <RotateCcw />
            Reset
          </Button>

          {noteMetrics.size > 0 && !isPracticing && (
            <Button size="lg" variant="outline" onClick={saveSession} disabled={isSaving}>
              <Save />
              {isSaving ? 'Saving…' : 'Save Session'}
            </Button>
          )}
        </div>

        {/* Messages */}
        {saveMessage && (
          <div className={`mt-4 rounded-2xl p-3 text-sm ${saveMessage.includes('Failed') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            {saveMessage}
          </div>
        )}

        {isComplete && (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
            <div className="text-emerald-400 font-semibold mb-1">Scale Completed!</div>
            <div className="text-white/70 text-sm">
              Overall Score: {Math.round(sessionStats.overallScore)}%
            </div>
          </div>
        )}

        {/* What a teacher would point out */}
        {!isPracticing && insights.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4" aria-live="polite">
            <div className="mb-1.5 text-sm font-semibold text-white">Your coach says</div>
            <ul className="space-y-1.5 text-sm text-white/75">
              {insights.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Trigger Button */}
      {variant === 'floating' ? (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-[140px] w-12 h-12 lg:bottom-6 lg:right-40 lg:w-14 lg:h-14 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-300 z-40"
          style={{ boxShadow: '0 8px 24px rgba(236, 72, 153, 0.4)' }}
          title="Scale Trainer"
        >
          <Music className="w-5 h-5 lg:w-6 lg:h-6" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex h-full min-h-[88px] w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-gradient-to-br from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 px-5 py-4 text-white transition-all duration-300"
          style={{ boxShadow: '0 8px 32px rgba(236, 72, 153, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 transition-transform duration-300 group-hover:scale-110">
            <Music className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[15px] font-bold leading-tight">Scale Trainer</p>
            <p className="mt-0.5 text-xs leading-snug text-white/75">Practice scales & sequences</p>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 transition-colors group-hover:bg-white/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <ToolDialog
          titleId="scale-trainer-title"
          title="Scale Trainer"
          subtitle="Hear a scale, then sing it back note by note."
          icon={<Music />}
          onClose={handleClose}
          fullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          actions={
            <>
              {isListening && (
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 sm:inline-flex">
                  <Mic className="size-3.5" />
                  Listening
                </span>
              )}
              <SpotlightTriggerButton tourKey="scale_trainer_v4" label="How to" />
            </>
          }
          beforeBody={<SpotlightTour tourKey="scale_trainer_v4" steps={scaleTourSteps} />}
        >
          {renderTrainer()}
        </ToolDialog>
      )}

    </>
  )
}
