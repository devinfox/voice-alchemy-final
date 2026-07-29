import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface EmailContact {
  email: string
  name: string | null
  lastUsed: string
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')?.toLowerCase() || ''
    const limit = parseInt(searchParams.get('limit') || '20')

    // Get the database user ID (users.id) from auth user ID (auth.uid)
    const { data: dbUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!dbUser) {
      return NextResponse.json({ contacts: [] })
    }

    // Get user's email accounts
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('id, email_address')
      .eq('user_id', dbUser.id)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ contacts: [] })
    }

    const accountIds = accounts.map(a => a.id)
    const userEmails = accounts.map(a => a.email_address.toLowerCase())

    // Query emails to extract contacts
    // Get both sent (from us) and received (to us) emails
    const { data: emails, error } = await supabase
      .from('emails')
      .select('from_address, from_name, to_addresses, cc_addresses, sent_at, created_at')
      .in('email_account_id', accountIds)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(1000)

    if (error) {
      console.error('Error fetching emails for contacts:', error)
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
    }

    // Build a map of unique contacts
    const contactMap = new Map<string, EmailContact>()

    for (const email of emails || []) {
      const timestamp = email.sent_at || email.created_at

      // Add from_address if it's not one of our accounts
      if (email.from_address && !userEmails.includes(email.from_address.toLowerCase())) {
        const emailLower = email.from_address.toLowerCase()
        if (!contactMap.has(emailLower)) {
          contactMap.set(emailLower, {
            email: email.from_address,
            name: email.from_name || null,
            lastUsed: timestamp,
          })
        }
      }

      // Helper to process recipient arrays (to, cc, bcc)
      const processRecipients = (recipients: any[]) => {
        for (const recipient of recipients) {
          let recipientEmail: string
          let recipientName: string | null = null

          if (typeof recipient === 'string') {
            recipientEmail = recipient
          } else if (recipient && typeof recipient === 'object' && recipient.email) {
            recipientEmail = recipient.email
            recipientName = recipient.name || null
          } else {
            continue
          }

          const emailLower = recipientEmail.toLowerCase()

          // Skip our own email addresses
          if (userEmails.includes(emailLower)) continue

          if (!contactMap.has(emailLower)) {
            contactMap.set(emailLower, {
              email: recipientEmail,
              name: recipientName,
              lastUsed: timestamp,
            })
          } else if (recipientName && !contactMap.get(emailLower)?.name) {
            // Update name if we have one and didn't before
            const existing = contactMap.get(emailLower)!
            existing.name = recipientName
          }
        }
      }

      // Add to_addresses
      if (email.to_addresses && Array.isArray(email.to_addresses)) {
        processRecipients(email.to_addresses)
      }

      // Add cc_addresses
      if (email.cc_addresses && Array.isArray(email.cc_addresses)) {
        processRecipients(email.cc_addresses)
      }
    }

    // Convert to array and filter by search query
    let contacts = Array.from(contactMap.values())

    if (query) {
      contacts = contacts.filter(c =>
        c.email.toLowerCase().includes(query) ||
        (c.name && c.name.toLowerCase().includes(query))
      )
    }

    // Sort by most recently used
    contacts.sort((a, b) =>
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    )

    // Limit results
    contacts = contacts.slice(0, limit)

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('Error in email contacts API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
