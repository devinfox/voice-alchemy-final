/**
 * ICE server configuration for the recital / group-class mesh. Media stays
 * peer-to-peer; these servers only help NAT traversal. Safe to import on
 * client and server.
 *
 * The real servers come from /api/recitals/ice (Cloudflare TURN, Twilio, or
 * TURN_* env). These static entries are the no-network fallback and the STUN
 * that is always merged in. There is deliberately no public TURN here: the
 * free OpenRelay service this used to list is gone, and a dead relay in the
 * list only slows connection setup down. (Same setup as ../crm.)
 */

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

/**
 * How many ICE candidate sets the browser pre-gathers before negotiation.
 * Every connection is bundled onto one transport, so one is all a call uses;
 * a larger pool only opens extra relay allocations per peer for nothing.
 */
export const ICE_CANDIDATE_POOL_SIZE = 1

export function defaultIceConfiguration(): RTCConfiguration {
  return {
    iceServers: FALLBACK_ICE_SERVERS,
    iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  }
}

/** True when at least one server in the list is a TURN relay. */
export function hasTurnServer(servers: RTCIceServer[]): boolean {
  return servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls]
    return urls.some((u) => /^turns?:/i.test(u))
  })
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
    const key = JSON.stringify({ urls: s.urls, username: s.username || '' })
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
