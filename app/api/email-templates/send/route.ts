import { createClient } from '@/lib/supabase-server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/sendgrid'
import { generateMessageId, generateSnippet, stripHtml } from '@/lib/email-utils'
import { v4 as uuidv4 } from 'uuid'

// POST /api/email-templates/send - Send a template to selected leads
export async function POST(request: NextRequest) {
  try {
    // Only email-tools users (admins / Julia) may send templates
    const gateProfile = await requireEmailAccess()
    if (!gateProfile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { template_id, lead_ids, scheduled_at } = body

    if (!template_id) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 })
    }

    if (!lead_ids || lead_ids.length === 0) {
      return NextResponse.json({ error: 'At least one lead_id is required' }, { status: 400 })
    }

    // Use service role for operations
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get user's active email account with verified domain
    const { data: emailAccount, error: accountError } = await serviceClient
      .from('email_accounts')
      .select(`
        *,
        domain:email_domains(id, domain, verification_status)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle()

    if (accountError || !emailAccount) {
      return NextResponse.json({
        error: 'No email account configured. Please set up an email account first.'
      }, { status: 400 })
    }

    if (emailAccount.domain?.verification_status !== 'verified') {
      return NextResponse.json({
        error: 'Email domain not verified. Please complete DNS verification first.'
      }, { status: 400 })
    }

    // Fetch the template
    const { data: template, error: templateError } = await serviceClient
      .from('email_templates')
      .select('*')
      .eq('id', template_id)
      .eq('is_deleted', false)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // VAAA: recipients are users (students/teachers). profiles has no email
    // column — emails live in the `users` mirror table — so fetch both and
    // join in code, skipping anyone without an email row.
    const { data: recipientProfiles, error: leadsError } = await serviceClient
      .from('profiles')
      .select('id, first_name, last_name, name')
      .in('id', lead_ids)

    if (leadsError) {
      console.error('Error fetching recipients:', leadsError)
      return NextResponse.json({ error: leadsError.message }, { status: 500 })
    }

    const { data: recipientUsers, error: usersError } = await serviceClient
      .from('users')
      .select('id, email')
      .in('id', lead_ids)

    if (usersError) {
      console.error('Error fetching recipient emails:', usersError)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    const emailById = new Map<string, string>(
      (recipientUsers || [])
        .filter((u): u is { id: string; email: string } => !!u.email)
        .map(u => [u.id, u.email])
    )

    const leads = (recipientProfiles || [])
      .map(p => ({ ...p, email: emailById.get(p.id) || null }))
      .filter((p): p is typeof p & { email: string } => !!p.email)

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No valid recipients found with email addresses' }, { status: 400 })
    }

    const now = new Date().toISOString()
    let sentCount = 0
    let failedCount = 0
    const errors: string[] = []

    // Send email to each lead
    for (const lead of leads) {
      try {
        // Replace template variables
        let subject = template.subject || ''
        let bodyHtml = template.body_html || template.body || ''
        let bodyText = template.body || ''

        const replacements: Record<string, string> = {
          '{{first_name}}': lead.first_name || '',
          '{{last_name}}': lead.last_name || '',
          '{{full_name}}': `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          '{{email}}': lead.email || '',
        }

        for (const [key, value] of Object.entries(replacements)) {
          const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g')
          subject = subject.replace(regex, value)
          bodyHtml = bodyHtml.replace(regex, value)
          bodyText = bodyText.replace(regex, value)
        }

        // Generate message ID
        const messageId = generateMessageId(emailAccount.domain.domain)

        // Create thread
        const { data: thread, error: threadError } = await serviceClient
          .from('email_threads')
          .insert({
            email_account_id: emailAccount.id,
            // serviceClient bypasses the auth.uid() org-stamping trigger; set
            // org explicitly so org-isolation RLS doesn't hide the sent thread.
            organization_id: emailAccount.organization_id,
            subject: subject || '(no subject)',
            folder: 'sent',
            is_read: true,
            last_message_at: now,
          })
          .select()
          .single()

        if (threadError) {
          console.error('Error creating thread:', threadError)
          errors.push(`Failed to create thread for ${lead.email}`)
          failedCount++
          continue
        }

        // Create email record
        const emailId = uuidv4()
        const { error: emailError } = await serviceClient
          .from('emails')
          .insert({
            id: emailId,
            thread_id: thread.id,
            email_account_id: emailAccount.id,
            organization_id: emailAccount.organization_id,
            message_id: `<${messageId}>`,
            from_address: emailAccount.email_address,
            from_name: emailAccount.display_name,
            to_addresses: [{ email: lead.email, name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null }],
            subject,
            body_text: bodyText,
            body_html: bodyHtml,
            snippet: generateSnippet(bodyText || stripHtml(bodyHtml)),
            status: scheduled_at ? 'queued' : 'sending',
            is_inbound: false,
            is_read: true,
            scheduled_at: scheduled_at || null,
          })

        if (emailError) {
          console.error('Error creating email record:', emailError)
          errors.push(`Failed to create email record for ${lead.email}`)
          failedCount++
          continue
        }

        // If scheduled, skip actual sending
        if (scheduled_at) {
          sentCount++
          continue
        }

        // Send via SendGrid
        const result = await sendEmail({
          to: [{ email: lead.email, name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || undefined }],
          from: {
            email: emailAccount.email_address,
            name: emailAccount.display_name || undefined,
          },
          subject,
          text: bodyText,
          html: bodyHtml,
          headers: {
            'Message-ID': `<${messageId}>`,
          },
          trackingSettings: {
            clickTracking: { enable: true },
            openTracking: { enable: true },
          },
        })

        // Update email status to sent
        await serviceClient
          .from('emails')
          .update({
            status: 'sent',
            sent_at: now,
            sendgrid_message_id: result.messageId,
          })
          .eq('id', emailId)

        sentCount++
      } catch (sendError: any) {
        console.error(`Failed to send to ${lead.email}:`, sendError)
        errors.push(`Failed to send to ${lead.email}: ${sendError.message}`)
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      scheduled: !!scheduled_at,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error in POST /api/email-templates/send:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
