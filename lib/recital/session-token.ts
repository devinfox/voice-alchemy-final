/**
 * Participant session tokens.
 *
 * Guests can join a recital without an account, so we can't lean on Supabase
 * auth for participant-scoped endpoints (uploads, soundcheck, leave). Instead
 * the join route mints a short-lived HS256 JWT bound to one participant row.
 */
import { SignJWT, jwtVerify } from 'jose'
import type { RecitalRole } from '@/types/recital.types'

export interface RecitalSessionClaims {
  recitalId: string
  participantId: string
  role: RecitalRole
}

function secretKey(): Uint8Array {
  const secret = process.env.RECITAL_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('RECITAL_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set')
  return new TextEncoder().encode(secret)
}

export async function signRecitalSession(claims: RecitalSessionClaims, ttlHours = 12): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.participantId)
    .setAudience('recital')
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(secretKey())
}

export async function verifyRecitalSession(token: string): Promise<RecitalSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: 'recital' })
    if (typeof payload.recitalId !== 'string' || typeof payload.participantId !== 'string') return null
    const role = payload.role === 'host' ? 'host' : 'audience'
    return { recitalId: payload.recitalId, participantId: payload.participantId, role }
  } catch {
    return null
  }
}
