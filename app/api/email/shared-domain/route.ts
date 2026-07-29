import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getOrgEmailDomain } from '@/lib/email-domain'

// GET /api/email/shared-domain - Get the domain the user's organization should
// create email accounts on. Strictly org-scoped: a user only ever sees their
// own organization's verified domain (e.g. Citadel Gold -> citadelgold.com),
// never another company's domain.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the caller's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('auth_id', user.id)
      .single()

    const domain = await getOrgEmailDomain(userData?.organization_id)

    if (!domain) {
      return NextResponse.json({ error: 'No verified domain configured for your organization' }, { status: 404 })
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Shared domain GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
