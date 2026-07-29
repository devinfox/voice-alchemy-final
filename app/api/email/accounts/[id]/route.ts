import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/accounts/[id] - Get a single email account
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { data: account, error } = await supabase
      .from('email_accounts')
      .select(`
        *,
        domain:email_domains(id, domain, verification_status)
      `)
      .eq('id', id)
      .eq('user_id', userData.id)
      .eq('is_deleted', false)
      .single()

    if (error || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({ account })
  } catch (error) {
    console.error('Account GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/email/accounts/[id] - Update an email account
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Verify the account belongs to the user
    const { data: account } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userData.id)
      .eq('is_deleted', false)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const body = await request.json()
    const { display_name, signature, is_primary, is_active } = body

    // If setting as default, unset other defaults first
    if (is_primary === true) {
      await getSupabaseAdmin()
        .from('email_accounts')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('user_id', userData.id)
        .eq('is_primary', true)
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (display_name !== undefined) updateData.display_name = display_name
    if (signature !== undefined) updateData.signature = signature
    if (is_primary !== undefined) updateData.is_primary = is_primary
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: updatedAccount, error: updateError } = await getSupabaseAdmin()
      .from('email_accounts')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        domain:email_domains(id, domain, verification_status)
      `)
      .single()

    if (updateError) {
      console.error('Error updating account:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      account: updatedAccount
    })
  } catch (error) {
    console.error('Account PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email/accounts/[id] - Soft delete an email account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Verify the account belongs to the user
    const { data: account } = await supabase
      .from('email_accounts')
      .select('id, is_primary')
      .eq('id', id)
      .eq('user_id', userData.id)
      .eq('is_deleted', false)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Soft delete the account
    const { error: deleteError } = await getSupabaseAdmin()
      .from('email_accounts')
      .update({
        is_deleted: true,
        is_active: false,
        is_primary: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting account:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // If this was the default account, set another as default
    if (account.is_primary) {
      const { data: remainingAccounts } = await getSupabaseAdmin()
        .from('email_accounts')
        .select('id')
        .eq('user_id', userData.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(1)

      if (remainingAccounts && remainingAccounts.length > 0) {
        await getSupabaseAdmin()
          .from('email_accounts')
          .update({ is_primary: true, updated_at: new Date().toISOString() })
          .eq('id', remainingAccounts[0].id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Account DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
