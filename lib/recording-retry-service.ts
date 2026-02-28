/**
 * Recording Retry Service
 *
 * Background service that checks for pending recording uploads on page load
 * and automatically retries failed uploads with exponential backoff.
 */

import {
  getPendingRecordings,
  updateUploadAttempt,
  deleteRecordingBackup,
  type PendingRecording,
} from './recording-backup'

const MAX_RETRIES = 5
const BASE_DELAY_MS = 2000 // 2 seconds

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error' | 'retrying'

export interface UploadProgress {
  status: UploadStatus
  backupId: string | null
  attempts: number
  maxRetries: number
  error: string | null
}

type ProgressCallback = (progress: UploadProgress) => void
type NotificationCallback = (message: string, type: 'info' | 'success' | 'warning' | 'error') => void

let progressCallbacks: ProgressCallback[] = []
let notificationCallback: NotificationCallback | null = null

/**
 * Subscribe to upload progress updates
 */
export function subscribeToProgress(callback: ProgressCallback): () => void {
  progressCallbacks.push(callback)
  return () => {
    progressCallbacks = progressCallbacks.filter((cb) => cb !== callback)
  }
}

/**
 * Set notification callback for stuck uploads
 */
export function setNotificationCallback(callback: NotificationCallback | null): void {
  notificationCallback = callback
}

/**
 * Notify all progress subscribers
 */
function notifyProgress(progress: UploadProgress): void {
  progressCallbacks.forEach((cb) => cb(progress))
}

/**
 * Show notification to user
 */
function showNotification(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
  if (notificationCallback) {
    notificationCallback(message, type)
  } else {
    console.log(`[RecordingRetryService] ${type.toUpperCase()}: ${message}`)
  }
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number): number {
  // 2s, 4s, 8s, 16s, 32s
  return BASE_DELAY_MS * Math.pow(2, attempt)
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Upload a recording with retry logic
 */
export async function uploadRecordingWithRetry(
  bookingId: string,
  blob: Blob,
  roomName: string,
  classStartedAt: string | null,
  backupId: string
): Promise<boolean> {
  let lastError: string | null = null

  console.log(`[RetryService] 🔄 Starting upload with retry logic`)
  console.log(`[RetryService]    Booking: ${bookingId}`)
  console.log(`[RetryService]    Backup ID: ${backupId}`)
  console.log(`[RetryService]    Max retries: ${MAX_RETRIES}`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const isRetry = attempt > 0
      console.log(`\n[RetryService] 📤 Attempt ${attempt + 1}/${MAX_RETRIES}${isRetry ? ' (RETRY)' : ''}`)

      notifyProgress({
        status: isRetry ? 'retrying' : 'uploading',
        backupId,
        attempts: attempt + 1,
        maxRetries: MAX_RETRIES,
        error: null,
      })

      const formData = new FormData()
      const filename = `lesson-${bookingId}-${Date.now()}.webm`
      formData.append('recording', blob, filename)
      formData.append('roomName', roomName)
      if (classStartedAt) {
        formData.append('classStartedAt', classStartedAt)
      }

      console.log(`[RetryService]    Filename: ${filename}`)
      console.log(`[RetryService]    Sending POST to /api/lessons/${bookingId}/recordings`)

      const uploadStart = Date.now()
      const response = await fetch(`/api/lessons/${bookingId}/recordings`, {
        method: 'POST',
        body: formData,
      })

      const uploadTime = Date.now() - uploadStart
      console.log(`[RetryService]    Response received in ${uploadTime}ms`)
      console.log(`[RetryService]    Status: ${response.status} ${response.statusText}`)

      if (response.ok) {
        const result = await response.json()
        console.log(`[RetryService] ✅ Upload successful!`)
        console.log(`[RetryService]    Recording ID: ${result.recording?.id}`)

        await deleteRecordingBackup(backupId)
        console.log(`[RetryService]    Backup deleted from IndexedDB`)

        notifyProgress({
          status: 'success',
          backupId,
          attempts: attempt + 1,
          maxRetries: MAX_RETRIES,
          error: null,
        })
        return true
      }

      const errorText = await response.text()
      lastError = `HTTP ${response.status}: ${errorText.slice(0, 200)}`
      await updateUploadAttempt(backupId, lastError)

      console.warn(`[RetryService] ⚠️ Attempt ${attempt + 1} failed:`, lastError)
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error'
      await updateUploadAttempt(backupId, lastError)
      console.warn(`[RetryService] ⚠️ Attempt ${attempt + 1} error:`, lastError)
    }

    // Don't delay after last attempt
    if (attempt < MAX_RETRIES - 1) {
      const delay = getBackoffDelay(attempt)
      console.log(`[RetryService] ⏳ Waiting ${delay / 1000}s before retry...`)
      await sleep(delay)
    }
  }

  // All retries exhausted
  console.error(`\n[RetryService] ❌ All ${MAX_RETRIES} attempts failed`)
  console.error(`[RetryService]    Last error: ${lastError}`)
  console.error(`[RetryService]    Backup preserved in IndexedDB: ${backupId}`)

  notifyProgress({
    status: 'error',
    backupId,
    attempts: MAX_RETRIES,
    maxRetries: MAX_RETRIES,
    error: lastError,
  })

  return false
}

/**
 * Process a single pending recording
 */
