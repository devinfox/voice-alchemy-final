import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { EmailList } from './components/email-list'
import { NoAccountsSetup } from './components/no-accounts-setup'
import { EmailSearch } from './components/email-search'
import { parseEmailSearch, ParsedEmailSearch } from '@/lib/email-search-parser'

const PAGE_SIZE = 20

// Messages fetched per thread for the list preview. Enough to resolve the most
// recent inbound sender in a thread with a run of outbound replies.
const THREAD_PREVIEW_EMAILS = 10

export default async function EmailInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ starred?: string; account?: string; page?: string; q?: string }>
}) {
  const params = await searchParams
  const searchQuery = params.q || ''
  const parsedSearch = parseEmailSearch(searchQuery)
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get user's email accounts (use admin client to bypass RLS for domain join)
  const { data: accounts } = await supabaseAdmin
    .from('email_accounts')
    .select('*, email_domains(*)')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })

  // If no accounts, show setup screen
  if (!accounts || accounts.length === 0) {
    return <NoAccountsSetup />
  }

  // Get selected account or default to primary
  const selectedAccountId = params.account || accounts.find(a => a.is_primary)?.id || accounts[0].id

  // If searching, find matching thread IDs from emails table first
  let matchingThreadIds: string[] | null = null
  const hasSearchFilters = parsedSearch.from || parsedSearch.to || parsedSearch.query || parsedSearch.subject || parsedSearch.body

  if (hasSearchFilters) {
    // Build email search query
    let emailSearchQuery = supabase
      .from('emails')
      .select('thread_id')
      .eq('email_account_id', selectedAccountId)
      .eq('is_deleted', false)

    // Search from: in from_address or from_name
    if (parsedSearch.from) {
      emailSearchQuery = emailSearchQuery.or(
        `from_address.ilike.%${parsedSearch.from}%,from_name.ilike.%${parsedSearch.from}%`
      )
    }

    // Search to: in to_addresses (JSONB column)
    if (parsedSearch.to) {
      // Cast to text for searching within JSON
      emailSearchQuery = emailSearchQuery.ilike('to_addresses::text', `%${parsedSearch.to}%`)
    }

    // Search subject: specifically in subject
    if (parsedSearch.subject) {
      emailSearchQuery = emailSearchQuery.ilike('subject', `%${parsedSearch.subject}%`)
    }

    // Search body: in body_text
    if (parsedSearch.body) {
      emailSearchQuery = emailSearchQuery.ilike('body_text', `%${parsedSearch.body}%`)
    }

    // General search (free text) in subject, snippet, from_address, from_name
    if (parsedSearch.query) {
      emailSearchQuery = emailSearchQuery.or(
        `subject.ilike.%${parsedSearch.query}%,snippet.ilike.%${parsedSearch.query}%,from_address.ilike.%${parsedSearch.query}%,from_name.ilike.%${parsedSearch.query}%`
      )
    }

    const { data: matchingEmails } = await emailSearchQuery

    if (matchingEmails) {
      matchingThreadIds = [...new Set(matchingEmails.map(e => e.thread_id).filter(Boolean))]
    } else {
      matchingThreadIds = []
    }
  }

  // Determine folder to query (default inbox, or from search operator)
  const folderToQuery = parsedSearch.folder || 'inbox'

  // Get total count first
  let countQuery = supabase
    .from('email_threads')
    .select('*', { count: 'exact', head: true })
    .eq('email_account_id', selectedAccountId)
    .eq('is_deleted', false)
    .eq('folder', folderToQuery)

  // Apply search filter operators
  if (params.starred === 'true' || parsedSearch.isStarred) {
    countQuery = countQuery.eq('is_starred', true)
  }
  if (parsedSearch.isUnread) {
    countQuery = countQuery.eq('is_read', false)
  }
  if (parsedSearch.isRead) {
    countQuery = countQuery.eq('is_read', true)
  }
  if (parsedSearch.hasAttachment) {
    countQuery = countQuery.eq('has_attachments', true)
  }
  if (parsedSearch.workflowState) {
    countQuery = countQuery.eq('workflow_state', parsedSearch.workflowState)
  }
  if (parsedSearch.beforeDate) {
    countQuery = countQuery.lt('last_message_at', parsedSearch.beforeDate)
  }
  if (parsedSearch.afterDate) {
    countQuery = countQuery.gt('last_message_at', parsedSearch.afterDate)
  }

  // Filter by matching thread IDs if searching
  if (matchingThreadIds !== null) {
    if (matchingThreadIds.length === 0) {
      // No matches - return empty
      countQuery = countQuery.in('id', ['no-match-placeholder'])
    } else {
      countQuery = countQuery.in('id', matchingThreadIds)
    }
  }

  // Fetch threads for inbox with pagination
  const offset = (currentPage - 1) * PAGE_SIZE
  let query = supabase
    .from('email_threads')
    .select(`
      *,
      emails!inner (
        id,
        from_address,
        from_name,
        snippet,
        sent_at,
        created_at,
        is_read,
        is_inbound,
        to_addresses
      )
    `)
    .eq('email_account_id', selectedAccountId)
    .eq('is_deleted', false)
    .eq('folder', folderToQuery)
    .order('last_message_at', { ascending: false })
    // The list only reads the newest message and the newest inbound sender, so
    // there is no reason to pull every message of every thread. Long threads
    // were multiplying this payload many times over.
    .order('created_at', { referencedTable: 'emails', ascending: false })
    .limit(THREAD_PREVIEW_EMAILS, { referencedTable: 'emails' })
    .range(offset, offset + PAGE_SIZE - 1)

  // Apply search filter operators
  if (params.starred === 'true' || parsedSearch.isStarred) {
    query = query.eq('is_starred', true)
  }
  if (parsedSearch.isUnread) {
    query = query.eq('is_read', false)
  }
  if (parsedSearch.isRead) {
    query = query.eq('is_read', true)
  }
  if (parsedSearch.hasAttachment) {
    query = query.eq('has_attachments', true)
  }
  if (parsedSearch.workflowState) {
    query = query.eq('workflow_state', parsedSearch.workflowState)
  }
  if (parsedSearch.beforeDate) {
    query = query.lt('last_message_at', parsedSearch.beforeDate)
  }
  if (parsedSearch.afterDate) {
    query = query.gt('last_message_at', parsedSearch.afterDate)
  }

  // Filter by matching thread IDs if searching
  if (matchingThreadIds !== null) {
    if (matchingThreadIds.length === 0) {
      query = query.in('id', ['no-match-placeholder'])
    } else {
      query = query.in('id', matchingThreadIds)
    }
  }

  // Count and page are independent — run them together rather than back to back.
  const [{ count: totalCount }, { data: threads, error }] = await Promise.all([
    countQuery,
    query,
  ])

  if (error) {
    console.error('Error fetching threads:', error)
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0]

  return (
    <div className="h-full flex flex-col overflow-hidden max-w-full">
      {/* Header - Desktop only */}
      <div className="hidden md:block px-6 py-4 border-b border-white/10 flex-shrink-0 max-w-full">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-shrink-0">
            <h1 className="text-2xl font-light text-white">
              {searchQuery ? 'Search Results' : params.starred === 'true' ? 'Starred' : 'Inbox'}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {selectedAccount.email_address}
            </p>
          </div>
          <div className="flex-1 max-w-md">
            <EmailSearch />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm text-gray-400">
              {totalCount || 0} {searchQuery ? 'results' : 'conversations'}
            </span>
          </div>
        </div>
      </div>

      {/* Search Bar - Mobile */}
      <div className="md:hidden px-4 py-3 border-b border-white/10">
        <EmailSearch placeholder="Search... (:from :to)" />
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-hidden max-w-full min-w-0">
        <EmailList
          threads={(threads || []).map((t: any) => ({
            ...t,
            emails: t.emails?.sort((a: any, b: any) =>
              new Date(b.sent_at || b.created_at).getTime() -
              new Date(a.sent_at || a.created_at).getTime()
            )
          }))}
          selectedAccountId={selectedAccountId}
          emptyMessage={
            searchQuery
              ? `No emails found for "${searchQuery}"`
              : params.starred === 'true'
              ? 'No starred emails'
              : 'Your inbox is empty'
          }
          currentPage={currentPage}
          totalCount={totalCount || 0}
          pageSize={PAGE_SIZE}
          folder={folderToQuery as 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'}
        />
      </div>
    </div>
  )
}
