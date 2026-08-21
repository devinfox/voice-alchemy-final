import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getOrgEmailDomain } from '@/lib/email-domain'

// GET /api/email/shared-domain - Get the verified email domain for the organization
// (e.g. voicealchemyacademy.com).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    const domain = await getOrgEmailDomain(null)

    if (!domain) {
      return NextResponse.json({ error: 'No verified domain configured for your organization' }, { status: 404 })
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Shared domain GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
