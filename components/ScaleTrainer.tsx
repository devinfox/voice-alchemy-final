'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Script from 'next/script'
import { Music, Play, Square, Save, RotateCcw, ChevronUp, ChevronDown, Mic, MicOff, Check, X, ArrowUp, ArrowDown, ArrowUpDown, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react'

// Audio playback constants
const MIDDLE_A = 440
const SEMITONE = 69

// Scale definitions (intervals from root in semitones)
const SCALE_DEFINITIONS: Record<string, { name: string; intervals: number[]; description: string }> = {
  major: { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11, 12], description: 'Happy, bright sound' },
  natural_minor: { name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10, 12], description: 'Sad, melancholic' },
  harmonic_minor: { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11, 12], description: 'Exotic, Middle Eastern' },
  melodic_minor: { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11, 12], description: 'Jazz, ascending pattern' },
  pentatonic_major: { name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9, 12], description: 'Folk, rock solos' },
  pentatonic_minor: { name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10, 12], description: 'Blues, rock' },
  blues: { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10, 12], description: 'Blues with blue note' },
  chromatic: { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], description: 'All 12 notes' },
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NOTE_FREQUENCIES: Record<string, number> = {
  'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
  'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
  'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88,
}

interface ScaleNote {
  noteName: string
  octave: number
  frequency: number
  position: number
}

interface SungNote {
  noteName: string
  octave: number
  frequency: number
  detectedFrequency: number
  centsDeviation: number
  pitchAccuracy: number
  timestamp: number
  samples: number
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
}

type Direction = 'ascending' | 'descending' | 'both'

interface ScaleTrainerProps {
  variant?: 'floating' | 'card'
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

  // Session state
  const [isActive, setIsActive] = useState(false)
  const [isPracticing, setIsPracticing] = useState(false)
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [scaleNotes, setScaleNotes] = useState<ScaleNote[]>([])
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number>(0)
  const [sungNotes, setSungNotes] = useState<SungNote[]>([])
  const [noteMetrics, setNoteMetrics] = useState<Map<string, NoteMetric>>(new Map())

  // Audio state
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [detectedNote, setDetectedNote] = useState<string | null>(null)
  const [detectedOctave, setDetectedOctave] = useState<number | null>(null)
  const [detectedFrequency, setDetectedFrequency] = useState<number | null>(null)
  const [centsDeviation, setCentsDeviation] = useState<number>(0)
  const [isListening, setIsListening] = useState(false)

  // Refs for audio processing (pitch detection)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const pitchDetectorRef = useRef<any>(null)

  // Constants for pitch detection (matching ModernPitchTrainer)
  const BUFFER_SIZE = 4096
  const MIDDLE_A_FREQ = 440
  const SEMITONE_OFFSET = 69

  // Refs for audio playback
  const playbackContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const scalePlaybackRef = useRef<{ isPlaying: boolean; timeoutId: NodeJS.Timeout | null }>({ isPlaying: false, timeoutId: null })

  // Stats
  const [sessionStats, setSessionStats] = useState({
    notesAttempted: 0,
    notesCorrect: 0,
    sequenceAccuracy: 0,
    pitchAccuracy: 0,
    overallScore: 0,
  })

  // Saving state
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Aubio loading state
  const [aubioLoaded, setAubioLoaded] = useState(false)

  // Audio playback state
  const [isPlayingNote, setIsPlayingNote] = useState(false)
  const [playingNoteIndex, setPlayingNoteIndex] = useState<number | null>(null)
  const [isPlayingScale, setIsPlayingScale] = useState(false)
  const [volume, setVolume] = useState(0.5)

