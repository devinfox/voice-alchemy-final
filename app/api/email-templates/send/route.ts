import { createClient } from '@/lib/supabase-server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/sendgrid'
import { generateMessageId, generateSnippet } from '@/lib/email-utils'
import { renderEmailTemplate, templateHtml } from '@/lib/email-variables'
import { v4 as uuidv4 } from 'uuid'
import { listUnsubscribeHeaders } from '@/lib/email-unsubscribe'
import { isUnsubscribed } from '@/lib/email-leads'

// POST /api/email-templates/send
// Sends (or schedules) a template to selected students (`student_ids`, a
// profiles.id each) and/or website leads (`website_lead_ids`, an
// email_leads.id each) from the caller's verified email account. Each send
// is recorded as a sent thread in the email client so replies land in the
// inbox.
export async function POST(request: NextRequest) {
  try {
    const senderProfile = await requireEmailAccess()
    if (!senderProfile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { template_id, scheduled_at } = body
    const studentIds: string[] = body.student_ids || body.lead_ids || []
    const websiteLeadIds: string[] = Array.isArray(body.website_lead_ids) ? body.website_lead_ids : []

    if (!template_id) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 })
    }
    if ((!Array.isArray(studentIds) || studentIds.length === 0) && websiteLeadIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one recipient' }, { status: 400 })
    }
    if (scheduled_at && Number.isNaN(Date.parse(scheduled_at))) {
      return NextResponse.json({ error: 'scheduled_at is not a valid date' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Sending account: the caller's active mailbox on a verified domain
    const { data: emailAccount } = await admin
      .from('email_accounts')
      .select('*, domain:email_domains(id, domain, verification_status)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle()

    if (!emailAccount) {
      return NextResponse.json({
        error: 'No sending mailbox is set up for your account yet. Add one under Email → Settings → Accounts.',
      }, { status: 400 })
    }

    const domainInfo = Array.isArray(emailAccount.domain) ? emailAccount.domain[0] : emailAccount.domain
    if (domainInfo?.verification_status !== 'verified') {
      return NextResponse.json({
        error: 'Your sending domain is not verified yet. Finish DNS verification under Email → Settings → Domains.',
      }, { status: 400 })
    }

    const { data: template, error: templateError } = await admin
      .from('email_templates')
      .select('*')
      .eq('id', template_id)
      .eq('is_deleted', false)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    if (!templateHtml(template)) {
      return NextResponse.json({ error: 'This template has no content. Open it in the editor and add at least one block.' }, { status: 400 })
    }

    // Recipients: profiles for names, users mirror for email addresses
    const [{ data: recipientProfiles, error: profilesError }, { data: recipientUsers, error: usersError }] = await Promise.all([
      studentIds.length > 0 ? admin.from('profiles').select('id, first_name, last_name, name').in('id', studentIds) : Promise.resolve({ data: [], error: null }),
      studentIds.length > 0 ? admin.from('users').select('id, email').in('id', studentIds) : Promise.resolve({ data: [], error: null }),
    ])

    if (profilesError || usersError) {
      const err = profilesError || usersError
      console.error('[email-templates/send] recipient lookup failed:', err)
      return NextResponse.json({ error: err!.message }, { status: 500 })
    }

    const emailById = new Map<string, string>()
    for (const u of recipientUsers || []) if (u.email) emailById.set(u.id, u.email)

    type Recipient = { id: string; first_name: string | null; last_name: string | null; name: string | null; email: string }
    const recipients: Recipient[] = (recipientProfiles || [])
      .map(p => ({ ...p, email: emailById.get(p.id) || null }))
      .filter((p): p is typeof p & { email: string } => !!p.email)

    // Website leads (no account): names and email live on email_leads
    if (websiteLeadIds.length > 0) {
      const { data: leadRows, error: leadsError } = await admin
        .from('email_leads')
        .select('id, first_name, last_name, email, is_unsubscribed')
        .in('id', websiteLeadIds)
      if (leadsError) {
        return NextResponse.json({ error: leadsError.message }, { status: 500 })
      }
      for (const l of leadRows || []) {
        if (l.email && !l.is_unsubscribed) recipients.push({ id: l.id, first_name: l.first_name, last_name: l.last_name, name: null, email: l.email })
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'None of the selected recipients have an email address on file' }, { status: 400 })
    }

    const sender = {
      name: emailAccount.display_name || senderProfile.name || `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim(),
      first_name: senderProfile.first_name || null,
      email: emailAccount.email_address as string,
    }

    const nowIso = new Date().toISOString()
    let sentCount = 0
    let failedCount = 0
    const errors: string[] = []

    let skippedUnsubscribed = 0
    for (const recipient of recipients) {
      const displayName = `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.name || ''
      try {
        if (await isUnsubscribed(admin, recipient.email)) {
          skippedUnsubscribed++
          continue
        }
        const rendered = renderEmailTemplate(template, { recipient, sender })
        const messageId = generateMessageId(domainInfo.domain)

        const { data: thread, error: threadError } = await admin
          .from('email_threads')
          .insert({
            email_account_id: emailAccount.id,
            // Admin client bypasses the auth.uid() org-stamping trigger; set org
            // explicitly so org-isolation RLS does not hide the sent thread.
            organization_id: emailAccount.organization_id,
            subject: rendered.subject || '(no subject)',
            folder: 'sent',
            is_read: true,
            last_message_at: nowIso,
          })
          .select()
          .single()

        if (threadError || !thread) {
          throw new Error(threadError?.message || 'Could not create thread')
        }

        const emailId = uuidv4()
        const { error: emailError } = await admin.from('emails').insert({
          id: emailId,
          thread_id: thread.id,
          email_account_id: emailAccount.id,
          organization_id: emailAccount.organization_id,
          message_id: `<${messageId}>`,
          from_address: emailAccount.email_address,
          from_name: emailAccount.display_name,
          to_addresses: [{ email: recipient.email, name: displayName || null }],
          subject: rendered.subject,
          body_text: rendered.text,
          body_html: rendered.html,
          snippet: generateSnippet(rendered.text),
          status: scheduled_at ? 'queued' : 'sending',
          is_inbound: false,
          is_read: true,
          scheduled_at: scheduled_at || null,
        })

        if (emailError) {
          throw new Error(emailError.message)
        }

        if (scheduled_at) {
          // The email-queue cron picks it up when scheduled_at is due
          sentCount++
          continue
        }

        const result = await sendEmail({
          to: [{ email: recipient.email, name: displayName || undefined }],
          from: { email: emailAccount.email_address, name: emailAccount.display_name || undefined },
          subject: rendered.subject,
          text: rendered.text || undefined,
          html: rendered.html,
          headers: { 'Message-ID': `<${messageId}>`, ...listUnsubscribeHeaders(recipient.email) },
        })

        await admin
          .from('emails')
          .update({ status: 'sent', sent_at: new Date().toISOString(), sendgrid_message_id: result.messageId })
          .eq('id', emailId)

        sentCount++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[email-templates/send] failed for ${recipient.email}:`, err)
        errors.push(`${displayName || recipient.email}: ${message}`)
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      scheduled: !!scheduled_at,
      skipped_no_email: studentIds.length + websiteLeadIds.length - recipients.length,
      skipped_unsubscribed: skippedUnsubscribed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[email-templates/send] unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
