/**
 * Website leads and trigger-based funnel enrollment.
 *
 * Two kinds of recipient can sit in a funnel:
 *   - an account holder: enrollment.lead_id = profiles.id (email in `users`)
 *   - a website lead:    enrollment.contact_id = email_leads.id
 *
 * Funnels carry a `trigger_key`; a website submission or a new student
 * account enrolls the person into the live funnel for that trigger.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/email-unsubscribe'

export type FunnelTriggerKey =
  | 'student_signup'
  | 'student_lead'
  | 'teacher_demo'
  | 'teacher_lead'
  | 'mentorship_application'

export const FUNNEL_TRIGGERS: { key: FunnelTriggerKey; label: string; description: string }[] = [
  { key: 'student_signup', label: 'New student account', description: 'A student creates an account in the app' },
  { key: 'student_lead', label: 'Singer left an email', description: 'A singer submits the free-guide form on the website without an account' },
  { key: 'teacher_demo', label: 'Teacher demo request', description: 'A coach submits the platform demo form on the website' },
  { key: 'teacher_lead', label: 'Coach left an email', description: 'A coach leaves an email on the website without requesting a demo' },
  { key: 'mentorship_application', label: 'Voice Application submitted', description: 'A singer submits the 1:1 mentorship application' },
]

export const TRIGGER_KEYS = FUNNEL_TRIGGERS.map(t => t.key)

export function isTriggerKey(value: unknown): value is FunnelTriggerKey {
  return typeof value === 'string' && (TRIGGER_KEYS as string[]).includes(value)
}

export function triggerLabel(key: string | null | undefined): string | null {
  return FUNNEL_TRIGGERS.find(t => t.key === key)?.label || null
}

export interface EmailLeadRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  persona: string
  source: string | null
  last_type: string | null
  metadata: Record<string, unknown>
  profile_id: string | null
  is_unsubscribed: boolean
  created_at: string
  updated_at: string
}

export interface LeadInput {
  email: string
  first_name?: string | null
  last_name?: string | null
  persona?: 'singer' | 'coach' | null
  source?: string | null
  type?: string | null
  metadata?: Record<string, unknown> | null
}

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/**
 * Insert or update a lead by email. Names only overwrite when the new value
 * is non-empty; metadata is merged so progressive-profiling answers stack.
 */
