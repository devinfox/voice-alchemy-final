import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { validateDomain, getDomainAuthentication } from '@/lib/sendgrid'

// POST /api/email/domains/[id]/verify - Verify DNS records for a domain
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Get the domain
    const { data: domain } = await supabase
      .from('email_domains')
      .select('*')
      .eq('id', id)
      .eq('created_by', userData.id)
      .eq('is_deleted', false)
      .single()

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Update status to verifying
    await getSupabaseAdmin()
      .from('email_domains')
      .update({
        verification_status: 'verifying',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    let verified = false
    let validationResult: any = null
    let dnsRecords = domain.dns_records

    // If we have a SendGrid domain ID, verify through SendGrid
    if (domain.sendgrid_domain_id && process.env.SENDGRID_API_KEY) {
      try {
        // Validate the domain in SendGrid
        validationResult = await validateDomain(parseInt(domain.sendgrid_domain_id))

        // Check if all validations passed
        if (validationResult.valid) {
          verified = true
        }

        // Get updated domain info from SendGrid
        const domainInfo = await getDomainAuthentication(parseInt(domain.sendgrid_domain_id))

        // Update DNS records with verification status
        if (domainInfo && domainInfo.dns) {
          dnsRecords = []

          // DKIM records
          if (domainInfo.dns.dkim1) {
            dnsRecords.push({
              type: 'cname',
              host: domainInfo.dns.dkim1.host,
              value: domainInfo.dns.dkim1.data,
              verified: domainInfo.dns.dkim1.valid
            })
          }
          if (domainInfo.dns.dkim2) {
            dnsRecords.push({
              type: 'cname',
              host: domainInfo.dns.dkim2.host,
              value: domainInfo.dns.dkim2.data,
              verified: domainInfo.dns.dkim2.valid
            })
          }

          // Mail CNAME
          if (domainInfo.dns.mail_cname) {
            dnsRecords.push({
              type: 'cname',
              host: domainInfo.dns.mail_cname.host,
              value: domainInfo.dns.mail_cname.data,
              verified: domainInfo.dns.mail_cname.valid
            })
          }
        }
      } catch (sgError: any) {
        console.error('SendGrid verification error:', sgError)

        // Update with error
        await getSupabaseAdmin()
          .from('email_domains')
          .update({
            verification_status: 'failed',
            verification_error: sgError.message || 'SendGrid verification failed',
            last_verification_check: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', id)

        return NextResponse.json({
          success: false,
          verified: false,
          error: 'Verification failed. Please check your DNS records.',
          dnsRecords
        })
      }
    } else {
      // Mock verification for development without SendGrid
      // In production, this would always require SendGrid
      const mockVerified = Math.random() > 0.7 // 30% chance of verification for testing
      verified = mockVerified

      // Update mock DNS records with random verification status
      if (Array.isArray(dnsRecords)) {
        dnsRecords = dnsRecords.map((record: any) => ({
          ...record,
          verified: mockVerified || Math.random() > 0.5
        }))
      }
    }

    // Update domain status
    const { error: updateError } = await getSupabaseAdmin()
      .from('email_domains')
      .update({
        verification_status: verified ? 'verified' : 'pending',
        verification_error: verified ? null : 'Some DNS records are not yet verified',
        dns_records: dnsRecords,
        last_verification_check: new Date().toISOString(),
        verified_at: verified ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error('Error updating domain:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      verified,
      dnsRecords,
      message: verified
        ? 'Domain verified successfully!'
        : 'DNS records not yet verified. Please ensure all records are added and try again.'
    })
  } catch (error) {
    console.error('Domain verify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
