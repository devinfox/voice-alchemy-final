/**
 * ICE server configuration for the recital mesh. Media stays peer-to-peer;
 * these servers only help NAT traversal. Safe to import on client and server.
 */

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Public OpenRelay TURN keeps symmetric-NAT / corporate guests connectable
  // when no private TURN is configured. Configure TURN_* or Twilio for prod.
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

export function defaultIceConfiguration(): RTCConfiguration {
  return {
    iceServers: FALLBACK_ICE_SERVERS,
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  }
}

export function normalizeIceServers(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_ICE_SERVERS
  const servers: RTCIceServer[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const urls = e.urls ?? e.url
    if (!urls) continue
    const server: RTCIceServer = { urls: urls as string | string[] }
    if (typeof e.username === 'string') server.username = e.username
    if (typeof e.credential === 'string') server.credential = e.credential
    servers.push(server)
  }
  return servers.length > 0 ? servers : FALLBACK_ICE_SERVERS
}

export function mergeIceServers(primary: RTCIceServer[], extra: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>()
  const out: RTCIceServer[] = []
  for (const s of [...primary, ...extra]) {
    const key = JSON.stringify(s.urls)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/** Client: fetch ICE servers with the participant session token. Never blocks join. */
export async function fetchRecitalIceConfiguration(sessionToken: string): Promise<RTCConfiguration> {
  try {
    const res = await fetch('/api/recitals/ice', {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: 'no-store',
    })
    if (!res.ok) return defaultIceConfiguration()
    const data = (await res.json()) as { iceServers?: unknown }
    return { ...defaultIceConfiguration(), iceServers: normalizeIceServers(data.iceServers) }
  } catch {
    return defaultIceConfiguration()
  }
}
