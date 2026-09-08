/**
 * Recital audio pipeline — a tiny live-audio chain in front of WebRTC.
 *
 * Everything in here is automatic. The UI only ever sees plain-language
 * status ("sounds great", "a little quiet", "too close to the mic") and a
 * single Quieter/Louder preference — never dB, ratios or bitrates.
 *
 *   mic (48 kHz, speech DSP off for performances)
 *     → raw analyser (clip + level detection, before any processing)
 *     → high-pass ~40 Hz (rumble only; keeps low male fundamentals)
 *     → calibrated trim (auto-levelled so every singer lands at the same loudness)
 *     → gentle compressor (~2.5:1, soft knee)
 *     → look-ahead safety limiter (AudioWorklet, ~-2 dBFS ceiling)
 *     → MediaStreamTrack → WebRTC
 *
 * Two profiles:
 *   'talk'        — normal browser speech processing (echo cancel etc.). Used
 *                   for the host and audience chatter between performances.
 *   'performance' — raw music capture through the chain above. Used for
 *                   whoever is on stage.
 */

export type AudioProfile = 'talk' | 'performance'

/** Plain-language verdicts. Never show numbers to users. */
export type LevelVerdict = 'silent' | 'quiet' | 'good' | 'hot' | 'too-hot'

export interface LevelReading {
  /** 0..1 smoothed loudness for a simple meter. */
  level: number
  /** Raw peak in dBFS measured before any processing (for internal decisions). */
  rawPeakDb: number
  verdict: LevelVerdict
  /** True if the input clipped during the last ~2 seconds. */
  clipping: boolean
}

export interface PipelineOptions {
  deviceId?: string
  /** User preference from the Quieter/Louder control, -1..+1. 0 = neutral. */
  preference?: number
}

/** Target loudness for a calibrated singer, in dBFS peak. The "median". */
const TARGET_PEAK_DB = -9
/** Bounds for automatic trim so calibration can't do anything silly. */
const TRIM_MIN_DB = -12
const TRIM_MAX_DB = 12
/** Preference slider range mapped onto dB. */
const PREFERENCE_RANGE_DB = 6

const LIMITER_WORKLET = `
class RecitalLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ceiling = 0.79; // ~-2 dBFS
    this.lookahead = Math.round(sampleRate * 0.005); // 5 ms
    this.buf = new Float32Array(this.lookahead * 2);
    this.write = 0;
    this.gain = 1;
    this.releaseCoef = Math.exp(-1 / (sampleRate * 0.08)); // ~80 ms release
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;
    const inCh = input[0];
    const n = inCh.length;
    const la = this.lookahead;
    const buf = this.buf;
    const size = buf.length;
    for (let i = 0; i < n; i++) {
      const x = inCh[i];
      // Inter-sample peak estimate: max of |x| and midpoint with previous sample.
      const prev = buf[(this.write - 1 + size) % size];
      const peak = Math.max(Math.abs(x), Math.abs((x + prev) * 0.5) * 1.15);
      const needed = peak > this.ceiling ? this.ceiling / peak : 1;
      // Attack instantly (look-ahead covers it), release slowly.
      if (needed < this.gain) this.gain = needed;
      else this.gain = needed + (this.gain - needed) * this.releaseCoef;
      buf[this.write] = x;
      const readIdx = (this.write - la + size) % size;
      const delayed = buf[readIdx];
      let y = delayed * this.gain;
      if (y > this.ceiling) y = this.ceiling;
      else if (y < -this.ceiling) y = -this.ceiling;
      for (let c = 0; c < output.length; c++) output[c][i] = y;
      this.write = (this.write + 1) % size;
    }
    return true;
  }
}
registerProcessor('recital-limiter', RecitalLimiter);
`

function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