  // Generate scale notes based on settings
  useEffect(() => {
    const scale = SCALE_DEFINITIONS[scaleType]
    if (!scale) return

    const rootIndex = NOTE_NAMES.indexOf(rootNote)
    let notes: ScaleNote[] = []

    scale.intervals.forEach((interval, idx) => {
      const noteIndex = (rootIndex + interval) % 12
      const noteOctave = octave + Math.floor((rootIndex + interval) / 12)
      const noteName = NOTE_NAMES[noteIndex]
      const baseFreq = NOTE_FREQUENCIES[noteName]
      const frequency = baseFreq * Math.pow(2, noteOctave - 4)

      notes.push({
        noteName,
        octave: noteOctave,
        frequency,
        position: idx + 1,
      })
    })

    if (direction === 'descending') {
      notes = notes.reverse().map((n, i) => ({ ...n, position: i + 1 }))
    } else if (direction === 'both') {
      const ascending = [...notes]
      const descending = notes.slice(0, -1).reverse()
      notes = [...ascending, ...descending.map((n, i) => ({ ...n, position: ascending.length + i + 1 }))]
    }

    setScaleNotes(notes)
    resetSession()
  }, [scaleType, rootNote, octave, direction])

  // Initialize playback audio context
  const initPlaybackContext = useCallback(() => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return playbackContextRef.current
  }, [])

  // Play a single note using sine wave oscillator
  const playNoteFrequency = useCallback((frequency: number, duration: number = 1000) => {
    const ctx = initPlaybackContext()

    // Stop any existing oscillator
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop()
        oscillatorRef.current.disconnect()
      } catch (e) {
        // Already stopped
      }
    }

    // Create oscillator and gain node
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(volume * 0.3, ctx.currentTime + 0.05) // Attack
    gainNode.gain.setValueAtTime(volume * 0.3, ctx.currentTime + duration / 1000 - 0.1) // Sustain
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration / 1000) // Release

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillatorRef.current = oscillator
    gainNodeRef.current = gainNode

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration / 1000)

    setIsPlayingNote(true)

    oscillator.onended = () => {
      setIsPlayingNote(false)
      setPlayingNoteIndex(null)
    }
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
      playNoteFrequency(note.frequency, noteDuration - 50)

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
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop()
        oscillatorRef.current.disconnect()
      } catch (e) {
        // Already stopped
      }
    }
    setIsPlayingScale(false)
    setIsPlayingNote(false)
    setPlayingNoteIndex(null)
  }, [])

  // Helper functions for pitch detection (matching chromatic tuner)
  const getNote = useCallback((frequency: number): number => {
    const note = 12 * (Math.log(frequency / MIDDLE_A_FREQ) / Math.log(2))
    return Math.round(note) + SEMITONE_OFFSET
  }, [])

  const getStandardFrequency = useCallback((note: number): number => {
    return MIDDLE_A_FREQ * Math.pow(2, (note - SEMITONE_OFFSET) / 12)
  }, [])

  const getCents = useCallback((frequency: number, note: number): number => {
    return Math.floor(
      (1200 * Math.log(frequency / getStandardFrequency(note))) / Math.log(2)
    )
  }, [getStandardFrequency])

  // Refs to keep callbacks updated without recreating audio processing
  const sensitivityRef = useRef(sensitivity)
  const isPracticingRef = useRef(isPracticing)
  const processDetectedNoteRef = useRef<((noteName: string, noteOctave: number, frequency: number, cents: number) => void) | null>(null)

  useEffect(() => {
    sensitivityRef.current = sensitivity
  }, [sensitivity])

  useEffect(() => {
    isPracticingRef.current = isPracticing
  }, [isPracticing])

  // Initialize Aubio pitch detector with ScriptProcessorNode (like ModernPitchTrainer)
  const initAudio = useCallback(async () => {
    try {
      // Check if aubio is loaded
      if (!window.aubio) {
        alert('Audio library is still loading. Please wait a moment and try again.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      setHasPermission(true)

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

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.connect(scriptProcessorRef.current)
      scriptProcessorRef.current.connect(audioContextRef.current.destination)

      // Real-time audio processing via ScriptProcessorNode
      scriptProcessorRef.current.addEventListener('audioprocess', (event: AudioProcessingEvent) => {
        if (sensitivityRef.current === 0) return

        const input = event.inputBuffer.getChannelData(0)

        // Calculate RMS for volume threshold
        let sum = 0.0
        for (let i = 0; i < input.length; ++i) {
          sum += input[i] * input[i]
        }
        const rms = Math.sqrt(sum / input.length)

        // Threshold based on sensitivity (higher sensitivity = lower threshold)
        const threshold = 0.01 + (1 - sensitivityRef.current / 100) * 0.09
        if (rms < threshold) return

        // Get frequency from aubio
        const frequency = pitchDetectorRef.current.do(input)

        if (frequency && frequency > 60 && frequency < 2000) {
          const note = getNote(frequency)
          const cents = getCents(frequency, note)
          const noteIndex = ((note % 12) + 12) % 12
          const noteName = NOTE_NAMES[noteIndex]
          const noteOctave = Math.floor(note / 12) - 1

          // Update UI state
          setDetectedNote(noteName)
          setDetectedOctave(noteOctave)
          setDetectedFrequency(frequency)
          setCentsDeviation(cents)

          // Process for scale training if practicing
          if (isPracticingRef.current && processDetectedNoteRef.current) {
            processDetectedNoteRef.current(noteName, noteOctave, frequency, cents)
          }
        }
      })

      setIsListening(true)
    } catch (err) {
      console.error('Error initializing audio:', err)
      setHasPermission(false)
    }
  }, [getNote, getCents])

  // Process detected note
  const lastNoteTimeRef = useRef<number>(0)
  const currentSamplesRef = useRef<{ freq: number; cents: number }[]>([])
  const matchedNoteRef = useRef<string | null>(null)

  const processDetectedNote = useCallback((noteName: string, noteOctave: number, frequency: number, cents: number) => {
    if (currentNoteIndex >= scaleNotes.length) return

    const expectedNote = scaleNotes[currentNoteIndex]
    const noteKey = `${noteName}-${noteOctave}`
    const expectedKey = `${expectedNote.noteName}-${expectedNote.octave}`

    currentSamplesRef.current.push({ freq: frequency, cents })

    if (noteKey === expectedKey) {
      if (currentSamplesRef.current.length >= 5) {
        const now = Date.now()
        const timeFromLast = lastNoteTimeRef.current ? now - lastNoteTimeRef.current : null

        const samples = currentSamplesRef.current
        const avgFreq = samples.reduce((s, x) => s + x.freq, 0) / samples.length
        const avgCents = samples.reduce((s, x) => s + x.cents, 0) / samples.length

        const freqVariance = samples.reduce((s, x) => s + Math.pow(x.freq - avgFreq, 2), 0) / samples.length
        const freqStdDev = Math.sqrt(freqVariance)
        const voiceStability = Math.max(0, Math.min(100, 100 - freqStdDev * 2))

        const pitchAccuracy = Math.max(0, Math.min(100, 100 - Math.abs(avgCents) * 2))

        const centsPenalty = Math.min(25, Math.abs(avgCents) * 0.5)
        const targetAccuracy = Math.max(0, 100 - centsPenalty)

        const sungNote: SungNote = {
          noteName,
          octave: noteOctave,
          frequency: expectedNote.frequency,
          detectedFrequency: avgFreq,
          centsDeviation: avgCents,
          pitchAccuracy,
          timestamp: now,
          samples: samples.length,
        }
        setSungNotes(prev => [...prev, sungNote])

        const metric: NoteMetric = {
          noteName,
          octave: noteOctave,
          expectedPosition: expectedNote.position,
          actualPosition: sungNotes.length + 1,
          targetFrequency: expectedNote.frequency,
          pitchAccuracy,
          centsDeviation: avgCents,
          targetAccuracy,
          voiceStability,
          timeToSingMs: timeFromLast,
          wasInOrder: true,
          sampleCount: samples.length,
          avgDetectedFrequency: avgFreq,
        }
        setNoteMetrics(prev => new Map(prev).set(`${expectedNote.position}`, metric))

        setCurrentNoteIndex(prev => prev + 1)
        lastNoteTimeRef.current = now
        currentSamplesRef.current = []
        matchedNoteRef.current = null

        updateStats()
      }
    } else {
      if (matchedNoteRef.current !== noteKey) {
        currentSamplesRef.current = [{ freq: frequency, cents }]
        matchedNoteRef.current = noteKey
      }
    }
  }, [currentNoteIndex, scaleNotes, sungNotes])

  // Keep the processDetectedNote ref updated
  useEffect(() => {
    processDetectedNoteRef.current = processDetectedNote
  }, [processDetectedNote])

  const updateStats = useCallback(() => {
    const totalExpected = scaleNotes.length
    const totalSung = sungNotes.length + 1

    const metrics = Array.from(noteMetrics.values())
    const avgPitchAccuracy = metrics.length > 0
      ? metrics.reduce((s, m) => s + m.pitchAccuracy, 0) / metrics.length
      : 0

    const sequenceAccuracy = (totalSung / totalExpected) * 100
    const overallScore = (sequenceAccuracy * 0.5) + (avgPitchAccuracy * 0.5)

    setSessionStats({
      notesAttempted: totalExpected,
      notesCorrect: totalSung,
      sequenceAccuracy,
      pitchAccuracy: avgPitchAccuracy,
      overallScore,
    })
  }, [scaleNotes, sungNotes, noteMetrics])

  const resetSession = () => {
    setCurrentNoteIndex(0)
    setSungNotes([])
    setNoteMetrics(new Map())
    setSessionStats({
      notesAttempted: 0,
      notesCorrect: 0,
      sequenceAccuracy: 0,
      pitchAccuracy: 0,
      overallScore: 0,
    })
    lastNoteTimeRef.current = 0
    currentSamplesRef.current = []
    matchedNoteRef.current = null
    setSaveMessage(null)
  }

  const startPractice = async () => {
    if (!isListening) {
      await initAudio()
    }
    resetSession()
    setStartedAt(new Date())
    setIsPracticing(true)
    setIsActive(true)
  }

  const stopPractice = () => {
    setIsPracticing(false)
    updateStats()
  }

  const saveSession = async () => {
    if (!startedAt || sungNotes.length === 0) {
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
          totalNotesSung: sungNotes.length,
          notesInCorrectOrder: sungNotes.length,
          sequenceAccuracy: sessionStats.sequenceAccuracy,
          pitchAccuracy: sessionStats.pitchAccuracy,
          overallScore: sessionStats.overallScore,
          noteMetrics: Array.from(noteMetrics.values()),
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
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      // Cleanup playback
      stopScalePlayback()
      if (playbackContextRef.current) {
        playbackContextRef.current.close()
      }
    }
  }, [stopScalePlayback])

  const handleClose = () => {
    if (isPracticing) {
      stopPractice()
    }
    // Stop audio playback
    stopScalePlayback()
    // Stop pitch detection
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
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

  // Render the trainer content
  const renderTrainer = () => (
    <div className={`${isFullscreen ? 'fixed inset-0 z-[60] bg-[#0d0d1a]' : ''}`}>
      <div className={`${isFullscreen ? 'h-full overflow-y-auto p-6' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Pitch Perfect</h2>
              <p className="text-sm text-white/50">Practice scales with real-time feedback</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isListening && (
              <div className="flex items-center gap-2 text-sm text-green-400 mr-2">
                <Mic size={16} />
                <span>Listening</span>
              </div>
            )}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              {isFullscreen ? <Minimize2 size={18} className="text-white/70" /> : <Maximize2 size={18} className="text-white/70" />}
            </button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={18} className="text-white/70" />
            </button>
          </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div>
            <label className="block text-xs text-white/50 mb-1">Scale</label>
            <select
              value={scaleType}
              onChange={(e) => setScaleType(e.target.value)}
              disabled={isPracticing}
              className="glass-select w-full text-sm"
            >
              {Object.entries(SCALE_DEFINITIONS).map(([key, scale]) => (
                <option key={key} value={key}>{scale.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Root Note</label>
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
            <label className="block text-xs text-white/50 mb-1">Octave</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOctave(o => Math.max(2, o - 1))}
                disabled={isPracticing || octave <= 2}
                className="glass-button p-2 rounded-lg disabled:opacity-50"
              >
                <ChevronDown size={16} />
              </button>
              <span className="text-white font-mono w-8 text-center">{octave}</span>
              <button
                onClick={() => setOctave(o => Math.min(6, o + 1))}
                disabled={isPracticing || octave >= 6}
                className="glass-button p-2 rounded-lg disabled:opacity-50"
              >
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Speed (BPM)</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTempo(t => Math.max(40, t - 10))}
                disabled={isPracticing || tempo <= 40}
                className="glass-button p-2 rounded-lg disabled:opacity-50"
              >
                <ChevronDown size={16} />
              </button>
              <span className="text-white font-mono w-10 text-center">{tempo}</span>
              <button
                onClick={() => setTempo(t => Math.min(200, t + 10))}
                disabled={isPracticing || tempo >= 200}
                className="glass-button p-2 rounded-lg disabled:opacity-50"
              >
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Direction</label>
            <button
              onClick={() => setDirection(d => d === 'ascending' ? 'descending' : d === 'descending' ? 'both' : 'ascending')}
              disabled={isPracticing}
              className="glass-button px-4 py-2 rounded-lg flex items-center gap-2 text-sm w-full justify-center"
            >
              {getDirectionIcon()}
              <span className="capitalize">{direction}</span>
            </button>
          </div>
        </div>

        {/* Sensitivity */}
        <div className="mb-6">
          <label className="block text-xs text-white/50 mb-2">Mic Sensitivity: {sensitivity}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="w-full accent-pink-500"
          />
        </div>

        {/* Scale Display */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Scale: </span>
              <span className="text-pink-400 font-medium">
                {rootNote} {SCALE_DEFINITIONS[scaleType]?.name}
              </span>
              <span className="text-white/40 text-xs">
                ({SCALE_DEFINITIONS[scaleType]?.description})
              </span>
            </div>

            {/* Play Scale Button */}
            <button
              onClick={isPlayingScale ? stopScalePlayback : playEntireScale}
              disabled={isPracticing}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isPlayingScale
                  ? 'bg-pink-500/20 text-pink-400 border border-pink-500/50'
                  : 'glass-button hover:bg-white/10'
              } ${isPracticing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isPlayingScale ? (
                <>
                  <Square size={14} />
                  Stop
                </>
              ) : (
                <>
                  <Volume2 size={14} />
                  Play Scale
                </>
              )}
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 mb-3">
            <VolumeX size={14} className="text-white/40" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume * 100}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="w-24 accent-pink-500"
            />
            <Volume2 size={14} className="text-white/40" />
          </div>

          <div className="flex flex-wrap gap-2">
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
                    relative px-4 py-3 rounded-xl border transition-all duration-300 cursor-pointer
                    ${isPlaying ? 'border-yellow-500 bg-yellow-500/20 scale-105 shadow-lg shadow-yellow-500/30' : ''}
                    ${isCurrentNote && !isPlaying ? 'border-pink-500 bg-pink-500/20 scale-110' : ''}
                    ${isCompleted && !isPlaying ? 'border-green-500/50 bg-green-500/10' : ''}
                    ${!isCurrentNote && !isCompleted && !isPlaying ? 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20' : ''}
                    ${isPracticing ? 'cursor-default' : ''}
                  `}
                >
                  <div className="text-center">
                    <div className={`text-lg font-bold ${
                      isPlaying ? 'text-yellow-400' :
                      isCurrentNote ? 'text-pink-400' :
                      isCompleted ? 'text-green-400' :
                      'text-white/70'
                    }`}>
                      {note.noteName}
                    </div>
                    <div className="text-xs text-white/40">{note.octave}</div>
                  </div>

                  {isPlaying && (
                    <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center animate-pulse">
                      <Volume2 size={10} className="text-white" />
                    </div>
                  )}

                  {isCompleted && !isPlaying && (
                    <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}

                  {isCompleted && metric && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-green-400">
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
              Click any note to hear it, or click &quot;Play Scale&quot; to hear the entire scale
            </p>
          )}
        </div>

        {/* Live Detection */}
        {isPracticing && (
          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-white/50">Detected Note</span>
                <div className="text-2xl font-bold text-white">
                  {detectedNote ? `${detectedNote}${detectedOctave}` : '—'}
                </div>
              </div>
              <div>
                <span className="text-xs text-white/50">Cents</span>
                <div className={`text-2xl font-bold ${Math.abs(centsDeviation) < 15 ? 'text-green-400' : Math.abs(centsDeviation) < 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {centsDeviation > 0 ? '+' : ''}{Math.round(centsDeviation)}
                </div>
              </div>
              <div>
                <span className="text-xs text-white/50">Target</span>
                <div className="text-2xl font-bold text-pink-400">
                  {scaleNotes[currentNoteIndex]?.noteName || '—'}{scaleNotes[currentNoteIndex]?.octave || ''}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/50 mb-1">
                <span>Progress</span>
                <span>{currentNoteIndex} / {scaleNotes.length}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${(currentNoteIndex / scaleNotes.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {sungNotes.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 rounded-xl bg-white/5">
              <div className="text-2xl font-bold text-pink-400">
                {Math.round(sessionStats.sequenceAccuracy)}%
              </div>
              <div className="text-xs text-white/50">Sequence</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <div className="text-2xl font-bold text-purple-400">
                {Math.round(sessionStats.pitchAccuracy)}%
              </div>
              <div className="text-xs text-white/50">Pitch Accuracy</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <div className="text-2xl font-bold text-green-400">
                {Math.round(sessionStats.overallScore)}%
              </div>
              <div className="text-xs text-white/50">Overall Score</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          {!isPracticing ? (
            <button
              onClick={startPractice}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium hover:from-pink-400 hover:to-purple-400 transition-all"
            >
              <Play size={18} />
              Start Practice
            </button>
          ) : (
            <button
              onClick={stopPractice}
              className="glass-button flex items-center gap-2 px-6 py-3 rounded-xl border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              <Square size={18} />
              Stop
            </button>
          )}

          <button
            onClick={resetSession}
            disabled={isPracticing}
            className="glass-button flex items-center gap-2 px-4 py-3 rounded-xl disabled:opacity-50"
          >
            <RotateCcw size={18} />
            Reset
          </button>

          {sungNotes.length > 0 && !isPracticing && (
            <button
              onClick={saveSession}
              disabled={isSaving}
              className="glass-button-gold flex items-center gap-2 px-6 py-3 rounded-xl disabled:opacity-50"
            >
              <Save size={18} />
              {isSaving ? 'Saving...' : 'Save Session'}
            </button>
          )}
        </div>

        {/* Messages */}
        {saveMessage && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${saveMessage.includes('Failed') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
            {saveMessage}
          </div>
        )}

        {currentNoteIndex >= scaleNotes.length && scaleNotes.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-center">
            <div className="text-green-400 font-semibold mb-1">Scale Completed!</div>
            <div className="text-white/70 text-sm">
              Overall Score: {Math.round(sessionStats.overallScore)}%
            </div>
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
          className="fixed bottom-4 right-[140px] w-12 h-12 lg:bottom-6 lg:right-40 lg:w-14 lg:h-14 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-300 z-50"
          style={{ boxShadow: '0 8px 24px rgba(236, 72, 153, 0.4)' }}
          title="Pitch Perfect"
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
            <p className="font-semibold text-lg">Pitch Perfect</p>
            <p className="text-sm text-white/70">Practice scales & sequences</p>
          </div>
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <div className={`relative glass-card p-6 w-full ${isFullscreen ? 'max-w-none h-full' : 'max-w-2xl max-h-[90vh] overflow-y-auto'} rounded-2xl`}>
            {renderTrainer()}
          </div>
        </div>
      )}

      {/* Load Aubio.js */}
      <Script
        src="https://cdn.jsdelivr.net/npm/aubiojs@0.1.1/build/aubio.min.js"
        strategy="lazyOnload"
        onLoad={() => setAubioLoaded(true)}
      />
    </>
  )
}
