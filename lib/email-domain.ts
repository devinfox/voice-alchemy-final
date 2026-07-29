import { getSupabaseAdmin } from './supabase-admin'

export interface OrgEmailDomain {
  id: string
  domain: string
  verification_status: string
}

/**
 * Resolve the email domain that a user's organization should use when creating
 * email accounts (e.g. the "Create Your Email Address" setup screen).
 *
 * This is strictly org-scoped: an organization only ever sees its OWN domain,
 * never a hardcoded shared/demo domain. Voice Alchemy Academy users get voicealchemyacademy.com,
 * Meridian users get meridiangoldgroup.com, etc. — no cross-org mix-ups.
 *
 * When an org has more than one verified domain, the one already used by the
 * most existing accounts wins (the org's real primary domain).
 */
export async function getOrgEmailDomain(
  organizationId: string | null | undefined
): Promise<OrgEmailDomain | null> {
  if (!organizationId) return null

  const admin = getSupabaseAdmin()

  const { data: domains } = await admin
    .from('email_domains')
    .select('id, domain, verification_status')
    .eq('organization_id', organizationId)
    .eq('is_deleted', false)
    .eq('verification_status', 'verified')

  if (!domains || domains.length === 0) return null
  if (domains.length === 1) return domains[0]

  // Multiple verified domains in this org: prefer the one most-used by the
  // org's existing accounts so we surface the canonical company domain.
  const { data: accounts } = await admin
    .from('email_accounts')
    .select('domain_id')
    .eq('organization_id', organizationId)
    .eq('is_deleted', false)

  const usage = new Map<string, number>()
  for (const a of accounts || []) {
    usage.set(a.domain_id, (usage.get(a.domain_id) || 0) + 1)
  }

  return [...domains].sort(
    (a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0)
  )[0]
}
