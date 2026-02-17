'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Music, X, Maximize2, Minimize2, Mic, MicOff, Search, Loader2, TrendingUp, Save, Music2, ChevronRight, Volume2, Zap } from 'lucide-react'
import Script from 'next/script'

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

const NOTE_STRINGS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

const SCALE_NOTES: Record<string, string[]> = {
  'C': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'C#': ['C♯', 'D♯', 'F', 'F♯', 'G♯', 'A♯', 'C'],
  'Db': ['C♯', 'D♯', 'F', 'F♯', 'G♯', 'A♯', 'C'],
  'D': ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯'],
  'D#': ['D♯', 'F', 'G', 'G♯', 'A♯', 'C', 'D'],
  'Eb': ['D♯', 'F', 'G', 'G♯', 'A♯', 'C', 'D'],
  'E': ['E', 'F♯', 'G♯', 'A', 'B', 'C♯', 'D♯'],
  'F': ['F', 'G', 'A', 'A♯', 'C', 'D', 'E'],
  'F#': ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'F'],
  'Gb': ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'F'],
  'G': ['G', 'A', 'B', 'C', 'D', 'E', 'F♯'],
  'G#': ['G♯', 'A♯', 'C', 'C♯', 'D♯', 'F', 'G'],
  'Ab': ['G♯', 'A♯', 'C', 'C♯', 'D♯', 'F', 'G'],
  'A': ['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯'],
  'A#': ['A♯', 'C', 'D', 'D♯', 'F', 'G', 'A'],
  'Bb': ['A♯', 'C', 'D', 'D♯', 'F', 'G', 'A'],
  'B': ['B', 'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A♯'],
  // Minor keys
  'Am': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  'Bm': ['B', 'C♯', 'D', 'E', 'F♯', 'G', 'A'],
  'Cm': ['C', 'D', 'D♯', 'F', 'G', 'G♯', 'A♯'],
  'Dm': ['D', 'E', 'F', 'G', 'A', 'A♯', 'C'],
  'Em': ['E', 'F♯', 'G', 'A', 'B', 'C', 'D'],
  'Fm': ['F', 'G', 'G♯', 'A♯', 'C', 'C♯', 'D♯'],
  'Gm': ['G', 'A', 'A♯', 'C', 'D', 'D♯', 'F'],
}

const MIDDLE_A = 440
const SEMITONE = 69
const BUFFER_SIZE = 4096
const IN_TUNE_THRESHOLD = 10

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

interface SongResult {
  id: string
  title: string
  artist: string
  key: string
  bpm: number
  mode: 'major' | 'minor'
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
  return Math.floor((1200 * Math.log(frequency / getStandardFrequency(note))) / Math.log(2))
}

// ============================================================================
// PITCH DETECTION HOOK
// ============================================================================

