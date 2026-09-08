/**
 * Server-side helpers shared by the recital API routes.
 */
import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { verifyRecitalSession, type RecitalSessionClaims } from './session-token'
import type { Recital, RecitalParticipant, RecitalPerformance } from '@/types/recital.types'

export const RECORDINGS_BUCKET = 'recital-recordings'

export interface AuthedUser {
  id: string
  email: string | null
  role: string | null
  name: string
}

/** Current Supabase user with profile, or null. */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, name, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()
  const name =
    profile?.name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Guest'
  return { id: user.id, email: user.email ?? null, role: profile?.role ?? null, name }
}

export function isTeachingRole(role: string | null | undefined): boolean {
  return role === 'teacher' || role === 'instructor' || role === 'admin'
}

export async function loadRecital(recitalId: string): Promise<Recital | null> {
  const admin = getSupabaseAdmin()
  const { data } = await admin.from('recitals').select('*').eq('id', recitalId).maybeSingle()
  return (data as Recital | null) ?? null
}

export async function loadRecitalByCode(code: string): Promise<Recital | null> {
  const admin = getSupabaseAdmin()
  const { data } = await admin.from('recitals').select('*').eq('join_code', code).maybeSingle()
  return (data as Recital | null) ?? null
}

export async function loadPerformances(recitalId: string): Promise<RecitalPerformance[]> {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('recital_performances')
    .select('*')
    .eq('recital_id', recitalId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as RecitalPerformance[] | null) ?? []
}

export async function loadParticipants(recitalId: string): Promise<RecitalParticipant[]> {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('recital_participants')
    .select('*')
    .eq('recital_id', recitalId)
    .order('created_at', { ascending: true })
  return (data as RecitalParticipant[] | null) ?? []
}

export async function hostDisplayName(hostId: string): Promise<string> {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('profiles')
    .select('name, first_name, last_name')
    .eq('id', hostId)
    .maybeSingle()
  return data?.name || [data?.first_name, data?.last_name].filter(Boolean).join(' ') || 'Your host'
}

/** True when the logged-in user owns the recital (or is an admin). */
export async function isHostOf(recital: Recital, user: AuthedUser | null): Promise<boolean> {
  if (!user) return false
  return recital.host_id === user.id || user.role === 'admin'
}

/**
 * Resolve who is calling a participant-scoped endpoint. Accepts either a
 * recital session token (guests and members) or a logged-in host.
 */
export async function resolveCaller(
  request: NextRequest,
  recital: Recital
): Promise<{ claims: RecitalSessionClaims | null; isHost: boolean; user: AuthedUser | null }> {
  const header = request.headers.get('authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const claims = bearer ? await verifyRecitalSession(bearer) : null
  const validClaims = claims && claims.recitalId === recital.id ? claims : null
  const user = await getAuthedUser()
  const isHost = (validClaims?.role === 'host') || (await isHostOf(recital, user))
  return { claims: validClaims, isHost, user }
}

/** Strip guest emails before handing a roster to non-hosts. */
export function withoutEmail<T extends { email?: string | null }>(row: T): Omit<T, 'email'> {
  const copy: Partial<T> = { ...row }
  delete copy.email
  return copy as Omit<T, 'email'>
}

export function sanitizeName(input: unknown, fallback = 'Guest'): string {
  if (typeof input !== 'string') return fallback
  const trimmed = input.replace(/\s+/g, ' ').trim().slice(0, 60)
  return trimmed || fallback
}
