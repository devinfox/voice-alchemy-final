import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/recital/server'
import { verifyRecitalSession } from '@/lib/recital/session-token'
import { FALLBACK_ICE_SERVERS, mergeIceServers, normalizeIceServers } from '@/lib/recital/ice'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/recitals/ice — short-lived ICE servers for the recital mesh.
 *
 * Callers must hold a recital session token or be logged in, so TURN
 * credentials aren't handed to anonymous scrapers.
 *
 * Resolution order:
 *  1. Twilio Network Traversal Service (TWILIO_* env, plain REST — no SDK)
 *  2. TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL env
 *  3. STUN + public OpenRelay TURN fallback
 */
export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const claims = bearer ? await verifyRecitalSession(bearer) : null
  if (!claims) {
    const user = await getAuthedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1) Twilio NTS
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
  if (accountSid && (authToken || (apiKeySid && apiKeySecret))) {
    try {
      const authUser = apiKeySid && apiKeySecret ? apiKeySid : accountSid
      const authPass = apiKeySid && apiKeySecret ? apiKeySecret : authToken!
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${authUser}:${authPass}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Ttl: '3600' }),
        cache: 'no-store',
      })
      if (res.ok) {
        const json = (await res.json()) as { ice_servers?: unknown }
        const servers = normalizeIceServers(json.ice_servers)
        return NextResponse.json({ iceServers: mergeIceServers(servers, FALLBACK_ICE_SERVERS), source: 'twilio-nts', ttl: 3600 })
      }
      console.warn('[recitals/ice] Twilio NTS responded', res.status)
    } catch (err) {
      console.warn('[recitals/ice] Twilio NTS failed:', err instanceof Error ? err.message : err)
    }
  }

  // 2) Explicit env TURN
  const turnUrls = process.env.TURN_URLS || process.env.NEXT_PUBLIC_TURN_URL
  const turnUsername = process.env.TURN_USERNAME || process.env.NEXT_PUBLIC_TURN_USERNAME
  const turnCredential = process.env.TURN_CREDENTIAL || process.env.NEXT_PUBLIC_TURN_CREDENTIAL
  if (turnUrls && turnUsername && turnCredential) {
    const envServers: RTCIceServer[] = turnUrls
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)
      .map((urls) => ({ urls, username: turnUsername, credential: turnCredential }))
    return NextResponse.json({
      iceServers: mergeIceServers([{ urls: 'stun:stun.l.google.com:19302' }, ...envServers], FALLBACK_ICE_SERVERS),
      source: 'env-turn',
      ttl: 3600,
    })
  }

  // 3) Fallback
  return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, source: 'fallback', ttl: 3600 })
}
