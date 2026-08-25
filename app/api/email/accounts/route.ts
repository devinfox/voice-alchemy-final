import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { canAccessEmailTools } from '@/lib/email-access'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getAuthUser } from '@/lib/supabase-server'

// GET /api/email/accounts - List all email accounts for current user
export async function GET(request: NextRequest) {
  try {
    // Only email-tools users (admins / Julia) use the email system; plain
    // students have no business listing or creating email accounts.
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const supabase = await createServerClient()

    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select(`
        *,
        domain:email_domains(id, domain, verification_status)
      `)
      .eq('user_id', profile.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching accounts:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error) {
    console.error('Accounts GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/email/accounts - Create a new email account
export async function POST(request: NextRequest) {
  try {
    // Only email-tools users (admins / Julia) may create email accounts
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const userDisplayName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User'

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

    // Resolve the requested domain
    const { data: domain } = await getSupabaseAdmin()
      .from('email_domains')
      .select('id, domain, verification_status, created_by')
      .eq('id', domain_id)
      .eq('is_deleted', false)
      .maybeSingle()

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Domain-spoofing guard (audit finding): an account may only be created
    // on a domain the caller created themselves, or by an email-tools admin
    // managing academy domains. requireEmailAccess() above already restricts
    // this route to email-tools admins, which satisfies the second branch;
    // the explicit ownership check stays so the invariant holds even if the
    // route-level gate is ever relaxed.
    const authUser = await getAuthUser()
    const ownsDomain = domain.created_by === profile.id
    if (!ownsDomain && !canAccessEmailTools(profile, authUser?.email)) {
      return NextResponse.json(
        { error: 'You do not have permission to create accounts on this domain' },
        { status: 403 }
      )
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
        .eq('user_id', profile.id)
        .eq('is_primary', true)
    }

    // Check if this is the first account (make it default)
    const { count } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('is_deleted', false)

    const shouldBeDefault = is_primary || count === 0

    // Create the email account
    const { data: newAccount, error: insertError } = await getSupabaseAdmin()
      .from('email_accounts')
      .insert({
        domain_id,
        user_id: profile.id,
        email_address: fullEmailAddress,
        display_name: display_name || userDisplayName || email_address,
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
