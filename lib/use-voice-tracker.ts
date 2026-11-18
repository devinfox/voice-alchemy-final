'use client'

/**
 * One microphone pipeline for every practice tool.
 *
 * Pitch Perfect, the Scale Trainer and the Rhythm Trainer each used to open
 * the mic and analyse it their own way. They now share this hook, which runs
 * the detector in `public/pitch-tracker.worklet.js` on the audio thread and
 * hands back clean, timed readings.
 *
 * What it takes care of so the tools do not have to:
 *
 *   - Microphone set-up. Browsers "clean up" a mic for phone calls. The noise
 *     remover treats a long held note as background hum and thins it out, so
 *     it is switched off. Echo removal stays on so the app's own piano notes
 *     and click do not get heard as the singer, and automatic level stays on
 *     so a quiet laptop mic still registers (level does not change pitch).
 *
 *   - Telling a voice from noise. Each reading comes with a clarity score;
 *     breath, room noise and consonants score low and are ignored.
 *
 *   - Glitches. A single stray reading a long way from where the voice has
 *     been (an octave flip on a breathy note, a hard "t") is held back until
 *     the voice proves it really moved there.
 *
 *   - Screen updates. Readings arrive ~90 times a second; `onFrame` gets all
 *     of them for scoring, while `onNote` is throttled to what a screen can
 *     show and smoothed so the display does not flicker.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFrequency, isPlausiblePitch, type DetectedNote } from '@/lib/pitch-detection'
import { hzToMidi, midiToHz } from '@/lib/pitch-scoring'

export interface VoiceFrame {
  /** Milliseconds on the performance.now() clock. */
  time: number
  frequency: number
  /** Fractional MIDI note number (69.1 = A4 and ten cents). */
  midi: number
  /** 0..1, how voice-like the sound was. */
  clarity: number
  rms: number
}

export interface VoiceTrackerOptions {
  /** 0-100 slider. 0 switches detection off. */
  sensitivity: number
  /** A live class microphone to listen to instead of opening a new one. */
  externalMicStream?: MediaStream | null
  /** Report pitch (default true). */
  pitch?: boolean
  /** Report sudden starts of sound, for rhythm work (default false). */
  onsets?: boolean
  /** Every accepted sung reading. Called often: keep it cheap, no setState per call. */
  onFrame?: (frame: VoiceFrame) => void
  /** What to show on screen. Null once the singer has gone quiet. */
  onNote?: (note: DetectedNote | null) => void
  /** A clap / "ta" / tap, timed on the performance.now() clock. */
  onOnset?: (timeMs: number) => void
}

const WORKLET_URL = '/pitch-tracker.worklet.js'
const MIN_CLARITY = 0.82
const DISPLAY_INTERVAL_MS = 33
const SILENCE_AFTER_MS = 350
const JUMP_SEMITONES = 4
const JUMP_CONFIRM_FRAMES = 3

