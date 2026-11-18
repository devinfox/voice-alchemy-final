/**
 * LiveKit, server side. Copied from ../crm/lib/livekit-server.ts (the parts
 * group classes and recitals use).
 *
 * Group calls run on a LiveKit SFU (LiveKit Cloud, or a self-hosted
 * livekit-server): each person uploads one copy of their camera and mic and
 * the server forwards it, instead of the browser-to-browser mesh where every
 * person uploaded a copy to every other person.
 *
 * Our backend is the only thing that holds the API key. It issues the join
 * tokens (app/api/recitals/livekit).
 *
 * Env: LIVEKIT_URL (wss://… for LiveKit Cloud, ws://localhost:7880 for a
 * local `livekit-server --dev`), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
 * Without them, group calls stay on the mesh (lib/recital/mesh.ts).
 */
import { AccessToken, type VideoGrant } from 'livekit-server-sdk'

export interface LiveKitConfig {
  /** The URL browsers connect to. */
  url: string
  apiKey: string
  apiSecret: string
}

export function livekitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL?.trim()
  const apiKey = process.env.LIVEKIT_API_KEY?.trim()
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()
  if (!url || !apiKey || !apiSecret) return null
  return { url, apiKey, apiSecret }
}

export function livekitConfigured(): boolean {
  return livekitConfig() !== null
}

/** What we stash on each participant. */
export interface ParticipantMeta {
  host: boolean
  /** Always false here: people in the waiting room get no token at all. */
  waiting: boolean
  guest: boolean
}

/** The grants an admitted participant has. */
export function admittedGrant(room: string): VideoGrant {
  return {
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  }
}

export async function createJoinToken(params: {
  room: string
  identity: string
  name: string
  meta: ParticipantMeta
}): Promise<string> {
  const cfg = livekitConfig()
  if (!cfg) throw new Error('LiveKit is not configured')
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: params.identity,
    name: params.name,
    metadata: JSON.stringify(params.meta),
    // Long enough for any class or recital; the token only matters at connect time.
    ttl: '8h',
  })
  token.addGrant(admittedGrant(params.room))
  return token.toJwt()
}
