/**
 * Contact tags and the funnel automation they drive.
 *
 * A tag (email_tags) can sit on a website lead (email_leads.id) or an account
 * holder (profiles.id). Funnels listen to tags in three ways
 * (migration 20261107000001_email_tags.sql):
 *
 *   trigger_tag_ids  - adding the tag enrolls the person
 *   exit_tag_ids     - adding the tag cancels their live enrollment
 *   complete_tag_ids - finishing the funnel applies these tags
 *
 * Every write goes through addTags()/removeTags() so the automation fires
 * no matter where the tag came from: the Leads page, the website, a funnel
 * finishing, or a bulk action.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelEnrollments, enrollInFunnel, type EnrollRecipient } from '@/lib/email-leads'

export * from './email-tags-shared'
import { isMissingTagsTable, isUuid, nextTagColor, normalizeTagName, type EmailTag } from './email-tags-shared'

export type TagAddedVia = 'manual' | 'website' | 'funnel' | 'import'

export interface TagRecipients {
  leadIds?: string[]
  profileIds?: string[]
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function listTags(admin: SupabaseClient, opts: { withCounts?: boolean } = {}): Promise<EmailTag[]> {
  const { data, error } = await admin
    .from('email_tags')
    .select('id, name, color, description, created_at')
    .eq('is_deleted', false)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  const tags = (data || []) as EmailTag[]
  if (!opts.withCounts || tags.length === 0) return tags

  const { data: rows } = await admin.from('email_contact_tags').select('tag_id')
  const counts = new Map<string, number>()
  for (const r of rows || []) counts.set(r.tag_id, (counts.get(r.tag_id) || 0) + 1)
  return tags.map(t => ({ ...t, count: counts.get(t.id) || 0 }))
}

/**
 * Resolve tag names to rows, creating any that do not exist yet. Matching is
 * case-insensitive, so "vip" and "VIP" are the same tag.
 */
export async function getOrCreateTags(
  admin: SupabaseClient,
  names: string[],
  opts: { createdBy?: string | null } = {}
): Promise<EmailTag[]> {
  const wanted = [...new Set(names.map(normalizeTagName).filter(Boolean))]
  if (wanted.length === 0) return []

  const existing = await listTags(admin)
  const byLower = new Map(existing.map(t => [t.name.toLowerCase(), t]))
  const result: EmailTag[] = []
  const toCreate: string[] = []
  for (const name of wanted) {
    const hit = byLower.get(name.toLowerCase())
    if (hit) result.push(hit)
    else toCreate.push(name)
  }

  if (toCreate.length > 0) {
    const palette: { color: string }[] = [...existing]
    const rows = toCreate.map(name => {
      const color = nextTagColor(palette)
      palette.push({ color })
      return { name, color, created_by: opts.createdBy || null }
    })
    const { data, error } = await admin.from('email_tags').insert(rows).select('id, name, color, description, created_at')
    if (error) throw new Error(error.message)
    result.push(...((data || []) as EmailTag[]))
  }
  return result
}

// ---------------------------------------------------------------------------
// Reading who has what
// ---------------------------------------------------------------------------

export interface ContactTagMap {
  /** email_leads.id → tags */
  leads: Map<string, EmailTag[]>
  /** profiles.id → tags */
  profiles: Map<string, EmailTag[]>
}

/** Tags on a set of people, keyed by lead id and profile id. */
export async function tagsForRecipients(admin: SupabaseClient, who: TagRecipients): Promise<ContactTagMap> {
  const out: ContactTagMap = { leads: new Map(), profiles: new Map() }
  const leadIds = who.leadIds || []
  const profileIds = who.profileIds || []
  if (leadIds.length === 0 && profileIds.length === 0) return out

  const tags = await listTags(admin)
  const tagById = new Map(tags.map(t => [t.id, t]))

  const chunks = <T,>(arr: T[], size = 500): T[][] => {
    const res: T[][] = []
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
    return res
  }

  for (const ids of chunks(leadIds)) {
    const { data } = await admin.from('email_contact_tags').select('tag_id, lead_id').in('lead_id', ids)
    for (const r of data || []) {
      const tag = tagById.get(r.tag_id)
      if (!tag) continue
      out.leads.set(r.lead_id, [...(out.leads.get(r.lead_id) || []), tag])
    }
  }
  for (const ids of chunks(profileIds)) {
    const { data } = await admin.from('email_contact_tags').select('tag_id, profile_id').in('profile_id', ids)
    for (const r of data || []) {
      const tag = tagById.get(r.tag_id)
      if (!tag) continue
      out.profiles.set(r.profile_id, [...(out.profiles.get(r.profile_id) || []), tag])
    }
  }
  const sortTags = (list: EmailTag[]) => list.sort((a, b) => a.name.localeCompare(b.name))
  for (const [, list] of out.leads) sortTags(list)
  for (const [, list] of out.profiles) sortTags(list)
  return out
}

