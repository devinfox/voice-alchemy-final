import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  createDomainAuthentication,
  formatDNSRecordsFromSendGrid,
} from '@/lib/sendgrid'

// GET /api/email/domains - List all domains for current user
export async function GET(request: NextRequest) {
  try {
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

    const { data: domains, error } = await supabase
      .from('email_domains')
      .select('*')
      .eq('created_by', userData.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching domains:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ domains })
  } catch (error) {
    console.error('Domains GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/email/domains - Create a new domain
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
    const { domain } = body

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 })
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/
    if (!domainRegex.test(domain)) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
    }

    // Check if domain already exists
    const { data: existingDomain } = await getSupabaseAdmin()
      .from('email_domains')
      .select('id')
      .eq('domain', domain.toLowerCase())
      .eq('is_deleted', false)
      .single()

    if (existingDomain) {
      return NextResponse.json({ error: 'Domain already exists' }, { status: 400 })
    }

    // Create domain authentication in SendGrid
    let sendgridResponse
    let dnsRecords: any[] = []

    try {
      if (process.env.SENDGRID_API_KEY) {
        sendgridResponse = await createDomainAuthentication(domain.toLowerCase())
        dnsRecords = formatDNSRecordsFromSendGrid(sendgridResponse)
      } else {
        // Mock DNS records for development without SendGrid
        dnsRecords = [
          { type: 'cname', host: `em._domainkey.${domain}`, value: `em._domainkey.${domain}.sendgrid.net`, verified: false },
          { type: 'cname', host: `s1._domainkey.${domain}`, value: `s1.domainkey.${domain}.sendgrid.net`, verified: false },
          { type: 'cname', host: `s2._domainkey.${domain}`, value: `s2.domainkey.${domain}.sendgrid.net`, verified: false },
          { type: 'mx', host: '@', value: 'mx.sendgrid.net', priority: 10, verified: false },
          { type: 'txt', host: '@', value: 'v=spf1 include:sendgrid.net ~all', verified: false },
        ]
      }
    } catch (sgError: any) {
      console.error('SendGrid error:', sgError)
      // If SendGrid fails, still create the domain record with mock DNS
      if (sgError.code === 401) {
        return NextResponse.json({ error: 'SendGrid API key is invalid' }, { status: 500 })
      }
      // Create with mock DNS records
      dnsRecords = [
        { type: 'mx', host: '@', value: 'mx.sendgrid.net', priority: 10, verified: false },
        { type: 'txt', host: '@', value: 'v=spf1 include:sendgrid.net ~all', verified: false },
      ]
    }

    // Create domain record in database
    const { data: newDomain, error: insertError } = await getSupabaseAdmin()
      .from('email_domains')
      .insert({
        domain: domain.toLowerCase(),
        sendgrid_domain_id: sendgridResponse?.id?.toString() || null,
        verification_status: 'pending',
        dns_records: dnsRecords,
        created_by: userData.id,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating domain:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      domain: newDomain,
      dnsRecords,
    })
  } catch (error) {
    console.error('Domains POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
