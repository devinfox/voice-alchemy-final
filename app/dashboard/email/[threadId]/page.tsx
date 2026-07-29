import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { ThreadView } from './thread-view'
import { processEmailForAI } from '@/lib/email-ai'
import { syncCalendarInvitesForEmail, getEmailInvites, type EmailInvite } from '@/lib/calendar/sync-email-invites'

interface ThreadPageProps {
  params: Promise<{ threadId: string }>
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  const { threadId } = await params
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get the thread with all emails (use admin to bypass RLS)
  const { data: thread, error: threadError } = await supabaseAdmin
    .from('email_threads')
    .select(`
      *,
      email_account:email_accounts(id, email_address, display_name, user_id)
    `)
    .eq('id', threadId)
    .single()

  if (threadError || !thread) {
    console.error('Thread error:', threadError)
    notFound()
  }

  // Verify user owns this thread's account
  if (!thread.email_account || thread.email_account.user_id !== user.id) {
    notFound()
  }

  // Get all emails in the thread
  const { data: emails } = await supabaseAdmin
    .from('emails')
    .select(`
      *,
      attachments:email_attachments(*)
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  // An attachment that might be a calendar invite (by type/ext, or a small
  // ambiguous octet-stream/.bin that could be a mislabeled invite).
  const hasCalendarAttachment = (email: any): boolean =>
    Array.isArray(email.attachments) &&
    email.attachments.some((att: any) => {
      const type = (att?.content_type || '').toLowerCase()
      const name = (att?.filename || '').toLowerCase()
      const size = att?.size_bytes ?? 0
      if (type.includes('text/calendar') || type.includes('application/ics')) return true
      if (/\.(ics|ical|ifb|vcs|calendar)$/i.test(name)) return true
      const ambiguous = type === '' || type.includes('octet-stream') || /\.bin$/i.test(name)
      return ambiguous && size > 0 && size <= 512 * 1024
    })

  // Fallback: when a thread is opened, process any inbound emails that never ran AI processing.
  if (emails && emails.length > 0) {
    const unprocessedInbound = emails.filter((email: any) => email.is_inbound && !email.ai_processed_at)
    for (const email of unprocessedInbound) {
      const toAddresses = Array.isArray(email.to_addresses)
        ? email.to_addresses
            .map((recipient: any) => (typeof recipient === 'string' ? recipient : recipient?.email))
            .filter((value: unknown): value is string => typeof value === 'string' && value.length > 3)
        : []

      try {
        await processEmailForAI(
          email.id,
          email.from_address || '',
          email.from_name || null,
          toAddresses,
          email.subject || '',
          email.body_text || null,
          email.body_html || null,
          true,
          user.id
        )
      } catch (error) {
        console.error('[Thread Open] Failed to process inbound email:', email.id, error)
      }
    }

    // Tie calendar invites to the byetalk calendar for every inbound email that
    // carries one — including emails received before this feature shipped (their
    // AI processing already ran, so they're skipped above). Idempotent: events
    // dedup by iCal UID, so re-running on each thread open is safe.
    const inboundWithInvites = emails.filter((email: any) => email.is_inbound && hasCalendarAttachment(email))
    for (const email of inboundWithInvites) {
      try {
        await syncCalendarInvitesForEmail({
          emailId: email.id,
          assignedTo: user.id,
          organizationId: thread.organization_id ?? null,
          leadId: null,
          contactId: null,
          bodyText: email.body_text || null,
          bodyHtml: email.body_html || null,
        })
      } catch (error) {
        console.error('[Thread Open] Failed to sync calendar invite:', email.id, error)
      }
    }
  }

  // Mark thread and emails as read
  await supabaseAdmin
    .from('email_threads')
    .update({ is_read: true })
    .eq('id', threadId)

  if (emails && emails.length > 0) {
    const unreadEmailIds = emails.filter(e => !e.is_read).map(e => e.id)
    if (unreadEmailIds.length > 0) {
      await supabaseAdmin
        .from('emails')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadEmailIds)
    }
  }

  // Get user's email accounts for reply (use admin to bypass RLS for domain join)
  const { data: accounts } = await supabaseAdmin
    .from('email_accounts')
    .select(`
      *,
      domain:email_domains(id, domain, verification_status)
    `)
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })

  // Parse each email's calendar attachment into an invite so the thread can
  // render it as a proper invite card (like Gmail/Outlook) instead of a raw
  // .ics download. Driven straight off the email's attachment, so it shows on
  // whichever message carries the invite — no dependency on the calendar task.
  const invitesByEmail: Record<string, EmailInvite> = {}
  const inboundWithInvites = (emails || []).filter((e: any) => hasCalendarAttachment(e))
  await Promise.all(
    inboundWithInvites.map(async (email: any) => {
      try {
        const invites = await getEmailInvites(email.id, email.body_text || null, email.body_html || null)
        if (invites.length > 0) invitesByEmail[email.id] = invites[0]
      } catch (error) {
        console.error('[Thread Open] Failed to parse calendar invite:', email.id, error)
      }
    }),
  )

  return (
    <ThreadView
      thread={thread}
      emails={emails || []}
      accounts={accounts || []}
      invitesByEmail={invitesByEmail}
    />
  )
}