/**
 * Everyone carrying the given tags. `mode: 'all'` requires every tag;
 * the default `'any'` matches people with at least one of them.
 */
export async function recipientsForTags(
  admin: SupabaseClient,
  tagIds: string[],
  mode: 'any' | 'all' = 'any'
): Promise<{ leadIds: string[]; profileIds: string[] }> {
  const ids = tagIds.filter(isUuid)
  if (ids.length === 0) return { leadIds: [], profileIds: [] }
  const { data, error } = await admin.from('email_contact_tags').select('tag_id, lead_id, profile_id').in('tag_id', ids)
  if (error) throw new Error(error.message)

  const leadHits = new Map<string, Set<string>>()
  const profileHits = new Map<string, Set<string>>()
  for (const r of data || []) {
    const target = r.lead_id ? leadHits : profileHits
    const key = (r.lead_id || r.profile_id) as string
    target.set(key, (target.get(key) || new Set()).add(r.tag_id))
  }
  const keep = (hits: Map<string, Set<string>>) =>
    [...hits.entries()].filter(([, set]) => (mode === 'all' ? ids.every(id => set.has(id)) : set.size > 0)).map(([id]) => id)
  return { leadIds: keep(leadHits), profileIds: keep(profileHits) }
}

// ---------------------------------------------------------------------------
// Writing tags (and running the automation)
// ---------------------------------------------------------------------------

export interface TagChangeResult {
  added: number
  removed: number
  /** Funnels started by trigger tags: "<funnel name>" × people */
  enrolled: { funnel: string; count: number }[]
  /** Funnels stopped by exit tags */
  stopped: { funnel: string; count: number }[]
}

interface TagFunnel {
  id: string
  name: string
  status: string
  total_enrolled: number | null
  trigger_tag_ids: string[] | null
  exit_tag_ids: string[] | null
  phases: { id: string; phase_order: number; delay_days: number | null; delay_hours: number | null; template_id: string | null }[]
}

async function funnelsListeningTo(admin: SupabaseClient, tagIds: string[]): Promise<TagFunnel[]> {
  if (tagIds.length === 0) return []
  const { data, error } = await admin
    .from('email_funnels')
    .select('id, name, status, total_enrolled, trigger_tag_ids, exit_tag_ids, phases:email_funnel_phases(id, phase_order, delay_days, delay_hours, template_id)')
    .eq('is_deleted', false)
    .or(`trigger_tag_ids.ov.{${tagIds.join(',')}},exit_tag_ids.ov.{${tagIds.join(',')}}`)
  if (error) {
    // Old schema without the tag columns: tags still work, automation does not.
    if (isMissingTagsTable(error.message)) return []
    throw new Error(error.message)
  }
  return ((data || []) as unknown as TagFunnel[]).map(f => ({
    ...f,
    phases: (f.phases || []).sort((a, b) => a.phase_order - b.phase_order),
  }))
}

/**
 * Put tags on people. Tags they already have are skipped. For every tag that
 * is genuinely new to a person, trigger funnels enroll them and exit funnels
 * drop them.
 */
