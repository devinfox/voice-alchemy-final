import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * List people with email addresses for template sending.
 * GET /api/students/list-for-email?hasEmail=true&role=student
 * GET /api/students/list-for-email?audience=leads
 *
 * `role` filters profiles.role (e.g. student); omit it for everyone.
 * profiles has no email column — emails come from the `users` mirror table
 * and are joined in code. `audience=leads` returns website leads
 * (email_leads: people who left an email but have no account) instead,
 * each flagged with `kind: 'lead'`.
 */
export async function GET(request: NextRequest) {
  try {
    // Only email-tools users (admins / Julia) may list recipients
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const hasEmailOnly = searchParams.get('hasEmail') === 'true'
    const roleFilter = searchParams.get('role')
    const audience = searchParams.get('audience')

    const admin = getSupabaseAdmin()

    if (audience === 'leads') {
      const { data: leads, error: leadsError } = await admin
        .from('email_leads')
        .select('id, first_name, last_name, email, persona, source, last_type, is_unsubscribed, created_at')
        .eq('is_unsubscribed', false)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (leadsError) {
        return NextResponse.json({ error: leadsError.message }, { status: 500 })
      }
      return NextResponse.json({
        data: (leads || []).map(l => ({
          id: l.id,
          first_name: l.first_name,
          last_name: l.last_name,
          name: null,
          role: l.persona === 'coach' ? 'coach lead' : 'lead',
          email: l.email,
          kind: 'lead' as const,
          source: l.source,
          last_type: l.last_type,
        })),
      })
    }
    let query = admin
      .from('profiles')
      .select('id, first_name, last_name, name, role')
      .order('first_name', { ascending: true })
      .limit(1000)
    if (roleFilter) query = query.eq('role', roleFilter)

    const { data: profiles, error: profileError } = await query

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Join in each person's real email from the users table
    const ids = (profiles || []).map(p => p.id)
    const emailById = new Map<string, string>()
    if (ids.length > 0) {
      const { data: userRows, error: usersError } = await admin
        .from('users')
        .select('id, email')
        .in('id', ids)

      if (usersError) {
        return NextResponse.json({ error: usersError.message }, { status: 500 })
      }

      for (const row of userRows || []) {
        if (row.email) emailById.set(row.id, row.email)
      }
    }

    let result = (profiles || []).map(p => ({
      ...p,
      email: emailById.get(p.id) || null,
    }))

    if (hasEmailOnly) {
      result = result.filter(p => !!p.email)
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[students/list-for-email]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
