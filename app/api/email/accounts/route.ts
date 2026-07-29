import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/accounts - List all email accounts for current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from users table
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select(`
        *,
        domain:email_domains(id, domain, verification_status)
      `)
      .eq('user_id', userData.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching accounts:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Accounts GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/email/accounts - Create a new email account
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from users table
    let userData: { id: string; first_name: string | null; last_name: string | null; organization_id: string | null } | null = null

    const { data: existingUser } = await supabase
      .from('users')
      .select('id, first_name, last_name, organization_id')
      .eq('auth_id', user.id)
      .single()

    userData = existingUser

    // Auto-create user record if it doesn't exist
    if (!userData) {
      // Parse name from metadata
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || ''
      const nameParts = fullName.split(' ')
      const firstName = nameParts[0] || user.email?.split('@')[0] || 'User'
      const lastName = nameParts.slice(1).join(' ') || ''

      const { data: newUser, error: createError } = await getSupabaseAdmin()
        .from('users')
        .insert({
          auth_id: user.id,
          email: user.email,
          first_name: firstName,
          last_name: lastName,
          role: 'sales_rep',
          is_active: true
        })
        .select('id, first_name, last_name, organization_id')
        .single()

      if (createError) {
        console.error('Error creating user:', createError)
        return NextResponse.json({ error: 'Failed to create user profile: ' + createError.message }, { status: 500 })
      }

      userData = newUser
    }

    // Helper to get display name
    const getUserDisplayName = () => {
      return `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim()
    }

    const body = await request.json()
    const { domain_id, email_address, display_name, is_primary } = body

    if (!domain_id || !email_address) {
      return NextResponse.json(
        { error: 'Domain ID and email address are required' },
        { status: 400 }
      )
    }

    // Validate email address format (local part only)
    const localPartRegex = /^[a-zA-Z0-9._%+-]+$/
    if (!localPartRegex.test(email_address)) {
      return NextResponse.json(
        { error: 'Invalid email address format. Use only letters, numbers, and ._%+-' },
        { status: 400 }
      )
    }

    // Resolve the requested domain, strictly scoped to the user. A user may
    // only create accounts on a domain that belongs to THEIR organization, or
    // a domain they created themselves. This prevents cross-org mix-ups (e.g.
    // a Citadel Gold user can never land on another company's domain).
    let domain = null

    // Domain belonging to the user's organization
    if (userData.organization_id) {
      const { data: orgDomain } = await getSupabaseAdmin()
        .from('email_domains')
        .select('id, domain, verification_status')
        .eq('id', domain_id)
        .eq('organization_id', userData.organization_id)
        .eq('is_deleted', false)
        .single()

      domain = orgDomain
    }

    // Fall back to a domain the user created themselves
    if (!domain) {
      const { data: userDomain } = await supabase
        .from('email_domains')
        .select('id, domain, verification_status')
        .eq('id', domain_id)
        .eq('created_by', userData.id)
        .eq('is_deleted', false)
        .single()

      domain = userDomain
    }

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Domain doesn't need to be verified to create accounts, but note the status
    const fullEmailAddress = `${email_address.toLowerCase()}@${domain.domain}`

    // Check if email already exists
    const { data: existingAccount } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('id')
      .eq('email_address', fullEmailAddress)
      .eq('is_deleted', false)
      .single()

    if (existingAccount) {
      return NextResponse.json(
        { error: 'Email address already exists' },
        { status: 400 }
      )
    }

    // If setting as default, unset other defaults first
    if (is_primary) {
      await getSupabaseAdmin()
        .from('email_accounts')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('user_id', userData.id)
        .eq('is_primary', true)
    }

    // Check if this is the first account (make it default)
    const { count } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userData.id)
      .eq('is_deleted', false)

    const shouldBeDefault = is_primary || count === 0

    // Create the email account
    const { data: newAccount, error: insertError } = await getSupabaseAdmin()
      .from('email_accounts')
      .insert({
        domain_id,
        user_id: userData.id,
        organization_id: userData.organization_id,
        email_address: fullEmailAddress,
        display_name: display_name || getUserDisplayName() || email_address,
        is_primary: shouldBeDefault,
        is_active: true,
      })
      .select(`
        *,
        domain:email_domains(id, domain, verification_status)
      `)
      .single()

    if (insertError) {
      console.error('Error creating account:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      account: newAccount,
      warning: domain.verification_status !== 'verified'
        ? 'Note: Your domain is not yet verified. Emails cannot be sent until DNS verification is complete.'
        : null
    })
  } catch (error) {
    console.error('Accounts POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