async function processPendingRecording(recording: PendingRecording): Promise<boolean> {
  // Skip if already at max retries
  if (recording.uploadAttempts >= MAX_RETRIES) {
    return false
  }

  // Calculate remaining retries
  const remainingRetries = MAX_RETRIES - recording.uploadAttempts

  console.log(
    `[RecordingRetryService] Processing pending recording ${recording.id}, ` +
    `attempts: ${recording.uploadAttempts}, remaining: ${remainingRetries}`
  )

  notifyProgress({
    status: 'retrying',
    backupId: recording.id,
    attempts: recording.uploadAttempts,
    maxRetries: MAX_RETRIES,
    error: recording.error,
  })

  // Try to upload with remaining retries
  for (let attempt = 0; attempt < remainingRetries; attempt++) {
    try {
      const formData = new FormData()
      formData.append('recording', recording.blob, `lesson-${recording.bookingId}-${Date.now()}.webm`)
      formData.append('roomName', recording.roomName)
      if (recording.classStartedAt) {
        formData.append('classStartedAt', recording.classStartedAt)
      }

      const response = await fetch(`/api/lessons/${recording.bookingId}/recordings`, {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        await deleteRecordingBackup(recording.id)
        showNotification('Recording uploaded successfully!', 'success')
        notifyProgress({
          status: 'success',
          backupId: recording.id,
          attempts: recording.uploadAttempts + attempt + 1,
          maxRetries: MAX_RETRIES,
          error: null,
        })
        return true
      }

      const errorText = await response.text()
      await updateUploadAttempt(recording.id, `HTTP ${response.status}: ${errorText}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error'
      await updateUploadAttempt(recording.id, errorMessage)
    }

    // Delay before next retry
    if (attempt < remainingRetries - 1) {
      await sleep(getBackoffDelay(recording.uploadAttempts + attempt))
    }
  }

  return false
}

/**
 * Check and process all pending recordings
 * Called on app load
 */
export async function checkPendingUploads(): Promise<void> {
  try {
    const pending = await getPendingRecordings()

    if (pending.length === 0) {
      return
    }

    console.log(`[RecordingRetryService] Found ${pending.length} pending recording(s)`)

    // Separate into retriable and stuck uploads
    const retriable = pending.filter((r) => r.uploadAttempts < MAX_RETRIES)
    const stuck = pending.filter((r) => r.uploadAttempts >= MAX_RETRIES)

    // Notify about stuck uploads
    if (stuck.length > 0) {
      showNotification(
        `${stuck.length} recording(s) failed to upload after multiple attempts. Please check your connection.`,
        'warning'
      )
    }

    // Process retriable uploads one at a time
    for (const recording of retriable) {
      const ageHours = (Date.now() - recording.timestamp) / (1000 * 60 * 60)

      // Show notification for older pending uploads
      if (ageHours > 1) {
        showNotification(
          `Retrying upload for a recording from ${Math.round(ageHours)} hour(s) ago...`,
          'info'
        )
      }

      await processPendingRecording(recording)
    }
  } catch (err) {
    console.error('[RecordingRetryService] Error checking pending uploads:', err)
  }
}

/**
 * Manually retry a specific stuck recording
 */
export async function retryStuckRecording(backupId: string): Promise<boolean> {
  try {
    const pending = await getPendingRecordings()
    const recording = pending.find((r) => r.id === backupId)

    if (!recording) {
      console.error('[RecordingRetryService] Recording not found:', backupId)
      return false
    }

    // Reset attempt count for manual retry
    const formData = new FormData()
    formData.append('recording', recording.blob, `lesson-${recording.bookingId}-${Date.now()}.webm`)
    formData.append('roomName', recording.roomName)
    if (recording.classStartedAt) {
      formData.append('classStartedAt', recording.classStartedAt)
    }

    notifyProgress({
      status: 'uploading',
      backupId,
      attempts: 1,
      maxRetries: 1,
      error: null,
    })

    const response = await fetch(`/api/lessons/${recording.bookingId}/recordings`, {
      method: 'POST',
      body: formData,
    })

    if (response.ok) {
      await deleteRecordingBackup(backupId)
      showNotification('Recording uploaded successfully!', 'success')
      notifyProgress({
        status: 'success',
        backupId,
        attempts: 1,
        maxRetries: 1,
        error: null,
      })
      return true
    }

    const errorText = await response.text()
    const errorMessage = `HTTP ${response.status}: ${errorText}`
    await updateUploadAttempt(backupId, errorMessage)

    notifyProgress({
      status: 'error',
      backupId,
      attempts: 1,
      maxRetries: 1,
      error: errorMessage,
    })

    showNotification(`Upload failed: ${errorMessage}`, 'error')
    return false
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Network error'
    notifyProgress({
      status: 'error',
      backupId,
      attempts: 1,
      maxRetries: 1,
      error: errorMessage,
    })
    showNotification(`Upload error: ${errorMessage}`, 'error')
    return false
  }
}

/**
 * Get list of stuck recordings (exceeded max retries)
 */
export async function getStuckRecordings(): Promise<PendingRecording[]> {
  const pending = await getPendingRecordings()
  return pending.filter((r) => r.uploadAttempts >= MAX_RETRIES)
}

/**
 * Initialize the retry service - call this on app startup
 */
export function initRecordingRetryService(): void {
  // Only run in browser
  if (typeof window === 'undefined') return

  // Check for pending uploads after a short delay to let the app settle
  setTimeout(() => {
    checkPendingUploads().catch((err) => {
      console.error('[RecordingRetryService] Init error:', err)
    })
  }, 3000)
}
