import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * List users (students/teachers) with email addresses for template sending.
 * GET /api/students/list-for-email?hasEmail=true
 *
 * profiles has no email column — emails come from the `users` mirror table
 * and are joined in code.
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

    const admin = getSupabaseAdmin()
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, first_name, last_name, name, role')
      .order('first_name', { ascending: true })
      .limit(500)

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
