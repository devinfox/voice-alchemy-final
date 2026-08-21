import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// POST /api/email/send/[id]/cancel - Cancel a queued email before it's sent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: emailId } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // Get the email and verify ownership
    const { data: email, error: emailError } = await admin
      .from('emails')
      .select(`
        *,
        email_account:email_accounts(id, user_id)
      `)
      .eq('id', emailId)
      .single()

    if (emailError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    // Verify ownership
    if (email.email_account?.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check if email can still be undone
    if (!email.can_undo_until) {
      return NextResponse.json({ error: 'Email cannot be undone' }, { status: 400 })
    }

    const canUndoUntil = new Date(email.can_undo_until)
    if (canUndoUntil < new Date()) {
      return NextResponse.json({ error: 'Undo window has expired' }, { status: 400 })
    }

    // Check email status - can only undo if queued
    if (email.status !== 'queued') {
      return NextResponse.json({
        error: `Cannot undo email with status: ${email.status}`
      }, { status: 400 })
    }

    // Delete the email
    const { error: deleteError } = await admin
      .from('emails')
      .delete()
      .eq('id', emailId)

    if (deleteError) {
      console.error('Error deleting email:', deleteError)
      return NextResponse.json({ error: 'Failed to cancel email' }, { status: 500 })
    }

    // Check if thread should be deleted too (if this was the only email)
    if (email.thread_id) {
      const { count } = await admin
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', email.thread_id)

      if (count === 0) {
        // Delete the empty thread
        await admin
          .from('email_threads')
          .delete()
          .eq('id', email.thread_id)
      } else {
        // Update thread stats
        await admin.rpc('update_thread_stats', { p_thread_id: email.thread_id })
      }
    }

    console.log(`Email ${emailId} cancelled by user ${user.id}`)

    return NextResponse.json({ success: true, cancelled: true })
  } catch (error) {
    console.error('Error cancelling email:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
