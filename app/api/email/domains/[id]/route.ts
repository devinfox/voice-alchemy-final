import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/domains/[id] - Get a single domain
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

    const { data: domain, error } = await supabase
      .from('email_domains')
      .select('*')
      .eq('id', id)
      .eq('created_by', userData.id)
      .eq('is_deleted', false)
      .single()

    if (error || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Domain GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email/domains/[id] - Soft delete a domain
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

    // Verify the domain belongs to the user
    const { data: domain } = await supabase
      .from('email_domains')
      .select('id, sendgrid_domain_id')
      .eq('id', id)
      .eq('created_by', userData.id)
      .eq('is_deleted', false)
      .single()

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Soft delete associated email accounts
    await getSupabaseAdmin()
      .from('email_accounts')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('domain_id', id)

    // Soft delete the domain
    const { error: deleteError } = await getSupabaseAdmin()
      .from('email_domains')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting domain:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Note: We don't delete from SendGrid as they may want to re-add later
    // SendGrid will handle cleanup automatically

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Domain DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
