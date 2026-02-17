import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// DEV ONLY - This endpoint should NEVER be enabled in production
// It allows bypassing authentication for testing purposes

export async function POST(request: NextRequest) {
  // CRITICAL: Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { email, searchName } = body

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    let targetEmail = email

    // If no email provided, search by name
    if (!targetEmail && searchName) {
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, name, first_name, last_name')
        .or(`name.ilike.%${searchName}%,first_name.ilike.%${searchName}%`)
        .limit(1)

      if (profiles && profiles.length > 0) {
        // Get the user's email from auth.users
        const { data: authUser } = await adminClient.auth.admin.getUserById(profiles[0].id)
        if (authUser?.user?.email) {
          targetEmail = authUser.user.email
        }
      }
    }

    if (!targetEmail) {
      // List available teachers/users for convenience
      const { data: teachers } = await adminClient
        .from('profiles')
        .select('id, name, first_name, last_name, role')
        .in('role', ['teacher', 'instructor', 'admin'])
        .limit(10)

      return NextResponse.json({
        error: 'User not found',
        hint: 'Provide email or searchName',
        availableTeachers: teachers?.map(t => ({
          id: t.id,
          name: t.name || `${t.first_name || ''} ${t.last_name || ''}`.trim(),
          role: t.role
        }))
      }, { status: 404 })
    }

    // Generate a magic link for the user
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`
      }
    })

    if (error) {
      console.error('[Dev Login] Error generating link:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Extract the token from the link
    const linkUrl = new URL(data.properties.action_link)
    const token_hash = linkUrl.searchParams.get('token_hash')
    const type = linkUrl.searchParams.get('type')

    return NextResponse.json({
      success: true,
      email: targetEmail,
      // Return the verification URL that will set the session
      verifyUrl: `/auth/callback?token_hash=${token_hash}&type=${type}&next=/dashboard`
    })

  } catch (error) {
    console.error('[Dev Login] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET - List available test users
export async function GET() {
  // CRITICAL: Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 })
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get teachers and some students
    const { data: users } = await adminClient
      .from('profiles')
      .select('id, name, first_name, last_name, role')
      .in('role', ['teacher', 'instructor', 'admin', 'student'])
      .order('role')
      .limit(20)

    // Get emails for these users
    const usersWithEmail = await Promise.all(
      (users || []).map(async (user) => {
        const { data: authUser } = await adminClient.auth.admin.getUserById(user.id)
        return {
          id: user.id,
          name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown',
          role: user.role,
          email: authUser?.user?.email || null
        }
      })
    )

    return NextResponse.json({
      users: usersWithEmail.filter(u => u.email) // Only return users with emails
    })

  } catch (error) {
    console.error('[Dev Login] Error listing users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
