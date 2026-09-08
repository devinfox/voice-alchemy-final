/**
 * Server-side helpers for the training-session API routes.
 * Session tokens reuse the recital signer; `recitalId` carries the session id.
 */
import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyRecitalSession, type RecitalSessionClaims } from '@/lib/recital/session-token'
import { getAuthedUser, type AuthedUser } from '@/lib/recital/server'
import type { TrainingParticipant, TrainingSession } from '@/types/training.types'

export { getAuthedUser, isTeachingRole, hostDisplayName, sanitizeName } from '@/lib/recital/server'

export async function loadSession(id: string): Promise<TrainingSession | null> {
  const { data } = await getSupabaseAdmin().from('training_sessions').select('*').eq('id', id).maybeSingle()
  return (data as TrainingSession | null) ?? null
}

export async function loadSessionByCode(code: string): Promise<TrainingSession | null> {
  const { data } = await getSupabaseAdmin().from('training_sessions').select('*').eq('join_code', code).maybeSingle()
  return (data as TrainingSession | null) ?? null
}

export async function loadTrainingParticipants(sessionId: string): Promise<TrainingParticipant[]> {
  const { data } = await getSupabaseAdmin()
    .from('training_session_participants')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data as TrainingParticipant[] | null) ?? []
}

export function isSessionHost(session: TrainingSession, user: AuthedUser | null): boolean {
  if (!user) return false
  return session.host_id === user.id || user.role === 'admin'
}

export async function resolveTrainingCaller(
  request: NextRequest,
  session: TrainingSession
): Promise<{ claims: RecitalSessionClaims | null; isHost: boolean; user: AuthedUser | null }> {
  const header = request.headers.get('authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const claims = bearer ? await verifyRecitalSession(bearer) : null
  const validClaims = claims && claims.recitalId === session.id ? claims : null
  const user = await getAuthedUser()
  const isHost = validClaims?.role === 'host' || isSessionHost(session, user)
  return { claims: validClaims, isHost, user }
}

export function stripEmail<T extends { email?: string | null }>(row: T): Omit<T, 'email'> {
  const copy: Partial<T> = { ...row }
  delete copy.email
  return copy as Omit<T, 'email'>
}

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const e = input.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e.slice(0, 200) : null
}
