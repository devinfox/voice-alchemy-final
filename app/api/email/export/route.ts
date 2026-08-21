import { NextRequest, NextResponse } from 'next/server'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

interface EmailAttachment {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  storage_path: string
  public_url: string | null
  is_inline: boolean
  content_id: string | null
}

interface ExportedEmail {
  id: string
  from_address: string
  from_name: string | null
  to_addresses: Array<{ email: string; name?: string }>
  cc_addresses: Array<{ email: string; name?: string }>
  subject: string | null
  body_html: string | null
  body_text: string | null
  sent_at: string | null
  created_at: string
  is_inbound: boolean
  attachments: EmailAttachment[]
  user_name: string
  user_email: string
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only allow admins
    if (!['admin', 'super_admin'].includes(user.role || '')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { searchEmail, userIds, dateFrom, dateTo } = body

    if (!searchEmail) {
      return NextResponse.json({ error: 'Email address to search is required' }, { status: 400 })
    }

    const searchEmailLower = searchEmail.toLowerCase().trim()
    const supabaseAdmin = getSupabaseAdmin()

    let accountsQuery = supabaseAdmin
      .from('email_accounts')
      .select('id, email_address, user_id, display_name')
      .eq('is_deleted', false)
      .eq('is_active', true)

    if (userIds && userIds.length > 0) {
      accountsQuery = accountsQuery.in('user_id', userIds)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error('Failed to fetch email accounts:', accountsError)
      return NextResponse.json({ error: 'Failed to fetch email accounts' }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No email accounts found' }, { status: 404 })
    }

    const accountIds = accounts.map(a => a.id)

    // Build email query
    let emailQuery = supabaseAdmin
      .from('emails')
      .select(`
        id,
        from_address,
        from_name,
        to_addresses,
        cc_addresses,
        subject,
        body_html,
        body_text,
        sent_at,
        created_at,
        is_inbound,
        email_account_id,
        email_attachments (
          id,
          filename,
          content_type,
          size_bytes,
          storage_path
        )
      `)
      .in('email_account_id', accountIds)
      .order('created_at', { ascending: false })

    // Date filters
    if (dateFrom) {
      emailQuery = emailQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      // Add one day to include the full end date
      const toDate = new Date(dateTo)
      toDate.setDate(toDate.getDate() + 1)
      emailQuery = emailQuery.lt('created_at', toDate.toISOString())
    }

    const { data: emails, error: emailsError } = await emailQuery

    if (emailsError) {
      console.error('Failed to fetch emails:', emailsError)
      return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
    }

    // Filter emails where searchEmail is in from, to, or cc
    const filteredEmails = (emails || []).filter(email => {
      const fromMatch = email.from_address?.toLowerCase() === searchEmailLower

      const toMatch = (email.to_addresses as Array<{ email: string }>)?.some(
        t => t.email?.toLowerCase() === searchEmailLower
      )

      const ccMatch = (email.cc_addresses as Array<{ email: string }>)?.some(
        c => c.email?.toLowerCase() === searchEmailLower
      )

      return fromMatch || toMatch || ccMatch
    })

    // Map account IDs to user info
    const userIdsToFetch = accounts.map(a => a.user_id).filter(Boolean) as string[]
    const { data: profiles } = userIdsToFetch.length > 0
      ? await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, name, email')
          .in('id', userIdsToFetch)
      : { data: [] }

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

    const accountUserMap = new Map(
      accounts.map(a => {
        const prof = a.user_id ? profileMap.get(a.user_id) : null
        return [
          a.id,
          {
            userName: prof?.name || `${prof?.first_name || ''} ${prof?.last_name || ''}`.trim() || a.display_name || 'Coach',
            userEmail: prof?.email || a.email_address,
          }
        ]
      })
    )

    // Format results
    const exportedEmails: ExportedEmail[] = filteredEmails.map(email => {
      const userInfo = accountUserMap.get(email.email_account_id) || { userName: 'Unknown', userEmail: '' }

      return {
        id: email.id,
        from_address: email.from_address,
        from_name: email.from_name,
        to_addresses: email.to_addresses as Array<{ email: string; name?: string }>,
        cc_addresses: email.cc_addresses as Array<{ email: string; name?: string }>,
        subject: email.subject,
        body_html: email.body_html,
        body_text: email.body_text,
        sent_at: email.sent_at,
        created_at: email.created_at,
        is_inbound: email.is_inbound,
        attachments: (email.email_attachments || []) as EmailAttachment[],
        user_name: userInfo.userName,
        user_email: userInfo.userEmail,
      }
    })

    // Group by date for summary
    const byDate: Record<string, number> = {}
    exportedEmails.forEach(email => {
      const date = new Date(email.sent_at || email.created_at).toLocaleDateString()
      byDate[date] = (byDate[date] || 0) + 1
    })

    // Count attachments
    const totalAttachments = exportedEmails.reduce(
      (sum, e) => sum + e.attachments.filter(a => !a.is_inline).length,
      0
    )

    return NextResponse.json({
      success: true,
      searchEmail: searchEmailLower,
      summary: {
        totalEmails: exportedEmails.length,
        totalAttachments,
        usersSearched: accounts.length,
        dateRange: {
          from: dateFrom || 'All time',
          to: dateTo || 'Present',
        },
        byDate,
      },
      emails: exportedEmails,
    })
  } catch (error) {
    console.error('Email export error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export emails' },
      { status: 500 }
    )
  }
}