function gainToDb(gain: number): number {
  return gain <= 0 ? -120 : 20 * Math.log10(gain)
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function verdictForPeak(rawPeakDb: number, clipping: boolean): LevelVerdict {
  if (clipping || rawPeakDb > -2) return 'too-hot'
  if (rawPeakDb > -5) return 'hot'
  if (rawPeakDb > -22) return 'good'
  if (rawPeakDb > -45) return 'quiet'
  return 'silent'
}

/** Friendly copy for a verdict. This is the only thing users ever read. */
export function verdictMessage(verdict: LevelVerdict): string {
  switch (verdict) {
    case 'too-hot':
      return "Too close to the mic. Back up a little."
    case 'hot':
      return 'Almost perfect. A touch further from the mic helps on big notes.'
    case 'good':
      return 'Sounds great.'
    case 'quiet':
      return 'A little quiet. Come a bit closer to the mic.'
    case 'silent':
    default:
      return "We can't hear you yet. Try speaking or singing."
  }
}

export function isLikelyBluetooth(label: string | null | undefined): boolean {
  if (!label) return false
  return /bluetooth|airpods|buds|hands-?free|hfp|headset \(|wh-|wf-|beats|jabra|bose|sony/i.test(label)
}

export class RecitalAudioPipeline {
  private ctx: AudioContext | null = null
  private rawStream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private rawAnalyser: AnalyserNode | null = null
  private highpass: BiquadFilterNode | null = null
  private trimNode: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private limiter: AudioNode | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private workletLoaded = false

  private profile: AudioProfile = 'talk'
  private deviceId: string | undefined
  private preference = 0
  private calibratedTrimDb = 0

  private analysisBuffer: Float32Array<ArrayBuffer> | null = null
  private smoothedLevel = 0
  private lastClipAt = 0
  private peakHistory: number[] = []

  private outputTrack: MediaStreamTrack | null = null
  private listeners = new Set<(track: MediaStreamTrack) => void>()

  constructor(options: PipelineOptions = {}) {
    this.deviceId = options.deviceId
    this.preference = clamp(options.preference ?? 0, -1, 1)
  }

  get currentProfile(): AudioProfile {
    return this.profile
  }

  get track(): MediaStreamTrack | null {
    return this.outputTrack
  }

  get currentDeviceLabel(): string | null {
    return this.rawStream?.getAudioTracks()[0]?.label ?? null
  }

  /** Fires whenever the outgoing track object changes (profile/device switch). */
  onTrackChange(listener: (track: MediaStreamTrack) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Browsers keep audio suspended until a tap; call this from any user gesture. */
  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => undefined)
    }
  }

  /** Acquire the microphone with the given profile. Safe to call repeatedly. */
  async start(profile: AudioProfile = 'talk'): Promise<MediaStreamTrack> {
    this.profile = profile
    await this.ensureContext()
    await this.acquire()
    this.buildGraph()
    return this.outputTrack!
  }

  async setProfile(profile: AudioProfile): Promise<MediaStreamTrack | null> {
    if (profile === this.profile && this.outputTrack) return this.outputTrack
    this.profile = profile
    if (!this.ctx) return null
    await this.acquire()
    this.buildGraph()
    return this.outputTrack
  }

  async setDevice(deviceId: string | undefined): Promise<void> {
    this.deviceId = deviceId
    if (!this.ctx) return
    // A new device means a new calibration.
    this.calibratedTrimDb = 0
    this.peakHistory = []
    await this.acquire()
    this.buildGraph()
  }

  /** -1 (quieter) .. +1 (louder). Stored as a preference on top of calibration. */
  setPreference(value: number): void {
    this.preference = clamp(value, -1, 1)
    this.applyTrim()
  }

  getPreference(): number {
    return this.preference
  }

  /**
   * Automatic levelling. Call periodically while the user is talking/singing;
   * it nudges the trim toward the target using recent loud peaks. Never moves
   * faster than a couple of dB per call so it can't "pump" mid-phrase.
   */
  autoCalibrate(): void {
    if (this.peakHistory.length < 20) return
    const sorted = [...this.peakHistory].sort((a, b) => a - b)
    // Use the 90th percentile of recent peaks as "how loud they get".
    const loud = sorted[Math.floor(sorted.length * 0.9)]
    if (loud < -50) return
    const desired = clamp(TARGET_PEAK_DB - loud, TRIM_MIN_DB, TRIM_MAX_DB)
    const step = clamp(desired - this.calibratedTrimDb, -2, 2)
    this.calibratedTrimDb = clamp(this.calibratedTrimDb + step, TRIM_MIN_DB, TRIM_MAX_DB)
    this.applyTrim()
  }

  /** Freeze the current calibration (called when someone steps on stage). */
  getCalibration(): number {
    return this.calibratedTrimDb
  }

  setCalibration(trimDb: number): void {
    this.calibratedTrimDb = clamp(trimDb, TRIM_MIN_DB, TRIM_MAX_DB)
    this.applyTrim()
  }

  /** Read the meter. Cheap; call from requestAnimationFrame or an interval. */
  read(): LevelReading {
    const analyser = this.rawAnalyser
    if (!analyser || !this.analysisBuffer) {
      return { level: 0, rawPeakDb: -120, verdict: 'silent', clipping: false }
    }
    analyser.getFloatTimeDomainData(this.analysisBuffer)
    let peak = 0
    let sumSq = 0
    let clippedSamples = 0
    const buf = this.analysisBuffer
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i])
      if (a > peak) peak = a
      sumSq += a * a
      if (a >= 0.985) clippedSamples++
    }
    const rms = Math.sqrt(sumSq / buf.length)
    const now = performance.now()
    if (clippedSamples >= 3) this.lastClipAt = now
    const clipping = now - this.lastClipAt < 2000
    const rawPeakDb = gainToDb(peak)
    if (rawPeakDb > -60) {
      this.peakHistory.push(rawPeakDb)
      if (this.peakHistory.length > 240) this.peakHistory.shift()
    }
    // Smooth for a friendly meter: fast attack, slow release.
    const target = clamp(gainToDb(rms) / 60 + 1, 0, 1)
    this.smoothedLevel = target > this.smoothedLevel ? target : this.smoothedLevel * 0.9 + target * 0.1
    const recentLoud = this.peakHistory.length ? Math.max(...this.peakHistory.slice(-60)) : rawPeakDb
    return {
      level: this.smoothedLevel,
      rawPeakDb,
      verdict: verdictForPeak(recentLoud, clipping),
      clipping,
    }
  }

  /** The processed stream (audio only), for local recording. */
  getProcessedStream(): MediaStream | null {
    return this.destination?.stream ?? null
  }

  async stop(): Promise<void> {
    this.rawStream?.getTracks().forEach((t) => t.stop())
    this.rawStream = null
    this.outputTrack?.stop()
    this.outputTrack = null
    this.source?.disconnect()
    this.source = null
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close()
      } catch {
        // ignore
      }
    }
    this.ctx = null
    this.workletLoaded = false
  }

  // ---------------------------------------------------------------------------

  private async ensureContext(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined)
      return
    }
    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined)
    try {
      const url = URL.createObjectURL(new Blob([LIMITER_WORKLET], { type: 'application/javascript' }))
      await this.ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      this.workletLoaded = true
    } catch (err) {
      console.warn('[RecitalAudio] Limiter worklet unavailable, using fallback compressor', err)
      this.workletLoaded = false
    }
  }

  private constraintsFor(profile: AudioProfile): MediaTrackConstraints {
    const base: MediaTrackConstraints = {
      deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
    }
    if (profile === 'performance') {
      return { ...base, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }
    return { ...base, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  }

  private async acquire(): Promise<void> {
    const previous = this.rawStream
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: this.constraintsFor(this.profile), video: false })
    } catch (err) {
      // Exact device may have vanished; fall back to default.
      if (this.deviceId) {
        this.deviceId = undefined
        stream = await navigator.mediaDevices.getUserMedia({ audio: this.constraintsFor(this.profile), video: false })
      } else {
        throw err
      }
    }
    const track = stream.getAudioTracks()[0]
    try {
      track.contentHint = this.profile === 'performance' ? 'music' : 'speech'
    } catch {
      // unsupported
    }
    this.rawStream = stream
    previous?.getTracks().forEach((t) => t.stop())
  }

  private buildGraph(): void {
    const ctx = this.ctx
    if (!ctx || !this.rawStream) return

    this.source?.disconnect()
    this.source = ctx.createMediaStreamSource(this.rawStream)

    if (!this.rawAnalyser) {
      this.rawAnalyser = ctx.createAnalyser()
      this.rawAnalyser.fftSize = 2048
      this.rawAnalyser.smoothingTimeConstant = 0
      this.analysisBuffer = new Float32Array(this.rawAnalyser.fftSize)
    }
    if (!this.highpass) {
      this.highpass = ctx.createBiquadFilter()
      this.highpass.type = 'highpass'
      this.highpass.frequency.value = 40
      this.highpass.Q.value = 0.707
    }
    if (!this.trimNode) {
      this.trimNode = ctx.createGain()
    }
    if (!this.compressor) {
      this.compressor = ctx.createDynamicsCompressor()
      this.compressor.threshold.value = -18
      this.compressor.knee.value = 12
      this.compressor.ratio.value = 2.5
      this.compressor.attack.value = 0.015
      this.compressor.release.value = 0.18
    }
    if (!this.limiter) {
      if (this.workletLoaded) {
        this.limiter = new AudioWorkletNode(ctx, 'recital-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
      } else {
        const brickwall = ctx.createDynamicsCompressor()
        brickwall.threshold.value = -3
        brickwall.knee.value = 0
        brickwall.ratio.value = 20
        brickwall.attack.value = 0.001
        brickwall.release.value = 0.08
        this.limiter = brickwall
      }
    }
    if (!this.destination) {
      this.destination = ctx.createMediaStreamDestination()
    }

    // Wire (idempotent: disconnecting the source above removed the old path).
    this.source.connect(this.rawAnalyser)
    this.source.connect(this.highpass)
    this.highpass.connect(this.trimNode)
    this.trimNode.connect(this.compressor)
    this.compressor.connect(this.limiter)
    this.limiter.connect(this.destination)

    this.applyTrim()

    const newTrack = this.destination.stream.getAudioTracks()[0]
    if (newTrack !== this.outputTrack) {
      this.outputTrack = newTrack
      try {
        newTrack.contentHint = this.profile === 'performance' ? 'music' : 'speech'
      } catch {
        // unsupported
      }
      this.listeners.forEach((l) => l(newTrack))
    }
  }

  private applyTrim(): void {
    if (!this.trimNode || !this.ctx) return
    // In 'talk' mode the browser's own AGC already levels speech; keep our
    // trim gentle there so the two never fight.
    const calibration = this.profile === 'performance' ? this.calibratedTrimDb : this.calibratedTrimDb * 0.5
    const db = clamp(calibration + this.preference * PREFERENCE_RANGE_DB, TRIM_MIN_DB, TRIM_MAX_DB)
    this.trimNode.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.05)
  }
}
