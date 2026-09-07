/**
 * Audiences ("user types") group funnels on the Funnels page: students,
 * student sign-ups, teachers, mentorship applicants, plus any custom type a
 * teacher creates. Rows live in `email_audiences`; `email_funnels.audience_id`
 * points at one (migration 20260907000002_email_audiences.sql).
 */

export interface EmailAudience {
  id: string
  key: string | null
  name: string
  description: string | null
  sort_order: number
  is_deleted?: boolean
  created_at?: string
  updated_at?: string
}

/** Built-in audiences, in display order. Keys match the migration seeds. */
export const DEFAULT_AUDIENCES: { key: string; name: string; description: string; sort_order: number }[] = [
  { key: 'students', name: 'Students', description: 'Singers with an account in the app.', sort_order: 10 },
  { key: 'student_leads', name: 'Student Sign-ups', description: 'Singers who left an email on the website but have no account yet.', sort_order: 20 },
  { key: 'teachers', name: 'Teachers & Studios', description: 'Vocal coaches and studio owners: demo requests and playbook leads.', sort_order: 30 },
  { key: 'mentorship', name: 'Mentorship Applicants', description: 'People who submitted a Voice Application for 1:1 mentorship.', sort_order: 40 },
]

const TRIGGER_TO_AUDIENCE: Record<string, string> = {
  student_signup: 'students',
  student_lead: 'student_leads',
  teacher_demo: 'teachers',
  teacher_lead: 'teachers',
  mentorship_application: 'mentorship',
}

/** Which built-in audience a trigger-based funnel belongs to, or null. */
export function audienceKeyForTrigger(triggerKey: string | null | undefined): string | null {
  return triggerKey ? TRIGGER_TO_AUDIENCE[triggerKey] || null : null
}

/**
 * Resolve the audience for a funnel: an explicit audience_id wins; a funnel
 * with a trigger but no audience falls back to the built-in one for that
 * trigger so campaign funnels file themselves correctly before anyone edits them.
 */
export function resolveAudienceId(
  funnel: { audience_id?: string | null; trigger_key?: string | null },
  audiences: EmailAudience[]
): string | null {
  if (funnel.audience_id) return funnel.audience_id
  const key = audienceKeyForTrigger(funnel.trigger_key)
  if (!key) return null
  return audiences.find(a => a.key === key)?.id || null
}
