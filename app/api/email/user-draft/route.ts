import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/user-draft - List user's drafts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const draftId = searchParams.get('id')

    const admin = getSupabaseAdmin()

    if (draftId) {
      // Get single draft
      const { data: draft, error } = await admin
        .from('user_email_drafts')
        .select('*')
        .eq('id', draftId)
        .eq('user_id', user.id)
        .single()

      if (error || !draft) {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
      }

      return NextResponse.json(draft)
    }

    // List all drafts
    const { data: drafts, error } = await admin
      .from('user_email_drafts')
      .select(`
        *,
        email_account:email_accounts(id, email_address, display_name)
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching drafts:', error)
      return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 })
    }

    return NextResponse.json(drafts || [])
  } catch (error) {
    console.error('Error in GET /api/email/user-draft:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/email/user-draft - Create or update a draft
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      email_account_id,
      thread_id,
      reply_to_email_id,
      to_emails,
      cc_emails,
      bcc_emails,
      subject,
      body_html,
      attachments,
      compose_mode,
    } = body

    const admin = getSupabaseAdmin()

    if (id) {
      // Update existing draft
      const { data: existing } = await admin
        .from('user_email_drafts')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (!existing) {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
      }

      const { data: draft, error } = await admin
        .from('user_email_drafts')
        .update({
          email_account_id,
          thread_id,
          reply_to_email_id,
          to_emails: to_emails || [],
          cc_emails: cc_emails || [],
          bcc_emails: bcc_emails || [],
          subject,
          body_html,
          attachments: attachments || [],
          compose_mode: compose_mode || 'new',
          last_saved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating draft:', error)
        return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
      }

      return NextResponse.json(draft)
    } else {
      // Create new draft
      const { data: draft, error } = await admin
        .from('user_email_drafts')
        .insert({
          user_id: user.id,
          email_account_id,
          thread_id,
          reply_to_email_id,
          to_emails: to_emails || [],
          cc_emails: cc_emails || [],
          bcc_emails: bcc_emails || [],
          subject,
          body_html,
          attachments: attachments || [],
          compose_mode: compose_mode || 'new',
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating draft:', error)
        return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
      }

      return NextResponse.json(draft)
    }
  } catch (error) {
    console.error('Error in POST /api/email/user-draft:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email/user-draft - Delete a draft
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const draftId = searchParams.get('id')

    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    const { error } = await admin
      .from('user_email_drafts')
      .delete()
      .eq('id', draftId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting draft:', error)
      return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/email/user-draft:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
