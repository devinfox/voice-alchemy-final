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

    // Get the user by email
    const { data: userList, error: listError } = await adminClient.auth.admin.listUsers()
    if (listError) {
      console.error('[Dev Login] Error listing users:', listError)
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const targetUser = userList.users.find(u => u.email === targetEmail)
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found in auth' }, { status: 404 })
    }

    // Set a temporary dev password for this user
    const devPassword = `dev-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUser.id,
      { password: devPassword }
    )

    if (updateError) {
      console.error('[Dev Login] Error setting dev password:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Return credentials for client-side sign-in
    return NextResponse.json({
      success: true,
      email: targetEmail,
      password: devPassword,
      // Flag to indicate client should use signInWithPassword
      usePasswordAuth: true
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
