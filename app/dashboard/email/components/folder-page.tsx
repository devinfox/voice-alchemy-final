import { getCurrentUser, getAuthUser, createClient } from '@/lib/supabase-server'
import { stripHtml } from '@/lib/email-utils'
import { redirect } from 'next/navigation'
import { EmailList } from './email-list'
import { NoAccountsSetup } from './no-accounts-setup'

const PAGE_SIZE = 20

interface FolderPageProps {
  folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'
  title: string
  emptyMessage: string
  isStarred?: boolean
  currentPage?: number
}

export async function FolderPage({ folder, title, emptyMessage, isStarred, currentPage = 1 }: FolderPageProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get user's email accounts
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('id, email_address, display_name')
    .eq('user_id', user.id)
    .eq('is_deleted', false)

  if (!accounts || accounts.length === 0) {
    return <NoAccountsSetup />
  }

  const accountIds = accounts.map((a: any) => a.id)

  // Composer drafts live in `user_email_drafts`, keyed by AUTH user id (the API
  // route writes them from supabase.auth.getUser()), while email_accounts.user_id
  // is the `users` profile id — two different id spaces, so both lookups are needed.
  //
  // Nothing used to list this table, so anything composed and closed without
  // sending disappeared from the UI entirely. Drafts now shows them, and clicking
  // one reopens the composer (see is_composer_draft in EmailList).
  let composerDrafts: any[] = []
  if (folder === 'drafts') {
    const authUser = await getAuthUser()
    if (authUser) {
      const { data: rawDrafts } = await supabase
        .from('user_email_drafts')
        .select('*')
        .eq('user_id', authUser.id)
        .in('email_account_id', accountIds)
        .order('updated_at', { ascending: false })

      composerDrafts = (rawDrafts || []).map((d: any) => {
        const account = accounts.find((a: any) => a.id === d.email_account_id)
        const preview = stripHtml(d.body_html || '').trim()
        return {
          // Prefixed so it can never collide with a real thread id.
          id: `composer-draft:${d.id}`,
          compose_draft_id: d.id,
          is_composer_draft: true,
          subject: d.subject || '',
          participants: (d.to_emails || []).map((email: string) => ({ name: null, email })),
          last_message_at: d.updated_at,
          message_count: 1,
          unread_count: 0,
          has_attachments: (d.attachments || []).length > 0,
          is_starred: false,
          is_read: true,
          folder: 'drafts',
          labels: [],
          email_account_id: d.email_account_id,
          is_deleted: false,
          created_at: d.created_at,
          updated_at: d.updated_at,
          emails: [{
            id: `composer-draft-email:${d.id}`,
            from_address: account?.email_address || '',
            from_name: account?.display_name || null,
            snippet: preview.slice(0, 200),
            sent_at: null,
            created_at: d.updated_at,
            is_read: true,
            is_inbound: false,
          }],
        }
      })
    }
  }

  // Inbox shows ONLY threads that have actually received an inbound message.
  // A thread you only sent into (a new outbound email with no reply yet) belongs
  // in Sent, never Inbox — regardless of the thread's stored `folder` value
  // (the column defaults to 'inbox', and some automated send paths don't override
  // it). Requiring an inbound email via emails!inner enforces this at query time.
  const inboxInboundOnly = !isStarred && folder === 'inbox'

  // Get total count first
  let countQuery = supabase
    .from('email_threads')
    .select(inboxInboundOnly ? '*, emails!inner(id)' : '*', { count: 'exact', head: true })
    .in('email_account_id', accountIds)
    .eq('is_deleted', false)

  if (isStarred) {
    countQuery = countQuery.eq('is_starred', true).neq('folder', 'trash')
  } else if (folder === 'sent') {
    // For sent folder, we look for threads that have outbound emails
    // This is handled differently below
  } else {
    countQuery = countQuery.eq('folder', folder)
    if (inboxInboundOnly) countQuery = countQuery.eq('emails.is_inbound', true)
  }

  // Build query for threads with pagination
  const offset = (currentPage - 1) * PAGE_SIZE

  // For sent folder, we need to find threads with outbound emails
  if (folder === 'sent') {
    // Page through the emails table in batches to collect every thread that has
    // at least one outbound email, recording the most recent send time per
    // thread. Batching is required because PostgREST caps a single response at
    // 1000 rows by default — without it, anyone who had sent more than 1000
    // emails would silently lose their older sent threads from this view.
    const lastSentAt = new Map<string, number>()
    const OUTBOUND_BATCH = 1000
    for (let from = 0; ; from += OUTBOUND_BATCH) {
      // `status != 'draft'` keeps unsent mail out of Sent. This view matched on
      // is_inbound alone, so anything outbound-but-unsent showed up as if it had
      // been delivered. Filtering on sent_at instead would be wrong — 14 genuinely
      // sent emails (migrated ones) have a null sent_at and would vanish.
      const { data: batch } = await supabase
        .from('emails')
        .select('thread_id, sent_at, created_at')
        .in('email_account_id', accountIds)
        .eq('is_inbound', false)
        .eq('is_deleted', false)
        .neq('status', 'draft')
        .order('created_at', { ascending: false })
        .range(from, from + OUTBOUND_BATCH - 1)

      if (!batch || batch.length === 0) break
      for (const e of batch) {
        if (!e.thread_id) continue
        const ts = new Date(e.sent_at || e.created_at).getTime()
        const prev = lastSentAt.get(e.thread_id)
        if (prev === undefined || ts > prev) lastSentAt.set(e.thread_id, ts)
      }
      if (batch.length < OUTBOUND_BATCH) break
    }

    // Order by when *we* last sent — NOT by last_message_at. Ordering by
    // last_message_at buries a freshly sent thread beneath threads that merely
    // received an inbound reply, pushing recent sends off the first page (which
    // is exactly why they looked "missing"). Then paginate the ordered ids.
    const sentThreadIds = [...lastSentAt.keys()].sort(
      (a, b) => (lastSentAt.get(b) || 0) - (lastSentAt.get(a) || 0)
    )
    const sentCount = sentThreadIds.length
    const pageThreadIds = sentThreadIds.slice(offset, offset + PAGE_SIZE)

    const { data: rawThreads } = await supabase
      .from('email_threads')
      .select(`
        *,
        emails!inner(
          id,
          from_address,
          from_name,
          snippet,
          sent_at,
          created_at,
          is_read,
          is_inbound
        )
      `)
      .in('id', pageThreadIds.length > 0 ? pageThreadIds : ['no-match'])
      .eq('is_deleted', false)

    // .in() does not preserve order, so restore outbound-recency ordering.
    const threads = (rawThreads || []).sort(
      (a: any, b: any) => (lastSentAt.get(b.id) || 0) - (lastSentAt.get(a.id) || 0)
    )

    // Get first account for compose
    const selectedAccountId = accountIds[0]

    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10 flex-shrink-0">
          <h1 className="text-xl font-light text-white">{title}</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <EmailList
            threads={(threads || []).map((t: any) => ({
              ...t,
              emails: t.emails?.sort((a: any, b: any) =>
                new Date(b.sent_at || b.created_at).getTime() -
                new Date(a.sent_at || a.created_at).getTime()
              )
            }))}
            selectedAccountId={selectedAccountId}
            emptyMessage={emptyMessage}
            currentPage={currentPage}
            totalCount={sentCount || 0}
            pageSize={PAGE_SIZE}
            folder={folder}
          />
        </div>
      </div>
    )
  }

  const { count: totalCount } = await countQuery

  let query = supabase
    .from('email_threads')
    .select(`
      *,
      emails!inner(
        id,
        from_address,
        from_name,
        snippet,
        sent_at,
        created_at,
        is_read,
        is_inbound
      )
    `)
    .in('email_account_id', accountIds)
    .eq('is_deleted', false)
    .order('last_message_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  // Filter by folder or starred
  if (isStarred) {
    query = query.eq('is_starred', true).neq('folder', 'trash')
  } else {
    query = query.eq('folder', folder)
    // Inbox: require an inbound message (see inboxInboundOnly note above).
    if (inboxInboundOnly) query = query.eq('emails.is_inbound', true)
  }

  const { data: threads } = await query

  // Get first account for compose
  const selectedAccountId = accountIds[0]

  // Composer drafts ride on top of page 1 rather than being paginated with the
  // synced threads — they come from a different table with its own ordering, and
  // interleaving the two would need a merged cursor. They're newest-first and
  // typically few, so page 1 can run slightly long; no synced thread is skipped.
  const listThreads = [
    ...(currentPage === 1 ? composerDrafts : []),
    ...(threads || []).map((t: any) => ({
      ...t,
      emails: t.emails?.sort((a: any, b: any) =>
        new Date(b.sent_at || b.created_at).getTime() -
        new Date(a.sent_at || a.created_at).getTime()
      )
    })),
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex-shrink-0">
        <h1 className="text-xl font-light text-white">{title}</h1>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-hidden">
        <EmailList
          threads={listThreads}
          selectedAccountId={selectedAccountId}
          emptyMessage={emptyMessage}
          currentPage={currentPage}
          totalCount={(totalCount || 0) + composerDrafts.length}
          pageSize={PAGE_SIZE}
          folder={folder}
        />
      </div>
    </div>
  )
}
