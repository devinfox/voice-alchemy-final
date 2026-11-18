/**
 * Add or remove a track on a MediaStream and tell its listeners.
 *
 * Browsers fire a stream's `addtrack` / `removetrack` events only when the
 * browser itself changes the track set (a remote peer, a device). A script
 * calling `stream.addTrack()` fires nothing; the spec says so and Chrome,
 * Safari and Firefox all comply. Every stream handed to the meeting UI is
 * assembled by script (lib/meeting-session.ts), so the <audio>/<video>
 * elements listening for those events never heard about a track that arrived
 * after they mounted. On the 2026-10-27 daily call Scott's camera reached
 * Vince 129 ms before his microphone; the audio element for Scott mounted
 * with no sound and stayed silent for the whole call.
 *
 * These helpers make the script path behave like the browser path: mutate,
 * then dispatch the same event the browser would have, so listeners written
 * against the standard events keep working.
 */

type TrackEventType = 'addtrack' | 'removetrack'

function notify(stream: MediaStream, type: TrackEventType, track: MediaStreamTrack): void {
  try {
    if (typeof MediaStreamTrackEvent === 'function') {
      stream.dispatchEvent(new MediaStreamTrackEvent(type, { track }))
      return
    }
  } catch {
    // Fall through to the plain event.
  }
  // No MediaStreamTrackEvent constructor: send a plain event carrying the
  // track, so listeners that read `e.track` still work.
  try {
    const event = new Event(type) as Event & { track?: MediaStreamTrack }
    event.track = track
    stream.dispatchEvent(event)
  } catch {
    // Nothing to do: the element watchdogs resync on their own.
  }
}

/** Put `track` on `stream` (if it is not already there) and fire `addtrack`. Returns whether anything changed. */
export function addTrackNotifying(stream: MediaStream, track: MediaStreamTrack): boolean {
  if (stream.getTracks().includes(track)) return false
  stream.addTrack(track)
  notify(stream, 'addtrack', track)
  return true
}

/** Take `track` off `stream` (if it is there) and fire `removetrack`. Returns whether anything changed. */
export function removeTrackNotifying(stream: MediaStream, track: MediaStreamTrack): boolean {
  if (!stream.getTracks().includes(track)) return false
  stream.removeTrack(track)
  notify(stream, 'removetrack', track)
  return true
}

/** The live tracks of one kind, in stream order. Ended tracks are skipped: an element given one plays silence. */
export function liveTracks(stream: MediaStream, kind: 'audio' | 'video'): MediaStreamTrack[] {
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()
  return tracks.filter(t => t.readyState === 'live')
}

/** Same tracks, same order? */
export function sameTracks(a: readonly MediaStreamTrack[], b: readonly MediaStreamTrack[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i])
}
