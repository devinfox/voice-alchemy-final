/**
 * Local performance recorder + uploader.
 *
 * While someone is on stage, their own device records the pristine processed
 * audio (and camera) with MediaRecorder. The live audience hears WebRTC; the
 * archive gets the local file, so a Wi-Fi hiccup never ruins the keepsake.
 * The host runs the same class on the performer's incoming stream as a backup.
 */

export interface RecorderUploadTarget {
  recitalId: string
  sessionToken: string
  performanceId: string | null
  kind: 'performer-local' | 'host-archive'
}

export interface RecorderResult {
  storagePath: string
  fileSize: number
  durationSeconds: number
}

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export class LocalPerformanceRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private mimeType = ''

  get isRecording(): boolean {
    return !!this.recorder && this.recorder.state === 'recording'
  }

  start(stream: MediaStream): boolean {
    if (this.isRecording) return true
    if (typeof MediaRecorder === 'undefined') return false
    const hasAudio = stream.getAudioTracks().length > 0
    if (!hasAudio) return false
    this.mimeType = pickMimeType()
    try {
      this.recorder = new MediaRecorder(stream, {
        mimeType: this.mimeType || undefined,
        audioBitsPerSecond: 192_000,
        videoBitsPerSecond: 2_500_000,
      })
    } catch (err) {
      console.warn('[RecitalRecorder] MediaRecorder failed to start', err)
      return false
    }
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(2000)
    this.startedAt = Date.now()
    return true
  }

  /** Stop and return the file (null if nothing usable was captured). */
  async stop(): Promise<{ blob: Blob; durationSeconds: number } | null> {
    const recorder = this.recorder
    if (!recorder) return null
    this.recorder = null
    if (recorder.state === 'inactive') return null
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      try {
        recorder.stop()
      } catch {
        resolve()
      }
    })
    const durationSeconds = Math.round((Date.now() - this.startedAt) / 1000)
    if (this.chunks.length === 0 || durationSeconds < 3) return null
    const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' })
    this.chunks = []
    return { blob, durationSeconds }
  }

  /** Upload to the private bucket via a signed URL and register the row. */
  static async upload(
    file: { blob: Blob; durationSeconds: number },
    target: RecorderUploadTarget,
    onProgress?: (fraction: number) => void
  ): Promise<RecorderResult> {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${target.sessionToken}` }
    const ext = file.blob.type.includes('mp4') ? 'mp4' : 'webm'

    const presign = await fetch(`/api/recitals/${target.recitalId}/recordings/presign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: target.kind, performanceId: target.performanceId, ext }),
    })
    if (!presign.ok) throw new Error('Could not prepare upload')
    const { uploadUrl, storagePath } = (await presign.json()) as { uploadUrl: string; storagePath: string }

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.blob.type || 'video/webm')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)))
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(file.blob)
    })

    const register = await fetch(`/api/recitals/${target.recitalId}/recordings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storagePath,
        kind: target.kind,
        performanceId: target.performanceId,
        mimeType: file.blob.type,
        fileSize: file.blob.size,
        durationSeconds: file.durationSeconds,
      }),
    })
    if (!register.ok) throw new Error('Could not save recording')
    return { storagePath, fileSize: file.blob.size, durationSeconds: file.durationSeconds }
  }
}
