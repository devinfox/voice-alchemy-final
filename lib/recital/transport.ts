/**
 * What a group class or recital room needs from "the thing that carries the
 * call". Two things can be it:
 *
 *   - RecitalSfu (./sfu.ts): the LiveKit media server, same engine as the
 *     CRM's daily meeting. Used whenever the server has LiveKit configured.
 *   - RecitalMesh (./mesh.ts): browser-to-browser. The fallback while LiveKit
 *     is not configured; fine for a handful of people.
 *
 * Everyone in a room must be on the same one, which is why the server (not
 * the browser) decides.
 */
import type { RecitalMessage, RecitalPresence } from './protocol'
import type { MeshOptions, PeerConnectionStatus, VideoMode } from './mesh'

export interface RecitalTransport {
  readonly participantId: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  reconcilePeers(list?: RecitalPresence[]): void
  setAudioTrack(track: MediaStreamTrack | null): Promise<void>
  setVideoTrack(track: MediaStreamTrack | null): Promise<void>
  setScreenTracks(video: MediaStreamTrack | null, audio?: MediaStreamTrack | null): Promise<void>
  isSharingScreen(): boolean
  setVideoMode(mode: VideoMode): Promise<void>
  getVideoMode(): VideoMode
  setSpotlightBudget(kbps: number): void
  updatePresence(patch: Partial<RecitalPresence>): void
  getPresence(): RecitalPresence
  getParticipants(): RecitalPresence[]
  broadcast(msg: RecitalMessage): void
  sendTo(peerId: string, msg: RecitalMessage): void
  getPeerStatus(peerId: string): PeerConnectionStatus
  getRemoteStream(peerId: string): MediaStream | null
  getRemoteScreen(peerId: string): MediaStream | null
}

export interface TransportOptions extends Omit<MeshOptions, 'ice'> {
  /** The class/recital session token from the join route. */
  sessionToken: string
}

async function mediaServerEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/recitals/livekit', { cache: 'no-store' })
    if (!res.ok) return false
    return ((await res.json()) as { enabled?: boolean }).enabled === true
  } catch {
    return false
  }
}

/** Build the transport for this room. Nothing is connected until `connect()`. */
export async function createRecitalTransport(options: TransportOptions): Promise<RecitalTransport> {
  if (await mediaServerEnabled()) {
    // Loaded on demand so the LiveKit client is only downloaded when it is used.
    const { RecitalSfu } = await import('./sfu')
    return new RecitalSfu(options)
  }
  const [{ RecitalMesh }, { fetchRecitalIceConfiguration }] = await Promise.all([import('./mesh'), import('./ice')])
  const { sessionToken, ...rest } = options
  return new RecitalMesh({ ...rest, ice: await fetchRecitalIceConfiguration(sessionToken) })
}
