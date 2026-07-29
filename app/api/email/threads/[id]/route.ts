import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/threads/[id] - Get thread with emails for preview
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: threadId } = await params
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

    const admin = getSupabaseAdmin()

    // Get the thread with account info
    const { data: thread, error: threadError } = await admin
      .from('email_threads')
      .select(`
        *,
        email_account:email_accounts(id, email_address, display_name, user_id)
      `)
      .eq('id', threadId)
      .single()

    if (threadError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Verify user owns this thread's account
    if (!thread.email_account || thread.email_account.user_id !== userData.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get all emails in the thread
    const { data: emails } = await admin
      .from('emails')
      .select(`
        *,
        attachments:email_attachments(*)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    // Check if thread was unread before marking as read
    const wasUnread = !thread.is_read

    // Mark thread and emails as read
    if (wasUnread) {
      await admin
        .from('email_threads')
        .update({ is_read: true })
        .eq('id', threadId)
    }

    if (emails && emails.length > 0) {
      const unreadEmailIds = emails.filter(e => !e.is_read).map(e => e.id)
      if (unreadEmailIds.length > 0) {
        await admin
          .from('emails')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in('id', unreadEmailIds)
      }
    }

    return NextResponse.json({
      thread: { ...thread, is_read: true }, // Return as read since we just marked it
      emails: emails || [],
      wasUnread, // Flag to indicate if this thread was just marked as read
    })
  } catch (error) {
    console.error('Error fetching thread:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email/threads/[id] - Permanently delete a thread and all its emails
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: threadId } = await params
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

    const admin = getSupabaseAdmin()

    // Verify the thread belongs to one of the user's email accounts
    const { data: thread } = await admin
      .from('email_threads')
      .select('id, email_account_id, email_accounts!inner(user_id)')
      .eq('id', threadId)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Check ownership
    const threadData = thread as any
    if (threadData.email_accounts?.user_id !== userData.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get all email IDs in this thread
    const { data: emails } = await admin
      .from('emails')
      .select('id')
      .eq('thread_id', threadId)

    const emailIds = emails?.map(e => e.id) || []

    console.log(`Permanently deleting thread ${threadId} with ${emailIds.length} emails`)

    // Delete in order of dependencies
    if (emailIds.length > 0) {
      // Delete email attachments
      const { count: attachmentCount } = await admin
        .from('email_attachments')
        .delete({ count: 'exact' })
        .in('email_id', emailIds)
      console.log('Email attachments deleted:', attachmentCount)

      // Delete email lead links
      const { count: linkCount } = await admin
        .from('email_lead_links')
        .delete({ count: 'exact' })
        .in('email_id', emailIds)
      console.log('Email lead links deleted:', linkCount)

      // Delete tasks linked to emails
      const { count: taskCount } = await admin
        .from('tasks')
        .delete({ count: 'exact' })
        .in('email_id', emailIds)
      console.log('Tasks deleted:', taskCount)

      // Delete activity logs for emails
      const { count: activityCount } = await admin
        .from('activity_log')
        .delete({ count: 'exact' })
        .in('email_id', emailIds)
      console.log('Activity logs deleted:', activityCount)

      // Delete the emails
      const { count: emailCount } = await admin
        .from('emails')
        .delete({ count: 'exact' })
        .in('id', emailIds)
      console.log('Emails deleted:', emailCount)
    }

    // Delete the thread
    const { error: threadError } = await admin
      .from('email_threads')
      .delete()
      .eq('id', threadId)

    if (threadError) {
      console.error('Error deleting thread:', threadError)
      return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 })
    }

    console.log('Thread permanently deleted:', threadId)

    return NextResponse.json({
      success: true,
      deleted: {
        threadId,
        emailCount: emailIds.length
      }
    })
  } catch (error) {
    console.error('Error permanently deleting thread:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
