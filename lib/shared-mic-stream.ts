type StreamListener = (stream: MediaStream | null) => void

let currentStream: MediaStream | null = null
let currentOwner: string | null = null
const listeners = new Set<StreamListener>()

function notify() {
  listeners.forEach((listener) => listener(currentStream))
}

export function setSharedMicStream(stream: MediaStream, ownerId: string) {
  currentStream = stream
  currentOwner = ownerId
  notify()
}

export function clearSharedMicStream(ownerId: string) {
  if (currentOwner !== ownerId) return
  currentStream = null
  currentOwner = null
  notify()
}

export function getSharedMicStream() {
  return currentStream
}

export function subscribeSharedMicStream(listener: StreamListener) {
  listeners.add(listener)
  listener(currentStream)

  return () => {
    listeners.delete(listener)
  }
}

