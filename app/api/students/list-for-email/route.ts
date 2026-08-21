import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * List users (students/teachers) with email addresses for template sending.
 * GET /api/students/list-for-email?hasEmail=true
 */
export async function GET(_request: NextRequest) {
  try {
    const profile = await getCurrentUser()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isTeacher = profile.role === 'teacher' || profile.role === 'instructor' || profile.role === 'admin'
    if (!isTeacher) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = getSupabaseAdmin()
    // First try profiles joined with auth, or profiles directly
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, first_name, last_name, name, role')
      .order('first_name', { ascending: true })
      .limit(500)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({ data: profiles || [] })
  } catch (err) {
    console.error('[students/list-for-email]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
