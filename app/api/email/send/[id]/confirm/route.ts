import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail as sendSendgridEmail } from '@/lib/sendgrid'
import { sendEmail as sendMicrosoftEmail, sendEmailWithLargeAttachments } from '@/lib/microsoft-graph'
import { getValidAccessToken } from '@/lib/microsoft-auth'
import { getValidAccessToken as getValidGmailAccessToken, sendMessage as sendGmailMessage, createRfc2822Message, encodeToBase64Url } from '@/lib/gmail-api'
import { processEmailForAI } from '@/lib/email-ai'
import { htmlToPlainText } from '@/lib/email/send-gate'
import { revalidatePath } from 'next/cache'

const MS_GRAPH_INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024

// POST /api/email/send/[id]/confirm - Confirm and actually send a queued email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: emailId } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // Get the email with all required data
    const { data: email, error: emailError } = await admin
      .from('emails')
      .select(`
        *,
        email_account:email_accounts(
          *,
          domain:email_domains(id, domain, verification_status, sendgrid_domain_id)
        ),
        attachments:email_attachments(*)
      `)
      .eq('id', emailId)
      .single()

    if (emailError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    // Verify ownership
    if (email.email_account?.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check if email is in queued status
    if (email.status !== 'queued') {
      return NextResponse.json({
        error: `Cannot confirm email with status: ${email.status}`
      }, { status: 400 })
    }

    const fromAccount = email.email_account
    const isMicrosoftAccount = fromAccount.provider === 'microsoft'
    const isGmailAccount = fromAccount.provider === 'gmail'

    // Defense in depth: the send gate normalizes bodies before persisting, but
    // guarantee a text/plain part here too in case a queued row predates it.
    if ((!email.body_text || !email.body_text.trim()) && email.body_html) {
      email.body_text = htmlToPlainText(email.body_html)
    }

    // Update status to sending
    await admin
      .from('emails')
      .update({
        status: 'sending',
        send_after: null,
        can_undo_until: null,
      })
      .eq('id', emailId)

    // Get attachments for sending - need to reload from storage if needed
    const attachmentRecords = email.attachments || []

    // Send via appropriate provider
    try {
      if (isMicrosoftAccount) {
        // Microsoft Graph API
        const { data: tokenData } = await admin
          .from('microsoft_oauth_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', user.id)
          .eq('email', fromAccount.email_address.toLowerCase())
          .single()

        if (!tokenData) {
          throw new Error('Microsoft account not connected')
        }

        const accessToken = await getValidAccessToken(
          tokenData.access_token,
          tokenData.refresh_token,
          tokenData.expires_at,
          async (newTokens: { access_token: string; refresh_token?: string; expires_in: number }) => {
            await admin
              .from('microsoft_oauth_tokens')
              .update({
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token || tokenData.refresh_token,
                expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
              })
              .eq('user_id', user.id)
              .eq('email', fromAccount.email_address.toLowerCase())
          }
        )

        const toRecipients = (email.to_addresses || []).map((r: { email: string; name?: string }) => ({
          emailAddress: { address: r.email, name: r.name || undefined }
        }))

        const ccRecipients = (email.cc_addresses || []).map((r: { email: string; name?: string }) => ({
          emailAddress: { address: r.email, name: r.name || undefined }
        }))

        const bccRecipients = (email.bcc_addresses || []).map((r: { email: string; name?: string }) => ({
          emailAddress: { address: r.email, name: r.name || undefined }
        }))

        const messageData = {
          to: toRecipients,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
          subject: email.subject || '',
          body: {
            contentType: (email.body_html ? 'html' : 'text') as 'html' | 'text',
            content: email.body_html || email.body_text || '',
          },
        }

        // Note: For simplicity, we're not handling attachments in confirm
        // since the original content was already stored
        await sendMicrosoftEmail(accessToken, messageData)

      } else if (isGmailAccount) {
        // Gmail API
        const { data: tokenData } = await admin
          .from('gmail_oauth_tokens')
          .select('id, access_token, refresh_token, expires_at')
          .eq('user_id', user.id)
          .eq('email', fromAccount.email_address.toLowerCase())
          .single()

        if (!tokenData) {
          throw new Error('Gmail account not connected')
        }

        const accessToken = await getValidGmailAccessToken({
          id: tokenData.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_at,
        })

        const toRecipients = (email.to_addresses || []).map((r: { email: string; name?: string }) => ({
          email: r.email,
          name: r.name || undefined,
        }))

        const ccRecipients = (email.cc_addresses || []).map((r: { email: string; name?: string }) => ({
          email: r.email,
          name: r.name || undefined,
        }))

        const bccRecipients = (email.bcc_addresses || []).map((r: { email: string; name?: string }) => ({
          email: r.email,
          name: r.name || undefined,
        }))

        const rawMessage = createRfc2822Message({
          from: { email: fromAccount.email_address, name: fromAccount.display_name },
          to: toRecipients,
          subject: email.subject || '',
          bodyText: email.body_text || '',
          bodyHtml: email.body_html,
          cc: ccRecipients,
          bcc: bccRecipients,
          inReplyTo: email.in_reply_to,
          references: email.references_header?.join(' '),
        })

        const encodedMessage = encodeToBase64Url(rawMessage)
        await sendGmailMessage(accessToken, encodedMessage)

      } else {
        // SendGrid
        if (fromAccount.domain?.verification_status !== 'verified') {
          throw new Error('Domain is not verified')
        }

        const toRecipients = (email.to_addresses || []).map((r: { email: string; name?: string }) => ({
          email: r.email,
          name: r.name || undefined,
        }))

        const ccRecipients = (email.cc_addresses || []).map((r: { email: string; name?: string }) => ({
          email: r.email,
          name: r.name || undefined,
        }))

        const bccRecipients = (email.bcc_addresses || []).map((r: { email: string; name?: string }) => ({
          email: r.email,
          name: r.name || undefined,
        }))

        await sendSendgridEmail({
          from: { email: fromAccount.email_address, name: fromAccount.display_name },
          to: toRecipients,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
          subject: email.subject || '',
          text: email.body_text || '',
          html: email.body_html,
          headers: {
            'Message-ID': email.message_id,
            ...(email.in_reply_to ? { 'In-Reply-To': email.in_reply_to } : {}),
            ...(email.references_header ? { References: email.references_header.join(' ') } : {}),
          },
        })
      }

      // Update email status to sent
      await admin
        .from('emails')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', emailId)

      // Update thread
      await admin
        .from('email_threads')
        .update({
          last_message_at: new Date().toISOString(),
          folder: 'sent',
        })
        .eq('id', email.thread_id)

      // Trigger AI processing for outbound email
      const toAddresses = (email.to_addresses || []).map((r: { email: string }) => r.email)
      try {
        await processEmailForAI(
          emailId,
          fromAccount.email_address,
          fromAccount.display_name,
          toAddresses,
          email.subject || '',
          email.body_text || null,
          email.body_html || null,
          false,
          user.id
        )
      } catch (aiError) {
        console.error('AI processing error:', aiError)
      }

      // Invalidate the email folder routes so the sent message appears
      // immediately rather than from a stale cached render.
      revalidatePath('/dashboard/email/sent')
      revalidatePath('/dashboard/email')

      return NextResponse.json({
        success: true,
        email_id: emailId,
        thread_id: email.thread_id,
        message: 'Email sent successfully',
      })
    } catch (sendError) {
      console.error('Send error:', sendError)

      // Update status to failed
      await admin
        .from('emails')
        .update({ status: 'failed' })
        .eq('id', emailId)

      return NextResponse.json({
        error: sendError instanceof Error ? sendError.message : 'Failed to send email',
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Error confirming email send:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
