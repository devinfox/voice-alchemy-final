import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * List users (students/teachers) with email addresses for template sending.
 * GET /api/students/list-for-email?hasEmail=true
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('users')
      .select('id, first_name, last_name, email, role')
      .eq('is_deleted', false)
      .not('email', 'is', null)
      .order('first_name', { ascending: true })
      .limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err) {
    console.error('[students/list-for-email]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
