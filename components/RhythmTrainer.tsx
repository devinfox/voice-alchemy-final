'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Maximize2, Minimize2, Play, Pause, Mic, MicOff, Save, TrendingUp, Settings2, Volume2 } from 'lucide-react'

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
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIMING_THRESHOLDS = {
  onBeat: 30,    // Within ±30ms = on beat
  window: 200,   // Detection window around beat (±200ms)
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
  isAccent: boolean = false
): void {
  const now = audioContext.currentTime
  const volume = isAccent ? 0.8 : 0.5

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
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
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
  let consistency = 100
  if (completedTimings.length > 1) {
    const offsets = completedTimings.map(t => t.offsetMs || 0)
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length
    const variance = offsets.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / offsets.length
    const stdDev = Math.sqrt(variance)
    // 0 stdDev = 100% consistency, 100ms stdDev = 0% consistency
    consistency = Math.max(0, 100 - stdDev)
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
  const expectedBeatTimesRef = useRef<number[]>([])
  const lastProcessedBeatRef = useRef(-1)

  // Keep session ref in sync
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const beatsPerMeasure = TIME_SIGNATURES.find(t => t.value === timeSignature)?.beats || 4

  // Handle onset detection
  const handleOnset = useCallback((onsetTime: number) => {
    if (!isPlaying || expectedBeatTimesRef.current.length === 0) return

    // Find the closest expected beat
    let closestBeatIndex = -1
    let closestOffset = Infinity

    expectedBeatTimesRef.current.forEach((expectedTime, index) => {
      if (index <= lastProcessedBeatRef.current) return

      const offset = onsetTime - expectedTime
      if (Math.abs(offset) < TIMING_THRESHOLDS.window && Math.abs(offset) < Math.abs(closestOffset)) {
        closestOffset = offset
        closestBeatIndex = index
      }
    })

    if (closestBeatIndex === -1) return

    lastProcessedBeatRef.current = closestBeatIndex

    const result: TimingResult = Math.abs(closestOffset) <= TIMING_THRESHOLDS.onBeat
      ? 'on-beat'
      : closestOffset < 0
        ? 'early'
        : 'late'

    const newTiming: BeatTiming = {
      beatNumber: closestBeatIndex + 1,
      expectedTime: expectedBeatTimesRef.current[closestBeatIndex],
      actualTime: onsetTime,
      offsetMs: closestOffset,
      result,
    }

    setRecentTimings(prev => [...prev.slice(-19), newTiming])
    setSession(prev => ({
      ...prev,
      beatTimings: [...prev.beatTimings, newTiming],
    }))
  }, [isPlaying])

  const { isListening, startListening, stopListening } = useOnsetDetection({
    threshold: sensitivity,
    onOnset: handleOnset,
  })

  // Schedule metronome beats
  const scheduleBeats = useCallback(() => {
    if (!audioContextRef.current) return

    const currentTime = audioContextRef.current.currentTime
    const secondsPerBeat = 60.0 / bpm
    const scheduleAhead = 0.1 // Schedule 100ms ahead

    while (nextBeatTimeRef.current < currentTime + scheduleAhead) {
      const beatInMeasure = beatCounterRef.current % beatsPerMeasure
      const isAccent = beatInMeasure === 0

      // Schedule the sound
      const beatTime = nextBeatTimeRef.current
      setTimeout(() => {
        if (audioContextRef.current) {
          createMetronomeSound(audioContextRef.current, metronomeSound, isAccent)
        }
      }, (beatTime - audioContextRef.current.currentTime) * 1000)

      // Track expected beat time for onset detection
      const expectedTimeMs = Date.now() + (beatTime - currentTime) * 1000
      expectedBeatTimesRef.current.push(expectedTimeMs)
      // Keep only last 32 beats
      if (expectedBeatTimesRef.current.length > 32) {
        expectedBeatTimesRef.current.shift()
        if (lastProcessedBeatRef.current > 0) {
          lastProcessedBeatRef.current--
        }
      }

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
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }

    beatCounterRef.current = 0
    nextBeatTimeRef.current = audioContextRef.current.currentTime
    expectedBeatTimesRef.current = []
    lastProcessedBeatRef.current = -1

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

    schedulerIntervalRef.current = setInterval(scheduleBeats, 25)
    scheduleBeats()
  }, [bpm, timeSignature, scheduleBeats])

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
        }),
      })

      const result = await response.json()

      if (result.saved) {
        setSaveMessage(`Session saved! Score: ${result.overallScore?.toFixed(1) || stats.onBeatPercent.toFixed(1)}%`)
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
    <div className="flex justify-center gap-3 mb-6">
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
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/50 scale-110'
                  : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/40'
                : 'bg-slate-700/50 border border-slate-600/50'
            }`}
            style={{
              width: isAccent ? '52px' : '44px',
              height: isAccent ? '52px' : '44px',
            }}
          >
            {isActive && (
              <div className="w-full h-full rounded-full animate-ping bg-amber-400/30" />
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
              ? 'bg-green-500'
              : timing.result === 'early'
                ? 'bg-blue-500'
                : timing.result === 'late'
                  ? 'bg-orange-500'
                  : 'bg-slate-600'
          }`}
          title={`${timing.result}: ${timing.offsetMs?.toFixed(0)}ms`}
        />
      ))}
    </div>
  )

  // Render BPM slider
  const renderBpmControl = () => (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">BPM</span>
        <span className="text-2xl font-bold text-white">{bpm}</span>
      </div>
      <input
        type="range"
        min="40"
        max="220"
        value={bpm}
        onChange={(e) => setBpm(parseInt(e.target.value))}
        disabled={isPlaying}
        className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>40</span>
        <span>220</span>
      </div>
    </div>
  )

  // Render session stats
  const renderSessionStats = () => (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          Session Stats
        </h3>
        <button
          onClick={saveSession}
          disabled={isSaving || session.beatTimings.length === 0}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            isSaving || session.beatTimings.length === 0
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-amber-600 hover:bg-amber-500 text-white'
          }`}
        >
          <Save className="w-3 h-3" />
          {isSaving ? 'Saving...' : 'Save Session'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center">
        <div>
          <p className="text-2xl font-bold text-green-400">{stats.onBeatCount}</p>
          <p className="text-xs text-slate-400">On Beat</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-blue-400">{stats.earlyCount}</p>
          <p className="text-xs text-slate-400">Early</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-orange-400">{stats.lateCount}</p>
          <p className="text-xs text-slate-400">Late</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{stats.onBeatPercent.toFixed(0)}%</p>
          <p className="text-xs text-slate-400">Accuracy</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-700/50 text-center">
        <div>
          <p className="text-lg font-semibold text-white">{stats.avgOffsetMs.toFixed(0)}ms</p>
          <p className="text-xs text-slate-400">Avg Offset</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-white">{stats.consistency.toFixed(0)}%</p>
          <p className="text-xs text-slate-400">Consistency</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-white">{stats.bestStreak}</p>
          <p className="text-xs text-slate-400">Best Streak</p>
        </div>
      </div>

      {saveMessage && (
        <div className={`mt-3 text-center text-sm ${
          saveMessage.includes('saved') ? 'text-green-400' : 'text-yellow-400'
        }`}>
          {saveMessage}
        </div>
      )}
    </div>
  )

  // Render settings panel
  const renderSettings = () => (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-400" />
          Settings
        </h3>
        <button
          onClick={() => setShowSettings(false)}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Time Signature */}
      <div>
        <label className="text-xs text-slate-400 mb-2 block">Time Signature</label>
        <div className="flex gap-2">
          {TIME_SIGNATURES.map(ts => (
            <button
              key={ts.value}
              onClick={() => setTimeSignature(ts.value)}
              disabled={isPlaying}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeSignature === ts.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 disabled:opacity-50'
              }`}
            >
              {ts.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sound Selection */}
      <div>
        <label className="text-xs text-slate-400 mb-2 block">Metronome Sound</label>
        <div className="flex flex-wrap gap-2">
          {SOUND_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMetronomeSound(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                metronomeSound === opt.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Volume */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400 flex items-center gap-2">
            <Volume2 className="w-3 h-3" /> Volume
          </label>
          <span className="text-xs text-slate-300">{volume}%</span>
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

      {/* Mic Sensitivity */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400 flex items-center gap-2">
            <Mic className="w-3 h-3" /> Mic Sensitivity
          </label>
          <span className="text-xs text-slate-300">{sensitivity}%</span>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          value={sensitivity}
          onChange={(e) => setSensitivity(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-500"
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
            <p className="text-sm text-white/70">BPM & timing practice</p>
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
                : 'w-full h-full rounded-none lg:w-[90vw] lg:max-w-2xl lg:h-[85vh] lg:max-h-[700px] lg:rounded-3xl'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-amber-600/20 via-orange-600/20 to-red-600/20 border-b border-slate-700/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Rhythm Trainer</h2>
                  <p className="text-sm text-slate-400">Tap, clap, or sing along with the beat!</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2.5 rounded-xl transition-colors ${
                    showSettings ? 'bg-amber-600/30 text-amber-400' : 'hover:bg-white/10 text-slate-400'
                  }`}
                  title="Settings"
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

            {/* Main Content */}
            <div className="p-6 h-[calc(100%-72px)] overflow-y-auto">
              {/* Settings Panel */}
              {showSettings && renderSettings()}

              {/* BPM Control */}
              {renderBpmControl()}

              {/* Beat Indicators */}
              <div className="text-center mb-2">
                <span className="text-sm text-slate-400">{timeSignature}</span>
              </div>
              {renderBeatIndicators()}

              {/* Timing History */}
              {renderTimingHistory()}

              {/* Legend */}
              <div className="flex justify-center gap-4 mb-6 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-slate-400">On Beat</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-slate-400">Early</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  <span className="text-slate-400">Late</span>
                </span>
              </div>

              {/* Play/Pause & Mic Controls */}
              <div className="flex justify-center gap-4 mb-6">
                <button
                  onClick={togglePlay}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                    isPlaying
                      ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500'
                      : 'bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500'
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 text-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </button>

                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                    isListening
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500'
                      : 'bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600'
                  }`}
                  title={isListening ? 'Stop listening' : 'Start listening'}
                >
                  {isListening ? (
                    <div className="relative">
                      <Mic className="w-7 h-7 text-white" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-pulse" />
                    </div>
                  ) : (
                    <MicOff className="w-7 h-7 text-white" />
                  )}
                </button>
              </div>

              {/* Instructions */}
              <div className="text-center text-sm text-slate-400 mb-6">
                {!isPlaying && !isListening && (
                  <p>Press play to start the metronome, then tap the mic to detect your timing!</p>
                )}
                {isPlaying && !isListening && (
                  <p>Metronome is playing. Tap the mic button to start timing detection.</p>
                )}
                {isPlaying && isListening && (
                  <p>Clap, tap, or sing on the beat - your timing will be tracked!</p>
                )}
              </div>

              {/* Session Stats */}
              {session.beatTimings.length > 0 && renderSessionStats()}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
