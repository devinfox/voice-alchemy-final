import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseEmailSearch, buildTsQuery } from '@/lib/email-search-parser'

// GET /api/email/search - Search emails with full-text search and operators
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Parse the search query
    const parsed = parseEmailSearch(query)
    const tsQuery = buildTsQuery(parsed)

    const admin = getSupabaseAdmin()

    // Get user's email accounts
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: accounts } = await admin
      .from('email_accounts')
      .select('id')
      .eq('user_id', userData.id)
      .eq('is_deleted', false)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ threads: [], total: 0 })
    }

    const accountIds = accounts.map(a => a.id)

    // Build the search query
    // For full-text search, we need to query the emails table and join with threads
    if (tsQuery) {
      // Use raw SQL for full-text search
      const { data: results, error } = await admin.rpc('search_emails', {
        account_ids: accountIds,
        search_query: tsQuery,
        is_unread: parsed.isUnread ?? null,
        is_starred: parsed.isStarred ?? null,
        is_read: parsed.isRead ?? null,
        has_attachment: parsed.hasAttachment ?? null,
        folder_filter: parsed.folder ?? null,
        from_address: parsed.from ?? null,
        to_address: parsed.to ?? null,
        before_date: parsed.beforeDate ?? null,
        after_date: parsed.afterDate ?? null,
        workflow_state_filter: parsed.workflowState ?? null,
        result_limit: limit,
        result_offset: offset,
      })

      if (error) {
        console.error('Search error:', error)
        // Fallback to simple search if function doesn't exist
        return await fallbackSearch(admin, accountIds, parsed, limit, offset)
      }

      return NextResponse.json({
        threads: results || [],
        total: results?.length || 0,
        parsed,
      })
    }

    // If no text query, just apply filters
    return await fallbackSearch(admin, accountIds, parsed, limit, offset)
  } catch (error) {
    console.error('Error in email search:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Fallback search using regular queries
async function fallbackSearch(
  admin: any,
  accountIds: string[],
  parsed: ReturnType<typeof parseEmailSearch>,
  limit: number,
  offset: number
) {
  let query = admin
    .from('email_threads')
    .select(`
      *,
      emails!inner (
        id,
        subject,
        from_name,
        from_address,
        to_addresses,
        snippet,
        body_preview,
        sent_at,
        created_at,
        is_read,
        has_attachments
      )
    `)
    .in('email_account_id', accountIds)
    .eq('is_deleted', false)

  // Apply filters
  if (parsed.isUnread === true) {
    query = query.eq('is_read', false)
  }
  if (parsed.isRead === true) {
    query = query.eq('is_read', true)
  }
  if (parsed.isStarred === true) {
    query = query.eq('is_starred', true)
  }
  if (parsed.hasAttachment === true) {
    query = query.eq('has_attachments', true)
  }
  if (parsed.folder) {
    query = query.eq('folder', parsed.folder)
  }
  if (parsed.workflowState) {
    query = query.eq('workflow_state', parsed.workflowState)
  }
  if (parsed.from) {
    query = query.ilike('emails.from_address', `%${parsed.from}%`)
  }
  if (parsed.beforeDate) {
    query = query.lt('last_message_at', parsed.beforeDate)
  }
  if (parsed.afterDate) {
    query = query.gt('last_message_at', parsed.afterDate)
  }

  // Apply text search using ilike as fallback
  if (parsed.query) {
    query = query.or(`subject.ilike.%${parsed.query}%,emails.snippet.ilike.%${parsed.query}%`)
  }
  if (parsed.subject) {
    query = query.ilike('subject', `%${parsed.subject}%`)
  }

  // Order and paginate
  query = query
    .order('last_message_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error } = await query

  if (error) {
    console.error('Fallback search error:', error)
    return NextResponse.json({ threads: [], total: 0 })
  }

  return NextResponse.json({
    threads: data || [],
    total: data?.length || 0,
  })
}