function usePitchDetection(sensitivity: number, onNoteDetected: (note: DetectedNote) => void) {
  const [isListening, setIsListening] = useState(false)
  const [aubioLoaded, setAubioLoaded] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const pitchDetectorRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sensitivityRef = useRef(sensitivity)
  const callbackRef = useRef(onNoteDetected)

  useEffect(() => { sensitivityRef.current = sensitivity }, [sensitivity])
  useEffect(() => { callbackRef.current = onNoteDetected }, [onNoteDetected])

  const startListening = useCallback(async () => {
    if (!window.aubio) {
      alert('Audio library loading. Please wait.')
      return
    }
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(BUFFER_SIZE, 1, 1)
      const aubioModule = await window.aubio()
      pitchDetectorRef.current = new aubioModule.Pitch('default', BUFFER_SIZE, 1, audioContextRef.current.sampleRate)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.connect(scriptProcessorRef.current)
      scriptProcessorRef.current.connect(audioContextRef.current.destination)

      scriptProcessorRef.current.addEventListener('audioprocess', (event: AudioProcessingEvent) => {
        if (sensitivityRef.current === 0) return
        const input = event.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < input.length; ++i) sum += input[i] * input[i]
        const rms = Math.sqrt(sum / input.length)
        const threshold = 0.1 - (sensitivityRef.current / 100) * 0.099
        if (rms < threshold) return
        const frequency = pitchDetectorRef.current.do(input)
        if (frequency) {
          const note = getNote(frequency)
          const cents = getCents(frequency, note)
          callbackRef.current({
            name: NOTE_STRINGS[note % 12],
            value: note,
            cents,
            octave: Math.floor(note / 12) - 1,
            frequency,
          })
        }
      })
      setIsListening(true)
    } catch (error: any) {
      console.error('Mic error:', error)
      alert(error.message)
    }
  }, [])

  const stopListening = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    scriptProcessorRef.current?.disconnect()
    analyserRef.current?.disconnect()
    audioContextRef.current?.close()
    streamRef.current = null
    scriptProcessorRef.current = null
    analyserRef.current = null
    audioContextRef.current = null
    pitchDetectorRef.current = null
    setIsListening(false)
  }, [])

  return { isListening, aubioLoaded, setAubioLoaded, startListening, stopListening }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface SongPitchTrainerProps {
  variant?: 'floating' | 'card'
}