export async function addTags(
  admin: SupabaseClient,
  who: TagRecipients,
  tagIds: string[],
  opts: { via: TagAddedVia; by?: string | null }
): Promise<TagChangeResult> {
  const result: TagChangeResult = { added: 0, removed: 0, enrolled: [], stopped: [] }
  const ids = [...new Set(tagIds.filter(isUuid))]
  const leadIds = [...new Set((who.leadIds || []).filter(isUuid))]
  const profileIds = [...new Set((who.profileIds || []).filter(isUuid))]
  if (ids.length === 0 || (leadIds.length === 0 && profileIds.length === 0)) return result

  // What they already carry, so only new (tag, person) pairs fire automation
  const current = await tagsForRecipients(admin, { leadIds, profileIds })
  const rows: { tag_id: string; lead_id: string | null; profile_id: string | null; added_via: string; added_by: string | null }[] = []
  const newPairs: { tagId: string; recipient: EnrollRecipient }[] = []
  for (const tagId of ids) {
    for (const leadId of leadIds) {
      if ((current.leads.get(leadId) || []).some(t => t.id === tagId)) continue
      rows.push({ tag_id: tagId, lead_id: leadId, profile_id: null, added_via: opts.via, added_by: opts.by || null })
      newPairs.push({ tagId, recipient: { leadId } })
    }
    for (const profileId of profileIds) {
      if ((current.profiles.get(profileId) || []).some(t => t.id === tagId)) continue
      rows.push({ tag_id: tagId, lead_id: null, profile_id: profileId, added_via: opts.via, added_by: opts.by || null })
      newPairs.push({ tagId, recipient: { profileId } })
    }
  }
  if (rows.length === 0) return result

  const { error } = await admin.from('email_contact_tags').insert(rows)
  if (error) throw new Error(error.message)
  result.added = rows.length

  // Automation
  const funnels = await funnelsListeningTo(admin, ids)
  if (funnels.length === 0) return result

  const enrolledCount = new Map<string, number>()
  const stoppedCount = new Map<string, number>()
  for (const { tagId, recipient } of newPairs) {
    for (const funnel of funnels) {
      if ((funnel.exit_tag_ids || []).includes(tagId)) {
        const n = await cancelEnrollmentInFunnel(admin, funnel.id, recipient, 'Tagged for exit')
        if (n > 0) stoppedCount.set(funnel.name, (stoppedCount.get(funnel.name) || 0) + n)
      }
      if ((funnel.trigger_tag_ids || []).includes(tagId) && funnel.status === 'active') {
        const r = await enrollInFunnel(admin, funnel, recipient, { via: 'tag', enrolledBy: opts.by || null })
        if (r.enrolled) enrolledCount.set(funnel.name, (enrolledCount.get(funnel.name) || 0) + 1)
      }
    }
  }
  result.enrolled = [...enrolledCount].map(([funnel, count]) => ({ funnel, count }))
  result.stopped = [...stoppedCount].map(([funnel, count]) => ({ funnel, count }))
  return result
}

/** Take tags off people. No automation fires on removal. */
export async function removeTags(admin: SupabaseClient, who: TagRecipients, tagIds: string[]): Promise<number> {
  const ids = tagIds.filter(isUuid)
  const leadIds = (who.leadIds || []).filter(isUuid)
  const profileIds = (who.profileIds || []).filter(isUuid)
  if (ids.length === 0) return 0
  let removed = 0
  if (leadIds.length > 0) {
    const { data, error } = await admin.from('email_contact_tags').delete().in('tag_id', ids).in('lead_id', leadIds).select('id')
    if (error) throw new Error(error.message)
    removed += (data || []).length
  }
  if (profileIds.length > 0) {
    const { data, error } = await admin.from('email_contact_tags').delete().in('tag_id', ids).in('profile_id', profileIds).select('id')
    if (error) throw new Error(error.message)
    removed += (data || []).length
  }
  return removed
}

/** Cancel one person's live enrollment in one funnel. Returns rows cancelled. */
async function cancelEnrollmentInFunnel(
  admin: SupabaseClient,
  funnelId: string,
  recipient: EnrollRecipient,
  reason: string
): Promise<number> {
  const column = recipient.profileId ? 'lead_id' : 'contact_id'
  const recipientId = (recipient.profileId || recipient.leadId) as string
  const nowIso = new Date().toISOString()
  const { data } = await admin
    .from('email_funnel_enrollments')
    .update({ status: 'cancelled', cancelled_at: nowIso, cancel_reason: reason, next_email_scheduled_at: null, updated_at: nowIso })
    .eq('funnel_id', funnelId)
    .eq(column, recipientId)
    .in('status', ['active', 'paused', 'pending_approval'])
    .select('id')
  return (data || []).length
}

/**
 * Called by the delivery cron when someone finishes a funnel: applies the
 * funnel's completion tags, which may in turn start the next funnel.
 */
export async function applyCompletionTags(
  admin: SupabaseClient,
  funnelId: string,
  recipient: EnrollRecipient
): Promise<TagChangeResult | null> {
  const { data, error } = await admin.from('email_funnels').select('complete_tag_ids').eq('id', funnelId).maybeSingle()
  if (error || !data) return null
  const tagIds = (data.complete_tag_ids as string[] | null) || []
  if (tagIds.length === 0) return null
  const who: TagRecipients = recipient.profileId ? { profileIds: [recipient.profileId] } : { leadIds: [recipient.leadId as string] }
  return addTags(admin, who, tagIds, { via: 'funnel' })
}

// Re-exported so API routes can cancel across funnels without importing both libs
export { cancelEnrollments }