export async function upsertLead(admin: SupabaseClient, input: LeadInput): Promise<EmailLeadRow> {
  const email = normalizeEmail(input.email)
  const { data: existing } = await admin.from('email_leads').select('*').eq('email', email).maybeSingle()

  const incomingMeta = (input.metadata && typeof input.metadata === 'object') ? input.metadata : {}
  const first = clip(input.first_name, 100)
  const last = clip(input.last_name, 100)
  const nowIso = new Date().toISOString()

  if (existing) {
    const patch: Record<string, unknown> = {
      first_name: first || existing.first_name,
      last_name: last || existing.last_name,
      persona: input.persona || existing.persona,
      source: existing.source || clip(input.source, 80),
      last_type: clip(input.type, 40) || existing.last_type,
      metadata: { ...(existing.metadata || {}), ...incomingMeta },
      updated_at: nowIso,
    }
    const { data, error } = await admin.from('email_leads').update(patch).eq('id', existing.id).select('*').single()
    if (error) throw new Error(error.message)
    return data as EmailLeadRow
  }

  const { data, error } = await admin
    .from('email_leads')
    .insert({
      email,
      first_name: first,
      last_name: last,
      persona: input.persona || 'singer',
      source: clip(input.source, 80),
      last_type: clip(input.type, 40),
      metadata: incomingMeta,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as EmailLeadRow
}

export async function isUnsubscribed(admin: SupabaseClient, email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  const { data } = await admin.from('email_unsubscribes').select('email').eq('email', normalizeEmail(email)).maybeSingle()
  return !!data
}

interface FunnelForEnroll {
  id: string
  name: string
  status: string
  total_enrolled: number | null
  phases: { id: string; phase_order: number; delay_days: number | null; delay_hours: number | null; template_id: string | null }[]
}

export function phaseDelayMs(phase: { delay_days?: number | null; delay_hours?: number | null }): number {
  return (((phase.delay_days || 0) * 24 + (phase.delay_hours || 0)) * 60) * 60 * 1000
}

/** The live (active, not deleted) funnel wired to a trigger, if any. */
export async function findFunnelByTrigger(admin: SupabaseClient, key: FunnelTriggerKey): Promise<FunnelForEnroll | null> {
  const { data } = await admin
    .from('email_funnels')
    .select('id, name, status, total_enrolled, phases:email_funnel_phases(id, phase_order, delay_days, delay_hours, template_id)')
    .eq('trigger_key', key)
    .eq('is_deleted', false)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const funnel = data as unknown as FunnelForEnroll
  funnel.phases = (funnel.phases || []).sort((a, b) => a.phase_order - b.phase_order)
  return funnel
}

export type EnrollRecipient = { profileId: string; leadId?: undefined } | { leadId: string; profileId?: undefined }

export interface EnrollResult {
  enrolled: boolean
  reason?: string
  enrollmentId?: string
  funnelName?: string
  firstSendAt?: string
}

/**
 * Put one person into a funnel starting at phase 1. Idempotent: a recipient
 * already active/paused/pending in the funnel is left alone.
 */
export async function enrollInFunnel(
  admin: SupabaseClient,
  funnel: FunnelForEnroll,
  recipient: EnrollRecipient,
  opts: { enrolledBy?: string | null; via: 'manual' | 'website' | 'signup' | 'ai' } = { via: 'manual' }
): Promise<EnrollResult> {
  if (funnel.status !== 'active') return { enrolled: false, reason: 'Funnel is not active', funnelName: funnel.name }
  if (funnel.phases.length === 0) return { enrolled: false, reason: 'Funnel has no phases', funnelName: funnel.name }
  if (funnel.phases.some(p => !p.template_id)) return { enrolled: false, reason: 'A phase has no template', funnelName: funnel.name }

  const column = recipient.profileId ? 'lead_id' : 'contact_id'
  const recipientId = (recipient.profileId || recipient.leadId) as string

  const { data: existing } = await admin
    .from('email_funnel_enrollments')
    .select('id, status')
    .eq('funnel_id', funnel.id)
    .eq(column, recipientId)
    .in('status', ['active', 'paused', 'pending_approval'])
    .limit(1)
    .maybeSingle()
  if (existing) return { enrolled: false, reason: 'Already in this funnel', enrollmentId: existing.id, funnelName: funnel.name }

  const now = new Date()
  const firstSendAt = new Date(now.getTime() + phaseDelayMs(funnel.phases[0])).toISOString()
  const { data: inserted, error } = await admin
    .from('email_funnel_enrollments')
    .insert({
      funnel_id: funnel.id,
      [column]: recipientId,
      status: 'active',
      current_phase: 1,
      enrolled_at: now.toISOString(),
      enrolled_by: opts.enrolledBy || null,
      enrolled_via: opts.via,
      next_email_scheduled_at: firstSendAt,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  await admin
    .from('email_funnels')
    .update({ total_enrolled: (funnel.total_enrolled || 0) + 1, updated_at: now.toISOString() })
    .eq('id', funnel.id)
  funnel.total_enrolled = (funnel.total_enrolled || 0) + 1

  return { enrolled: true, enrollmentId: inserted.id, funnelName: funnel.name, firstSendAt }
}

/** Enroll into whichever live funnel is wired to `key`. */
export async function enrollByTrigger(
  admin: SupabaseClient,
  key: FunnelTriggerKey,
  recipient: EnrollRecipient,
  opts: { enrolledBy?: string | null; via: 'website' | 'signup' }
): Promise<EnrollResult> {
  const funnel = await findFunnelByTrigger(admin, key)
  if (!funnel) return { enrolled: false, reason: `No active funnel for trigger "${key}"` }
  return enrollInFunnel(admin, funnel, recipient, opts)
}

/**
 * Cancel a person's live enrollments, optionally only in funnels with the
 * given triggers (e.g. end the lead track once they create an account).
 */
export async function cancelEnrollments(
  admin: SupabaseClient,
  recipient: EnrollRecipient,
  reason: string,
  triggerKeys?: FunnelTriggerKey[]
): Promise<number> {
  const column = recipient.profileId ? 'lead_id' : 'contact_id'
  const recipientId = (recipient.profileId || recipient.leadId) as string

  const query = admin
    .from('email_funnel_enrollments')
    .select('id, funnel:email_funnels(trigger_key)')
    .eq(column, recipientId)
    .in('status', ['active', 'paused', 'pending_approval'])
  const { data } = await query
  const rows = (data || []) as { id: string; funnel: { trigger_key: string | null } | { trigger_key: string | null }[] | null }[]
  const ids = rows
    .filter(r => {
      if (!triggerKeys) return true
      const f = Array.isArray(r.funnel) ? r.funnel[0] : r.funnel
      return !!f?.trigger_key && (triggerKeys as string[]).includes(f.trigger_key)
    })
    .map(r => r.id)
  if (ids.length === 0) return 0

  const nowIso = new Date().toISOString()
  await admin
    .from('email_funnel_enrollments')
    .update({ status: 'cancelled', cancelled_at: nowIso, cancel_reason: reason, next_email_scheduled_at: null, updated_at: nowIso })
    .in('id', ids)
  return ids.length
}

/** Cancel every live enrollment for an email address (both lead and account rows). */
export async function cancelEnrollmentsByEmail(admin: SupabaseClient, email: string, reason: string): Promise<number> {
  const e = normalizeEmail(email)
  let count = 0
  const { data: lead } = await admin.from('email_leads').select('id').eq('email', e).maybeSingle()
  if (lead) count += await cancelEnrollments(admin, { leadId: lead.id }, reason)
  const { data: user } = await admin.from('users').select('id').ilike('email', e).limit(1).maybeSingle()
  if (user) count += await cancelEnrollments(admin, { profileId: user.id }, reason)
  return count
}
