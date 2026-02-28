/**
 * Recording Backup Utilities
 *
 * Uses IndexedDB to save recording blobs locally before upload attempt.
 * This provides a fallback in case of network failures during upload.
 */

const DB_NAME = 'recording-backup-db'
const DB_VERSION = 1
const STORE_NAME = 'pending-recordings'

export interface PendingRecording {
  id: string
  bookingId: string
  blob: Blob
  timestamp: number
  uploadAttempts: number
  lastAttemptAt: number | null
  classStartedAt: string | null
  roomName: string
  error: string | null
}

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * Open or create the IndexedDB database
 */
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('[RecordingBackup] Failed to open IndexedDB:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('bookingId', 'bookingId', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })

  return dbPromise
}

/**
 * Save a recording to IndexedDB as a backup before upload
 */
export async function saveRecordingBackup(
  bookingId: string,
  blob: Blob,
  roomName: string,
  classStartedAt: string | null
): Promise<string> {
  const db = await getDB()
  const id = `${bookingId}-${Date.now()}`

  const record: PendingRecording = {
    id,
    bookingId,
    blob,
    timestamp: Date.now(),
    uploadAttempts: 0,
    lastAttemptAt: null,
    classStartedAt,
    roomName,
    error: null,
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(record)

    request.onsuccess = () => {
      console.log(`[RecordingBackup] Saved backup for ${bookingId}, id: ${id}`)
      resolve(id)
    }

    request.onerror = () => {
      console.error('[RecordingBackup] Failed to save backup:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Update upload attempt count and error for a pending recording
 */
export async function updateUploadAttempt(
  id: string,
  error: string | null
): Promise<void> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const record = getRequest.result as PendingRecording | undefined
      if (!record) {
        resolve()
        return
      }

      record.uploadAttempts += 1
      record.lastAttemptAt = Date.now()
      record.error = error

      const putRequest = store.put(record)
      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    }

    getRequest.onerror = () => reject(getRequest.error)
  })
}

/**
 * Delete a recording backup after successful upload
 */
export async function deleteRecordingBackup(id: string): Promise<void> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => {
      console.log(`[RecordingBackup] Deleted backup: ${id}`)
      resolve()
    }

    request.onerror = () => {
      console.error('[RecordingBackup] Failed to delete backup:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Get all pending recordings that need upload
 */
export async function getPendingRecordings(): Promise<PendingRecording[]> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      resolve(request.result as PendingRecording[])
    }

    request.onerror = () => {
      console.error('[RecordingBackup] Failed to get pending recordings:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Get a specific pending recording by ID
 */
export async function getPendingRecording(id: string): Promise<PendingRecording | null> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => {
      resolve(request.result as PendingRecording | null)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Get count of pending recordings
 */
export async function getPendingCount(): Promise<number> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.count()

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Clear all pending recordings (use with caution)
 */
export async function clearAllPendingRecordings(): Promise<void> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => {
      console.log('[RecordingBackup] Cleared all pending recordings')
      resolve()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}