export default function SongPitchTrainer({ variant = 'floating' }: SongPitchTrainerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sensitivity, setSensitivity] = useState(60)
  const [detectedNote, setDetectedNote] = useState<DetectedNote | null>(null)

  // Song search
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SongResult[]>([])
  const [selectedSong, setSelectedSong] = useState<SongResult | null>(null)

  // Stats
  const [totalNotes, setTotalNotes] = useState(0)
  const [inKeyNotes, setInKeyNotes] = useState(0)
  const [recentHistory, setRecentHistory] = useState<boolean[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [startTime, setStartTime] = useState<Date | null>(null)

  const { isListening, setAubioLoaded, startListening, stopListening } = usePitchDetection(sensitivity, setDetectedNote)

  // Check if note is in key
  const isNoteInKey = useCallback((noteName: string): boolean => {
    if (!selectedSong) return false
    const keyName = selectedSong.mode === 'minor' ? `${selectedSong.key}m` : selectedSong.key
    const scale = SCALE_NOTES[keyName] || SCALE_NOTES[selectedSong.key] || []
    const normalized = noteName.replace('♯', '#')
    return scale.some(n => n.replace('♯', '#') === normalized)
  }, [selectedSong])

  // Track notes
  useEffect(() => {
    if (!detectedNote || !selectedSong || !isListening) return
    const inKey = isNoteInKey(detectedNote.name)
    setTotalNotes(n => n + 1)
    if (inKey) setInKeyNotes(n => n + 1)
    setRecentHistory(h => [...h.slice(-29), inKey])
    if (!startTime) setStartTime(new Date())
  }, [detectedNote, selectedSong, isListening, isNoteInKey, startTime])

  // Search songs
  const searchSongs = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/pitch-training/song-search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.songs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsSearching(false)
    }
  }

  // Select song
  const selectSong = (song: SongResult) => {
    setSelectedSong(song)
    setSearchResults([])
    setTotalNotes(0)
    setInKeyNotes(0)
    setRecentHistory([])
    setStartTime(null)
  }

  // Save session
  const saveSession = async () => {
    if (!selectedSong || totalNotes === 0) return
    setIsSaving(true)
    try {
      await fetch('/api/pitch-training/song-key-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt: startTime?.toISOString(),
          endedAt: new Date().toISOString(),
          songKey: selectedSong.key,
          songTitle: selectedSong.title,
          songArtist: selectedSong.artist,
          songBpm: selectedSong.bpm,
          inKeyPercentage: (inKeyNotes / totalNotes) * 100,
          totalNotes
        })
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  // Accuracy
  const accuracy = totalNotes > 0 ? (inKeyNotes / totalNotes) * 100 : 0

  // Cleanup
  useEffect(() => {
    if (!isOpen) stopListening()
  }, [isOpen, stopListening])

  // Get key scale notes for display
  const getScaleNotes = () => {
    if (!selectedSong) return []
    const keyName = selectedSong.mode === 'minor' ? `${selectedSong.key}m` : selectedSong.key
    return SCALE_NOTES[keyName] || SCALE_NOTES[selectedSong.key] || []
  }

  return (
    <>
      {/* Trigger Button */}
      {variant === 'card' ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-4 px-6 py-5 bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl transition-all w-full group border border-white/10"
          style={{ boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3)' }}
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Music className="w-6 h-6" />
          </div>
          <div className="text-left flex-1">
            <p className="font-semibold text-lg">Song Key Trainer</p>
            <p className="text-sm text-white/70">Find any song&apos;s key & match it</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/50" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 transition-all z-50"
        >
          <Music className="w-6 h-6" />
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="absolute inset-0 bg-black/90" onClick={() => setIsOpen(false)} />

          <div className={`relative flex w-full h-full ${isFullscreen ? '' : 'lg:m-8 lg:rounded-3xl overflow-hidden'}`}>
            {/* Left Panel - Song Search */}
            <div className="w-80 bg-slate-900 border-r border-slate-700/50 flex flex-col z-10">
              {/* Search Header */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <Music className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white">Song Key Trainer</h2>
                    <p className="text-xs text-slate-400">Search & sing in key</p>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchSongs()}
                    placeholder="Search any song..."
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 animate-spin" />}
                </div>
              </div>

              {/* Search Results */}
              <div className="flex-1 overflow-y-auto">
                {searchResults.map(song => (
                  <button
                    key={song.id}
                    onClick={() => selectSong(song)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/70 transition-colors text-left border-b border-slate-800"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Music2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate text-sm">{song.title}</p>
                      <p className="text-xs text-slate-400 truncate">{song.artist}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-emerald-400 font-bold text-sm">{song.key}</p>
                      <p className="text-xs text-slate-500">{song.bpm} BPM</p>
                    </div>
                  </button>
                ))}

                {/* Selected Song Info */}
                {selectedSong && searchResults.length === 0 && (
                  <div className="p-4">
                    <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl p-4 border border-emerald-500/30">
                      <p className="text-white font-bold">{selectedSong.title}</p>
                      <p className="text-slate-400 text-sm">{selectedSong.artist}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-400">{selectedSong.key}</p>
                          <p className="text-xs text-slate-500">{selectedSong.mode}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-white">{selectedSong.bpm}</p>
                          <p className="text-xs text-slate-500">BPM</p>
                        </div>
                      </div>
                    </div>

                    {/* Scale Notes */}
                    <div className="mt-4">
                      <p className="text-xs text-slate-400 mb-2">Notes in {selectedSong.key} {selectedSong.mode}:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {getScaleNotes().map((note, i) => (
                          <span
                            key={i}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                              detectedNote?.name === note
                                ? 'bg-emerald-500 text-white scale-110'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {note.replace('♯', '#')}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Session Stats */}
              {totalNotes > 0 && (
                <div className="p-4 border-t border-slate-700/50 bg-slate-800/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Session
                    </span>
                    <button
                      onClick={saveSession}
                      disabled={isSaving}
                      className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" />
                      {isSaving ? '...' : 'Save'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-900 rounded-lg p-2 text-center">
                      <p className={`text-xl font-bold ${accuracy >= 80 ? 'text-green-400' : accuracy >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {accuracy.toFixed(0)}%
                      </p>
                      <p className="text-xs text-slate-500">Accuracy</p>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-2 text-center">
                      <p className="text-xl font-bold text-white">{totalNotes}</p>
                      <p className="text-xs text-slate-500">Notes</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel - Pitch Display */}
            <div className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center relative">
              {/* Close Button */}
              <div className="absolute top-4 right-4 flex gap-2">
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 hover:bg-white/10 rounded-lg">
                  {isFullscreen ? <Minimize2 className="w-5 h-5 text-slate-400" /> : <Maximize2 className="w-5 h-5 text-slate-400" />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-lg">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Main Display */}
              {selectedSong ? (
                <div className="text-center">
                  {/* Big Pitch Display - Autotune Style */}
                  <div className="relative mb-8">
                    {/* Background glow */}
                    <div className={`absolute inset-0 blur-3xl opacity-30 ${
                      detectedNote && isNoteInKey(detectedNote.name) ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />

                    {/* Note display */}
                    <div className={`relative text-[120px] font-black leading-none transition-all ${
                      detectedNote
                        ? isNoteInKey(detectedNote.name)
                          ? 'text-emerald-400'
                          : 'text-red-400'
                        : 'text-slate-600'
                    }`}>
                      {detectedNote?.name.replace('♯', '#') || '--'}
                      {detectedNote && (
                        <span className="text-4xl ml-2 opacity-60">{detectedNote.octave}</span>
                      )}
                    </div>

                    {/* Cents indicator - Autotune style bar */}
                    {detectedNote && (
                      <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden w-64 mx-auto relative">
                        <div className="absolute inset-y-0 left-1/2 w-1 bg-white/30 -translate-x-1/2 z-10" />
                        <div
                          className={`absolute inset-y-0 w-4 rounded-full transition-all ${
                            Math.abs(detectedNote.cents) <= IN_TUNE_THRESHOLD ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{
                            left: `calc(50% + ${(detectedNote.cents / 50) * 50}% - 8px)`,
                          }}
                        />
                      </div>
                    )}

                    {/* Frequency & Cents */}
                    {detectedNote && (
                      <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                        <span className="text-slate-400">{detectedNote.frequency.toFixed(1)} Hz</span>
                        <span className={detectedNote.cents > 0 ? 'text-orange-400' : detectedNote.cents < 0 ? 'text-blue-400' : 'text-green-400'}>
                          {detectedNote.cents > 0 ? '+' : ''}{detectedNote.cents} cents
                        </span>
                        {isNoteInKey(detectedNote.name) && (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <Zap className="w-4 h-4" /> In Key!
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recent History - Visual dots */}
                  <div className="flex items-center justify-center gap-1 mb-8">
                    {recentHistory.map((inKey, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all ${
                          inKey ? 'bg-emerald-500' : 'bg-red-500'
                        } ${i === recentHistory.length - 1 ? 'scale-150' : ''}`}
                      />
                    ))}
                    {recentHistory.length === 0 && (
                      <span className="text-slate-500 text-sm">Start singing to see history</span>
                    )}
                  </div>

                  {/* Mic Control */}
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-slate-400" />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sensitivity}
                        onChange={e => setSensitivity(parseInt(e.target.value))}
                        className="w-24 accent-emerald-500"
                      />
                    </div>
                    <button
                      onClick={isListening ? stopListening : startListening}
                      className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                        isListening
                          ? 'bg-red-600 hover:bg-red-500 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {isListening ? <><MicOff className="w-5 h-5" /> Stop</> : <><Mic className="w-5 h-5" /> Start</>}
                    </button>
                  </div>

                  {/* Accuracy Display */}
                  {totalNotes > 10 && (
                    <div className="mt-8 inline-flex items-center gap-3 px-6 py-3 bg-slate-800/50 rounded-full border border-slate-700/50">
                      <span className="text-slate-400">Accuracy:</span>
                      <span className={`text-2xl font-bold ${accuracy >= 80 ? 'text-green-400' : accuracy >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {accuracy.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                // No song selected
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto mb-6 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                    <Search className="w-12 h-12 text-emerald-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Search for a Song</h3>
                  <p className="text-slate-400 max-w-md">
                    Find any song to see its key, then sing along and see your accuracy in real-time!
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