/** Loudness needed to count, for a 0-100 sensitivity slider. */
function loudnessFloor(sensitivity: number): number {
  return 0.004 + (1 - sensitivity / 100) * 0.05
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

type AudioContextCtor = typeof AudioContext

export function useVoiceTracker(options: VoiceTrackerOptions) {
  const [isListening, setIsListening] = useState(false)

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const contextRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startingRef = useRef(false)

  // Glitch guard and display smoothing state
  const recentRef = useRef<number[]>([])
  const pendingRef = useRef<VoiceFrame[]>([])
  const lastAcceptedAtRef = useRef(0)
  const lastDisplayAtRef = useRef(0)
  const showingNoteRef = useRef(false)
  const inputDelayMsRef = useRef(0)

  // Keep the onset floor in step with the sensitivity slider
  useEffect(() => {
    nodeRef.current?.port.postMessage({ onsetFloor: 0.01 + (1 - options.sensitivity / 100) * 0.1 })
  }, [options.sensitivity])

  const accept = useCallback((frame: VoiceFrame) => {
    const recent = recentRef.current
    recent.push(frame.midi)
    if (recent.length > 5) recent.shift()
    lastAcceptedAtRef.current = frame.time
    optionsRef.current.onFrame?.(frame)

    if (frame.time - lastDisplayAtRef.current >= DISPLAY_INTERVAL_MS) {
      lastDisplayAtRef.current = frame.time
      showingNoteRef.current = true
      optionsRef.current.onNote?.(describeFrequency(midiToHz(median(recent))))
    }
  }, [])

  const handleMessage = useCallback((event: MessageEvent) => {
    const context = contextRef.current
    if (!context) return
    const data = event.data
    const opts = optionsRef.current
    // Convert the audio clock to the page clock, allowing for the time the
    // sound spent getting from the microphone into the browser.
    const time = performance.now() - (context.currentTime - data.t) * 1000 - inputDelayMsRef.current

    if (data.type === 'onset') {
      if (opts.sensitivity > 0) opts.onOnset?.(time)
      return
    }
    if (data.type !== 'pitch') return

    const voiced =
      opts.sensitivity > 0 &&
      data.hz > 0 &&
      data.clarity >= MIN_CLARITY &&
      data.rms >= loudnessFloor(opts.sensitivity) &&
      isPlausiblePitch(data.hz)

    if (!voiced) {
      pendingRef.current = []
      if (showingNoteRef.current && time - lastAcceptedAtRef.current > SILENCE_AFTER_MS) {
        showingNoteRef.current = false
        recentRef.current = []
        opts.onNote?.(null)
      }
      return
    }

    const frame: VoiceFrame = {
      time,
      frequency: data.hz,
      midi: hzToMidi(data.hz),
      clarity: data.clarity,
      rms: data.rms,
    }

    // A reading far from where the voice has just been waits for company.
    const recent = recentRef.current
    const continuing = recent.length >= 3 && time - lastAcceptedAtRef.current < 120
    if (continuing && Math.abs(frame.midi - median(recent)) > JUMP_SEMITONES) {
      const pending = pendingRef.current
      if (pending.length > 0 && Math.abs(pending[pending.length - 1].midi - frame.midi) > 1) pending.length = 0
      pending.push(frame)
      if (pending.length >= JUMP_CONFIRM_FRAMES) {
        recentRef.current = []
        pendingRef.current = []
        pending.forEach(accept)
      }
      return
    }

    pendingRef.current = []
    accept(frame)
  }, [accept])

  const stop = useCallback(() => {
    if (nodeRef.current) {
      nodeRef.current.port.onmessage = null
      nodeRef.current.disconnect()
      nodeRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (contextRef.current) {
      void contextRef.current.close().catch(() => {})
      contextRef.current = null
    }
    recentRef.current = []
    pendingRef.current = []
    showingNoteRef.current = false
    setIsListening(false)
  }, [])

  /** Open the mic and start listening. Resolves false if it could not. */
  const start = useCallback(async (): Promise<boolean> => {
    if (contextRef.current || startingRef.current) return true
    startingRef.current = true
    let opened: MediaStream | null = null
    let created: AudioContext | null = null
    try {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
      if (!Ctor || !('audioWorklet' in Ctor.prototype)) {
        alert('This browser is too old for the practice tools. Please update it and try again.')
        return false
      }

      const opts = optionsRef.current
      const externalTrack = opts.externalMicStream?.getAudioTracks()[0]
      let stream: MediaStream
      if (externalTrack && externalTrack.readyState === 'live') {
        // Clone so analysing never changes the live class stream.
        stream = new MediaStream([externalTrack.clone()])
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
        })
      }
      opened = stream

      const context = new Ctor()
      created = context
      await context.audioWorklet.addModule(WORKLET_URL)
      if (context.state === 'suspended') await context.resume()

      const node = new AudioWorkletNode(context, 'vaa-voice-tracker', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        processorOptions: { pitch: opts.pitch !== false, onsets: opts.onsets === true },
      })
      node.port.onmessage = handleMessage
      node.port.postMessage({ onsetFloor: 0.01 + (1 - opts.sensitivity / 100) * 0.1 })

      // A silent path to the output keeps the browser running the detector.
      const mute = context.createGain()
      mute.gain.value = 0
      context.createMediaStreamSource(stream).connect(node)
      node.connect(mute)
      mute.connect(context.destination)

      const settings = stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number }
      inputDelayMsRef.current = Math.min(80, Math.max(0, (settings?.latency ?? 0.015) * 1000))

      streamRef.current = stream
      contextRef.current = context
      nodeRef.current = node
      setIsListening(true)
      return true
    } catch (error) {
      // Do not leave the mic light on if set-up failed part-way.
      opened?.getTracks().forEach((track) => track.stop())
      void created?.close().catch(() => {})
      console.error('Microphone error:', error)
      const name = error instanceof Error ? error.name : ''
      alert(
        name === 'NotAllowedError'
          ? 'The microphone is blocked. Allow it in your browser and try again.'
          : 'Could not start the microphone. Check that one is connected and try again.'
      )
      return false
    } finally {
      startingRef.current = false
    }
  }, [handleMessage])

  useEffect(() => stop, [stop])

  return { isListening, start, stop }
}
