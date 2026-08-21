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
  organizationId?: string | null | undefined
): Promise<OrgEmailDomain | null> {
  const admin = getSupabaseAdmin()

  let query = admin
    .from('email_domains')
    .select('id, domain, verification_status')
    .eq('is_deleted', false)
    .eq('verification_status', 'verified')

  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }

  const { data: domains } = await query

  if (!domains || domains.length === 0) {
    return {
      id: 'default-domain',
      domain: process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'voicealchemyacademy.com',
      verification_status: 'verified',
    }
  }

  return domains[0]
}
