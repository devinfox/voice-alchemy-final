import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listByeTalkFilesForEmail } from '@/lib/email/byetalk-file-utils'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: crmUser } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''
    const limit = Number(searchParams.get('limit') || '120')

    const files = await listByeTalkFilesForEmail({
      organizationId: crmUser.organization_id || null,
      query: q,
      limit,
    })

    return NextResponse.json({ files })
  } catch (error) {
    console.error('[byetalk-files] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })
  }
}
