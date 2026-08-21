import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail as sendSendgridEmail } from '@/lib/sendgrid'
import { sendEmail as sendMicrosoftEmail, sendEmailWithLargeAttachments } from '@/lib/microsoft-graph'
import { getValidAccessToken } from '@/lib/microsoft-auth'
import { getValidAccessToken as getValidGmailAccessToken, sendMessage as sendGmailMessage, createRfc2822Message, encodeToBase64Url } from '@/lib/gmail-api'
import { generateMessageId, parseEmailAddress, generateSnippet, stripHtml } from '@/lib/email-utils'
import { runSendGate } from '@/lib/email/send-gate'
import { EmailParticipant } from '@/types/email.types'
import { v4 as uuidv4 } from 'uuid'
import { processEmailForAI } from '@/lib/email-ai'
import { revalidatePath } from 'next/cache'

// For App Router, body size is configured via route segment config
// The default is 1MB for App Router, increase to 25MB for attachments
export const maxDuration = 60 // Allow up to 60 seconds for large uploads

// Max size for inline attachments in Microsoft Graph (3MB)
const MS_GRAPH_INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024

// POST /api/email/send - Send an email
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name')
      .eq('id', user.id)
      .maybeSingle()

    const userData = {
      id: user.id,
      first_name: profile?.first_name || profile?.name?.split(' ')[0] || user.email?.split('@')[0] || 'User',
      last_name: profile?.last_name || profile?.name?.split(' ').slice(1).join(' ') || '',
    }

    const body = await request.json()
    const {
      from_account_id,
      to,
      cc,
      bcc,
      subject,
      reply_to_email_id,
      thread_id,
      attachments: rawAttachments,
      schedule_at,
      enable_undo,
      undo_seconds = 10,
    } = body

    // body_text / body_html are `let` so the send gate can replace them with the
    // normalized, canonical versions before anything downstream persists or sends.
    let body_text: string = body.body_text || ''
    let body_html: string = body.body_html || ''

    // Ensure attachments is always an array
    const attachments = Array.isArray(rawAttachments) ? rawAttachments : []
    console.log('[Email Send] Raw attachments type:', typeof rawAttachments, 'isArray:', Array.isArray(rawAttachments))
    console.log('[Email Send] Raw attachments from request:', rawAttachments?.length, 'Processed:', attachments.length)
    if (attachments.length > 0) {
      console.log('[Email Send] First attachment keys:', Object.keys(attachments[0]))
      console.log('[Email Send] First attachment content exists:', !!attachments[0]?.content)
      console.log('[Email Send] First attachment content length:', attachments[0]?.content?.length || 0)
    }

    // Validate required fields
    if (!from_account_id) {
      return NextResponse.json({ error: 'From account is required' }, { status: 400 })
    }

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 })
    }

    if (!subject && !reply_to_email_id) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    if (!body_text && !body_html) {
      return NextResponse.json({ error: 'Email body is required' }, { status: 400 })
    }

    // Get the sender's email account (use admin to bypass RLS for domain join)
    const { data: fromAccount } = await getSupabaseAdmin()
      .from('email_accounts')
      .select(`
        *,
        domain:email_domains(id, domain, verification_status, sendgrid_domain_id)
      `)
      .eq('id', from_account_id)
      .eq('user_id', userData.id)
      .eq('is_deleted', false)
      .single()

    if (!fromAccount) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 })
    }

    // Check if domain is verified (only for SendGrid accounts, not for Microsoft/Gmail)
    const isMicrosoftAccount = fromAccount.provider === 'microsoft'
    const isGmailAccount = fromAccount.provider === 'gmail'

    if (!isMicrosoftAccount && !isGmailAccount && fromAccount.domain?.verification_status !== 'verified') {
      return NextResponse.json(
        { error: 'Domain is not verified. Please complete DNS verification before sending emails.' },
        { status: 400 }
      )
    }

    // Parse recipients
    const toRecipients: EmailParticipant[] = to.map((email: string) => parseEmailAddress(email))
    const ccRecipients: EmailParticipant[] = cc?.map((email: string) => parseEmailAddress(email)) || []
    const bccRecipients: EmailParticipant[] = bcc?.map((email: string) => parseEmailAddress(email)) || []

    // Generate message ID
    const emailDomain = fromAccount.domain?.domain || fromAccount.email_address.split('@')[1]
    const messageId = generateMessageId(emailDomain)

    // Get reply headers if this is a reply
    let inReplyTo: string | null = null
    let references: string | null = null
    let existingThreadId = thread_id
    // Whether the message being replied to actually had a Message-ID we could
    // reference. Lets the send gate distinguish "we dropped the thread headers"
    // (a bug) from "the original never had one" (legacy inbound we must still
    // allow replies to).
    let canThread = false

    if (reply_to_email_id) {
      const { data: replyToEmail } = await supabase
        .from('emails')
        .select('message_id, references_header, thread_id, subject')
        .eq('id', reply_to_email_id)
        .single()

      if (replyToEmail) {
        inReplyTo = replyToEmail.message_id
        canThread = !!replyToEmail.message_id
        const existingRefs: string[] = Array.isArray(replyToEmail.references_header)
          ? replyToEmail.references_header
          : typeof replyToEmail.references_header === 'string'
            ? (replyToEmail.references_header as string).split(' ').filter(Boolean)
            : []
        if (replyToEmail.message_id && !existingRefs.includes(replyToEmail.message_id)) {
          existingRefs.push(replyToEmail.message_id)
        }
        references = existingRefs.join(' ')
        existingThreadId = replyToEmail.thread_id
      }
    }

    // ── Send gate ──────────────────────────────────────────────────────────
    // Normalize the outbound HTML, derive a canonical text/plain (so body_html
    // and body_text can't diverge), de-dupe References, and hard-block only the
    // unambiguous display failures (empty reply, content trapped in the quote,
    // duplicate/lost critical headers). See lib/email/send-gate.ts.
    const gate = runSendGate({
      bodyHtml: body_html,
      bodyText: body_text,
      isReply: !!reply_to_email_id,
      canThread,
      inReplyTo,
      references,
    })

    if (gate.warnings.length > 0) {
      console.warn('[Email Send] Send-gate warnings:', gate.warnings.join('; '))
    }

    if (!gate.ok) {
      console.warn(`[Email Send] Send blocked by gate (${gate.code}):`, gate.error)
      return NextResponse.json(
        { error: gate.error, code: gate.code },
        { status: 400 }
      )
    }

    // Adopt the gate's normalized/canonical output for everything downstream.
    body_html = gate.bodyHtml
    body_text = gate.bodyText
    references = gate.references

    // Create or get thread
    let finalThreadId = existingThreadId

    if (!finalThreadId) {
      // Create new thread
      const { data: newThread, error: threadError } = await getSupabaseAdmin()
        .from('email_threads')
        .insert({
          email_account_id: from_account_id,
          // Stamp org explicitly: the admin (service-role) client has no
          // auth.uid(), so the set_organization_id trigger would leave this NULL,
          // and org-isolation RLS would then hide the sent thread from the user.
          organization_id: fromAccount.organization_id,
          subject: subject || '(no subject)',
          folder: 'sent',
          is_read: true,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (threadError) {
        console.error('Error creating thread:', threadError)
        console.error('Attempted with email_account_id:', from_account_id)
        return NextResponse.json({ error: 'Failed to create email thread: ' + threadError.message }, { status: 500 })
      }

      finalThreadId = newThread.id
    }

    // Build email headers
    // Note: messageId already includes angle brackets from generateMessageId()
    const headers: Record<string, string> = {
      'Message-ID': messageId,
    }

    if (inReplyTo) {
      headers['In-Reply-To'] = inReplyTo
    }

    if (references) {
      headers['References'] = references
    }

    // Calculate undo timestamps if enabled
    const now = new Date()
    const undoEnabled = enable_undo && !schedule_at
    const sendAfter = undoEnabled ? new Date(now.getTime() + undo_seconds * 1000) : null
    const canUndoUntil = undoEnabled ? sendAfter : null

    // Create email record in database (status: sending or queued)
    const emailId = uuidv4()
    const { error: emailError } = await getSupabaseAdmin()
      .from('emails')
      .insert({
        id: emailId,
        thread_id: finalThreadId,
        email_account_id: from_account_id,
        // Stamp org explicitly — admin client bypasses the auth.uid()-based
        // set_organization_id trigger, so without this the row is NULL-org and
        // hidden from the sender by org-isolation RLS (missing from Sent).
        organization_id: fromAccount.organization_id,
        message_id: messageId,
        in_reply_to: inReplyTo,
        references_header: references ? references.split(' ') : null,
        from_address: fromAccount.email_address,
        from_name: fromAccount.display_name,
        to_addresses: toRecipients.map(r => ({ email: r.email, name: r.name || null })),
        cc_addresses: ccRecipients.length > 0 ? ccRecipients.map(r => ({ email: r.email, name: r.name || null })) : [],
        bcc_addresses: bccRecipients.length > 0 ? bccRecipients.map(r => ({ email: r.email, name: r.name || null })) : [],
        subject: subject || '',
        body_text,
        body_html,
        snippet: generateSnippet(body_text || stripHtml(body_html || '')),
        status: schedule_at || undoEnabled ? 'queued' : 'sending',
        is_inbound: false,
        is_read: true,
        scheduled_at: schedule_at || null,
        send_after: sendAfter?.toISOString() || null,
        can_undo_until: canUndoUntil?.toISOString() || null,
      })

    if (emailError) {
      console.error('Error creating email record:', emailError)
      return NextResponse.json({ error: 'Failed to create email record: ' + emailError.message }, { status: 500 })
    }

    // Attachments uploaded directly to storage arrive with a storage_path but no
    // inline base64 content (to bypass the serverless body-size limit). Download
    // their bytes here so the rest of the flow (persistence + provider send) works.
    if (attachments && attachments.length > 0) {
      const admin = getSupabaseAdmin()
      for (const att of attachments) {
        if (!att.content && att.storage_path) {
          try {
            const { data: blob, error: dlErr } = await admin.storage
              .from('email-attachments')
              .download(att.storage_path)
            if (dlErr || !blob) {
              console.error('[Email Send] Failed to download staged attachment:', att.storage_path, dlErr)
              continue
            }
            const buf = Buffer.from(await blob.arrayBuffer())
            att.content = buf.toString('base64')
            att.size = att.size || buf.length
          } catch (e) {
            console.error('[Email Send] Error fetching staged attachment:', att.storage_path, e)
          }
        }
      }
    }

    // Handle attachments if provided - upload to Supabase Storage for persistence
    if (attachments && attachments.length > 0) {
      const admin = getSupabaseAdmin()

      for (const att of attachments) {
        try {
          // Skip if no content (shouldn't happen, but safety check)
          if (!att.content) {
            console.warn('[Email Send] Attachment missing content:', att.filename)
            continue
          }

          // Decode base64 content to buffer
          const contentBuffer = Buffer.from(att.content, 'base64')

          // Generate storage path: emails/{account_id}/{email_id}/{filename}
          const storagePath = `emails/${from_account_id}/${emailId}/${att.filename}`

          // Upload to Supabase Storage
          const { error: uploadError } = await admin.storage
            .from('email-attachments')
            .upload(storagePath, contentBuffer, {
              contentType: att.content_type || 'application/octet-stream',
              upsert: true,
            })

          if (uploadError) {
            console.error('[Email Send] Failed to upload attachment:', att.filename, uploadError)
            // Continue to create record even if upload fails (attachment still sent via provider)
          }

          // Get public URL
          const { data: urlData } = admin.storage
            .from('email-attachments')
            .getPublicUrl(storagePath)

          const publicUrl = urlData?.publicUrl || null

          // Create attachment record with storage info
          await admin.from('email_attachments').insert({
            email_id: emailId,
            filename: att.filename,
            content_type: att.content_type || 'application/octet-stream',
            size_bytes: att.size || contentBuffer.length,
            storage_path: storagePath,
            public_url: publicUrl,
            content_id: att.content_id || null,
            is_inline: att.is_inline || false,
          })

          console.log('[Email Send] Attachment stored:', att.filename, 'at', storagePath)
        } catch (attError) {
          console.error('[Email Send] Error processing attachment:', att.filename, attError)
        }
      }

      // Update email has_attachments flag
      await admin
        .from('emails')
        .update({ has_attachments: true })
        .eq('id', emailId)
    }

    // If scheduled, don't send now
    if (schedule_at) {
      return NextResponse.json({
        success: true,
        email_id: emailId,
        thread_id: finalThreadId,
        scheduled_for: schedule_at,
        message: 'Email scheduled successfully',
      })
    }

    // If undo is enabled, return now and wait for confirm
    if (undoEnabled) {
      return NextResponse.json({
        success: true,
        email_id: emailId,
        thread_id: finalThreadId,
        undo_enabled: true,
        undo_seconds: undo_seconds,
        can_undo_until: canUndoUntil?.toISOString(),
        recipient_count: toRecipients.length + ccRecipients.length + bccRecipients.length,
        message: 'Email queued - confirm to send',
      })
    }

    // Send email via appropriate provider
    try {
      if (isMicrosoftAccount) {
        // Send via Microsoft Graph API
        // Get Microsoft OAuth tokens for this account
        const { data: tokenData } = await getSupabaseAdmin()
          .from('microsoft_oauth_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', userData.id)
          .eq('email', fromAccount.email_address.toLowerCase())
          .single()

        if (!tokenData) {
          return NextResponse.json(
            { error: 'Microsoft account not connected. Please reconnect your Outlook account.' },
            { status: 400 }
          )
        }

        // Get valid access token (refresh if needed)
        const accessToken = await getValidAccessToken(
          tokenData.access_token,
          tokenData.refresh_token,
          tokenData.expires_at,
          async (newTokens: any) => {
            // Update tokens in database
            await getSupabaseAdmin()
              .from('microsoft_oauth_tokens')
              .update({
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token || tokenData.refresh_token,
                expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
              })
              .eq('user_id', userData.id)
              .eq('email', fromAccount.email_address.toLowerCase())
          }
        )

        // Log attachment info for debugging
        console.log('[Email Send] Attachments received:', attachments?.length || 0)
        if (attachments?.length > 0) {
          attachments.forEach((att: any, idx: number) => {
            console.log(`[Email Send] Attachment ${idx + 1}:`, {
              filename: att.filename,
              content_type: att.content_type,
              size: att.size,
              contentLength: att.content?.length || 0,
            })
          })
        }

        // Check if any attachment exceeds the inline limit
        const hasLargeAttachments = attachments?.some((att: any) => {
          // Base64 encoded size is roughly 4/3 of original size
          const estimatedSize = att.content ? (att.content.length * 3) / 4 : 0
          return estimatedSize > MS_GRAPH_INLINE_ATTACHMENT_LIMIT
        })

        const messageData = {
          to: toRecipients.map(r => ({
            emailAddress: { address: r.email, name: r.name || undefined }
          })),
          cc: ccRecipients.length > 0 ? ccRecipients.map(r => ({
            emailAddress: { address: r.email, name: r.name || undefined }
          })) : undefined,
          bcc: bccRecipients.length > 0 ? bccRecipients.map(r => ({
            emailAddress: { address: r.email, name: r.name || undefined }
          })) : undefined,
          subject: subject || '',
          body: {
            contentType: (body_html ? 'html' : 'text') as 'html' | 'text',
            content: body_html || body_text || '',
          },
        }

        if (hasLargeAttachments && attachments?.length > 0) {
          // Use upload session for large attachments
          console.log('[Email Send] Using upload session for large attachments')
          await sendEmailWithLargeAttachments(accessToken, messageData, attachments.map((att: any) => ({
            name: att.filename,
            contentType: att.content_type || 'application/octet-stream',
            contentBytes: att.content,
            size: att.size || Math.ceil((att.content?.length || 0) * 3 / 4),
          })))
        } else {
          // Prepare Microsoft Graph attachments for inline sending
          const msAttachments = attachments?.map((att: any) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.content_type || 'application/octet-stream',
            contentBytes: att.content, // base64 encoded
          }))

          console.log('[Email Send] Sending with inline attachments:', msAttachments?.length || 0)
          if (msAttachments?.length > 0) {
            console.log('[Email Send] First attachment contentBytes length:', msAttachments[0].contentBytes?.length || 0)
          }

          // Send via Microsoft Graph
          await sendMicrosoftEmail(accessToken, {
            ...messageData,
            attachments: msAttachments,
          })
        }

        // Update email status to sent
        await getSupabaseAdmin()
          .from('emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', emailId)
      } else if (isGmailAccount) {
        // Send via Gmail API
        console.log('[Email Send] Sending via Gmail API')
        console.log('[Email Send] From:', fromAccount.email_address)
        console.log('[Email Send] To:', toRecipients.map(r => r.email))

        // Get Google OAuth tokens for this account
        const { data: tokenData, error: tokenError } = await getSupabaseAdmin()
          .from('google_oauth_tokens')
          .select('id, access_token, refresh_token, expires_at')
          .eq('user_id', userData.id)
          .eq('email', fromAccount.email_address.toLowerCase())
          .single()

        if (tokenError) {
          console.error('[Email Send] Gmail token lookup error:', tokenError)
        }

        if (!tokenData) {
          console.error('[Email Send] No Gmail token found for:', fromAccount.email_address)
          return NextResponse.json(
            { error: 'Gmail account not connected. Please reconnect your Google account.' },
            { status: 400 }
          )
        }

        console.log('[Email Send] Gmail token found, expires_at:', tokenData.expires_at)

        // Get valid access token (refresh if needed)
        let accessToken: string
        try {
          const token = await getValidGmailAccessToken(tokenData)
          if (!token) {
            throw new Error('Gmail access token unavailable')
          }
          accessToken = token
          console.log('[Email Send] Gmail access token obtained')
        } catch (tokenRefreshError: any) {
          console.error('[Email Send] Gmail token refresh error:', tokenRefreshError)
          return NextResponse.json(
            { error: `Gmail authentication failed: ${tokenRefreshError.message}. Please reconnect your Google account.` },
            { status: 401 }
          )
        }

        // Prepare Gmail attachments
        const gmailAttachments = attachments?.map((att: any) => ({
          filename: att.filename,
          contentType: att.content_type || 'application/octet-stream',
          content: att.content, // base64 encoded
          contentId: att.content_id,
        }))

        // Create RFC 2822 message with attachments
        const rfc2822Message = createRfc2822Message({
          from: {
            email: fromAccount.email_address,
            name: fromAccount.display_name || undefined,
          },
          to: toRecipients.map(r => ({ email: r.email, name: r.name || undefined })),
          cc: ccRecipients.length > 0 ? ccRecipients.map(r => ({ email: r.email, name: r.name || undefined })) : undefined,
          bcc: bccRecipients.length > 0 ? bccRecipients.map(r => ({ email: r.email, name: r.name || undefined })) : undefined,
          subject: subject || '',
          bodyHtml: body_html,
          bodyText: body_text,
          inReplyTo: inReplyTo || undefined,
          references: references || undefined,
          attachments: gmailAttachments,
        })

        // Encode and send via Gmail API
        const raw = encodeToBase64Url(rfc2822Message)
        console.log('[Email Send] Gmail message encoded, length:', raw.length)

        let result
        try {
          result = await sendGmailMessage(accessToken, raw)
          console.log('[Email Send] Gmail message sent:', result.id)
        } catch (gmailSendError: any) {
          console.error('[Email Send] Gmail API send error:', gmailSendError)
          throw new Error(`Gmail send failed: ${gmailSendError.message}`)
        }

        // Update email status to sent
        await getSupabaseAdmin()
          .from('emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            graph_message_id: result.id, // Store Gmail message ID
            graph_conversation_id: result.threadId, // Store Gmail thread ID
          })
          .eq('id', emailId)
      } else {
        // Send via SendGrid
        console.log('[Email Send] Sending via SendGrid')
        console.log('[Email Send] From:', fromAccount.email_address)
        console.log('[Email Send] To:', toRecipients.map(r => r.email))

        // Check if SendGrid API key is configured (primary or Meridian/other account)
        if (!process.env.SENDGRID_API_KEY && !process.env.OTHER_SENDGRID_API_KEY) {
          throw new Error('SendGrid API key is not configured')
        }

        // Prepare SendGrid attachments
        const sgAttachments = attachments?.map((att: any) => ({
          content: att.content, // base64 encoded
          filename: att.filename,
          type: att.content_type,
          disposition: (att.is_inline ? 'inline' : 'attachment') as 'inline' | 'attachment',
          contentId: att.content_id,
        }))

        const result = await sendSendgridEmail({
          to: toRecipients,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
          from: {
            email: fromAccount.email_address,
            name: fromAccount.display_name || undefined,
          },
          subject: subject || '',
          text: body_text,
          html: body_html,
          headers,
          attachments: sgAttachments,
          trackingSettings: {
            clickTracking: { enable: true },
            openTracking: { enable: true },
          },
        })

        // Update email status to sent
        await getSupabaseAdmin()
          .from('emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            sendgrid_message_id: result.messageId,
          })
          .eq('id', emailId)
      }

      // Update thread's last_message_at
      await getSupabaseAdmin()
        .from('email_threads')
        .update({
          last_message_at: new Date().toISOString(),
          snippet: generateSnippet(body_text || stripHtml(body_html || '')),
        })
        .eq('id', finalThreadId)

      // Process email for AI analysis, lead linking, and task generation (async, don't wait)
      processEmailForAI(
        emailId,
        fromAccount.email_address,
        fromAccount.display_name,
        toRecipients.map(r => r.email),
        subject || '',
        body_text,
        body_html,
        false, // isInbound = false for outgoing
        userData.id
      ).then((aiResult) => {
        console.log(`AI processing complete for sent email ${emailId}:`, {
          linkedLead: aiResult.linkedLead,
          linkedContact: aiResult.linkedContact,
          tasksCreated: aiResult.tasksCreated.length,
          hasSummary: !!aiResult.analysis?.summary,
        })
      }).catch((err) => {
        console.error(`AI processing failed for sent email ${emailId}:`, err)
      })

      // Invalidate the email folder routes so the just-sent message shows up
      // immediately instead of being served from a stale cached render.
      revalidatePath('/dashboard/email/sent')
      revalidatePath('/dashboard/email')

      return NextResponse.json({
        success: true,
        email_id: emailId,
        thread_id: finalThreadId,
      })
    } catch (sendError: any) {
      console.error('[Email Send] Send error:', sendError)
      console.error('[Email Send] Error message:', sendError?.message)
      console.error('[Email Send] Error stack:', sendError?.stack)

      // Update email status to failed
      await getSupabaseAdmin()
        .from('emails')
        .update({
          status: 'failed',
        })
        .eq('id', emailId)

      const errorMessage = sendError?.message || 'Unknown send error'
      return NextResponse.json(
        { error: `Failed to send email: ${errorMessage}` },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[Email Send] Fatal error:', error)
    console.error('[Email Send] Error message:', error?.message)
    console.error('[Email Send] Error stack:', error?.stack)
    return NextResponse.json(
      { error: `Internal server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    )
  }
}
