import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseEmailAddress, generateSnippet, stripHtml, parseReferences } from '@/lib/email-utils'
import { decodeQuotedPrintable } from '@/lib/quoted-printable'
import { repairUtf8Mojibake } from '@/lib/mojibake'
import { v4 as uuidv4 } from 'uuid'
import { processEmailForAI } from '@/lib/email-ai'
import { syncCalendarInvitesForEmail } from '@/lib/calendar/sync-email-invites'
import { forwardHelloInboundEmail, InboundForwardAttachment } from '@/lib/email/inbound-forwarding'

/**
 * Coerce a (possibly malformed) MIME content-type into a value that Supabase
 * Storage will accept as a Content-Type header. Strips parameters/whitespace
 * and falls back to a generic binary type when it isn't a valid "type/subtype".
 * Prevents 415 "Invalid Content-Type header" errors on attachment uploads.
 */
function sanitizeContentType(ct?: string | null): string {
  const fallback = 'application/octet-stream'
  if (!ct) return fallback
  const base = ct.split(/[;\s]/)[0].trim().toLowerCase()
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(base) ? base : fallback
}

/**
 * Parse MIME multipart content to extract text and HTML parts
 * Handles nested multipart structures (e.g., multipart/related containing multipart/alternative)
 */
function parseMimeContent(mimeContent: string, depth: number = 0): { text: string | null; html: string | null; headers: string | null } {
  let text: string | null = null
  let html: string | null = null
  let headers: string | null = null

  // Prevent infinite recursion
  if (depth > 5) {
    console.error('[parseMimeContent] Max recursion depth reached')
    return { text, html, headers }
  }

  try {
    // Split headers from body
    const headerBodySplit = mimeContent.split(/\r?\n\r?\n/)
    if (headerBodySplit.length >= 2) {
      const possibleHeaders = headerBodySplit[0]
      if (possibleHeaders.includes('Content-Type:') || possibleHeaders.includes('From:')) {
        headers = possibleHeaders
      }
    }

    // Find boundary marker
    const boundaryMatch = mimeContent.match(/boundary="?([^"\r\n;]+)"?/i)
    if (!boundaryMatch) {
      // Not multipart, check if it's plain HTML or text
      const cleanContent = mimeContent.replace(/^[\s\S]*?\r?\n\r?\n/, '') // Remove headers
      if (cleanContent.includes('<html') || cleanContent.includes('<div') || cleanContent.includes('<p>')) {
        html = cleanContent
      } else {
        text = cleanContent
      }
      return { text, html, headers }
    }

    const boundary = boundaryMatch[1].trim()
    console.log(`[parseMimeContent] Found boundary at depth ${depth}:`, boundary.slice(0, 50))

    const parts = mimeContent.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

    for (const part of parts) {
      if (part.trim() === '' || part.trim() === '--') continue

      // Extract content type
      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i)
      if (!contentTypeMatch) continue

      const contentType = contentTypeMatch[1].toLowerCase().trim()

      // Check if this part is itself multipart (nested)
      if (contentType.includes('multipart/')) {
        console.log(`[parseMimeContent] Found nested multipart at depth ${depth}:`, contentType)
        const nestedResult = parseMimeContent(part, depth + 1)
        if (nestedResult.text && !text) text = nestedResult.text
        if (nestedResult.html && !html) html = nestedResult.html
        continue
      }

      // Find where headers end and content begins
      const contentMatch = part.match(/\r?\n\r?\n([\s\S]*)/)
      if (!contentMatch) continue

      let content = contentMatch[1].trim()

      // Handle quoted-printable encoding
      if (part.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
        content = decodeQuotedPrintable(content)
      }

      // Handle base64 encoding
      if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
        try {
          content = Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf-8')
        } catch {
          // Keep original if decode fails
        }
      }

      if (contentType.includes('text/plain') && !text) {
        text = content
        console.log(`[parseMimeContent] Found text/plain at depth ${depth}, length:`, content.length)
      } else if (contentType.includes('text/html') && !html) {
        html = content
        console.log(`[parseMimeContent] Found text/html at depth ${depth}, length:`, content.length)
      }
    }
  } catch (e) {
    console.error('[parseMimeContent] Error:', e)
  }

  return { text, html, headers }
}

/**
 * Extract attachments from raw MIME content
 */
interface MimeAttachment {
  filename: string
  contentType: string
  content: Buffer
  contentId?: string
}

function parseMimeAttachments(mimeContent: string, depth: number = 0): MimeAttachment[] {
  const attachments: MimeAttachment[] = []

  // Prevent infinite recursion
  if (depth > 5) return attachments

  try {
    // Find boundary marker
    const boundaryMatch = mimeContent.match(/boundary="?([^"\r\n;]+)"?/i)
    if (!boundaryMatch) return attachments

    const boundary = boundaryMatch[1].trim()
    const parts = mimeContent.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

    for (const part of parts) {
      if (part.trim() === '' || part.trim() === '--') continue

      // Extract content type
      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i)
      if (!contentTypeMatch) continue

      const contentType = contentTypeMatch[1].toLowerCase().trim()

      // Check if this part is itself multipart (nested)
      if (contentType.includes('multipart/')) {
        const nestedAttachments = parseMimeAttachments(part, depth + 1)
        attachments.push(...nestedAttachments)
        continue
      }

      // Skip text/plain and text/html (those are the email body, not attachments)
      // Unless they have Content-Disposition: attachment
      const hasAttachmentDisposition = part.toLowerCase().includes('content-disposition: attachment') ||
        part.toLowerCase().includes('content-disposition:attachment')

      if (!hasAttachmentDisposition) {
        if (contentType.includes('text/plain') || contentType.includes('text/html')) {
          continue
        }
      }

      // Extract filename
      let filename = ''
      const filenameMatch = part.match(/filename="?([^"\r\n;]+)"?/i) ||
        part.match(/name="?([^"\r\n;]+)"?/i)
      if (filenameMatch) {
        filename = filenameMatch[1].trim()
        // Decode if encoded (e.g., =?UTF-8?B?...?=)
        if (filename.startsWith('=?')) {
          try {
            const encodingMatch = filename.match(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/i)
            if (encodingMatch) {
              const [, , encoding, encoded] = encodingMatch
              if (encoding.toUpperCase() === 'B') {
                filename = Buffer.from(encoded, 'base64').toString('utf-8')
              }
            }
          } catch {
            // Keep original filename if decode fails
          }
        }
      }

      if (!filename) {
        // Generate a filename based on content type
        const ext = contentType.split('/')[1]?.split(';')[0] || 'bin'
        filename = `attachment_${Date.now()}.${ext}`
      }

      // Extract content-id for inline images
      const contentIdMatch = part.match(/Content-ID:\s*<?([^>\r\n]+)>?/i)
      const contentId = contentIdMatch ? contentIdMatch[1] : undefined

      // Find where headers end and content begins
      const contentMatch = part.match(/\r?\n\r?\n([\s\S]*)/)
      if (!contentMatch) continue

      const rawContent = contentMatch[1].trim()

      // Check encoding and decode
      const isBase64 = part.toLowerCase().includes('content-transfer-encoding: base64')

      let contentBuffer: Buffer
      if (isBase64) {
        try {
          contentBuffer = Buffer.from(rawContent.replace(/\s/g, ''), 'base64')
        } catch {
          console.error('[parseMimeAttachments] Failed to decode base64 for:', filename)
          continue
        }
      } else {
        contentBuffer = Buffer.from(rawContent)
      }

      // Skip phantom parts with no actual content. Empty MIME parts (and the
      // structural/epilogue fragments some emails contain) were being saved as
      // bogus 0-byte "attachment_<n>.bin" files on nearly every email. A real
      // attachment always has bytes, so this never drops a genuine file.
      if (contentBuffer.length === 0) {
        continue
      }

      console.log('[parseMimeAttachments] Found attachment:', {
        filename,
        contentType,
        size: contentBuffer.length,
        hasContentId: !!contentId,
      })

      attachments.push({
        filename,
        contentType,
        content: contentBuffer,
        contentId,
      })
    }
  } catch (e) {
    console.error('[parseMimeAttachments] Error:', e)
  }

  return attachments
}

// POST /api/email/webhooks/sendgrid/inbound - Handle inbound emails from SendGrid
export async function POST(request: NextRequest) {
  try {
    // Parse the multipart form data from SendGrid
    const formData = await request.formData()

    // Debug: Log all form data keys
    const formDataKeys = Array.from(formData.keys())
    console.log('[SendGrid Inbound] Form data keys:', formDataKeys)

    // Extract email data from SendGrid's Inbound Parse
    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const cc = formData.get('cc') as string | null
    const subject = formData.get('subject') as string
    const text = formData.get('text') as string | null
    const html = formData.get('html') as string | null
    const headers = formData.get('headers') as string | null
    const attachmentInfo = formData.get('attachment-info') as string | null
    const spamScore = formData.get('spam_score') as string | null

    // Check for raw email (when Inbound Parse is set to "Raw")
    const rawEmail = formData.get('email') as string | null

    // Pre-uploaded attachments path: posts forwarded by the inbound-email-service
    // (Railway) arrive with attachments already in Storage and only references in
    // a `preuploaded-attachments` field, letting large emails bypass Vercel's
    // ~4.5MB request-body limit. Authenticate these with a shared secret.
    const preUploadedRaw = formData.get('preuploaded-attachments') as string | null
    let preUploadedAttachments:
      | Array<{
          filename: string
          content_type: string
          size_bytes: number
          storage_path: string
          public_url: string | null
          content_id: string | null
        }>
      | null = null
    if (preUploadedRaw != null) {
      const provided = request.headers.get('x-inbound-secret')
      const expected = process.env.INBOUND_FORWARD_SECRET
      if (!expected || provided !== expected) {
        console.error('[SendGrid Inbound] Rejected pre-uploaded payload: bad/missing secret')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      try {
        preUploadedAttachments = JSON.parse(preUploadedRaw)
      } catch {
        preUploadedAttachments = []
      }
    }

    console.log('[SendGrid Inbound] Email received:', {
      from,
      to,
      subject,
      hasText: !!text,
      textLength: text?.length || 0,
      hasHtml: !!html,
      htmlLength: html?.length || 0,
      hasHeaders: !!headers,
      hasRawEmail: !!rawEmail,
      rawEmailLength: rawEmail?.length || 0,
      hasAttachmentInfo: !!attachmentInfo,
      attachmentInfo: attachmentInfo || null,
    })

    // Log all form data keys that look like attachments
    const attachmentKeys = formDataKeys.filter(k => k.startsWith('attachment') || k.match(/^file\d*$/))
    if (attachmentKeys.length > 0) {
      console.log('[SendGrid Inbound] Attachment keys found:', attachmentKeys)
    }

    // If text and html are empty but we have raw email, parse it
    let finalText = text
    let finalHtml = html
    let finalHeaders = headers

    // Check if html field contains raw MIME (starts with boundary marker)
    const isMimeContent = (content: string | null) =>
      content && (content.trim().startsWith('--') || content.includes('Content-Type:'))

    if (isMimeContent(html) || isMimeContent(text)) {
      console.log('[SendGrid Inbound] Detected MIME content in fields, parsing...')
      const mimeContent = html || text || ''
      const parsed = parseMimeContent(mimeContent)
      finalText = parsed.text || finalText
      finalHtml = parsed.html || finalHtml
    }

    // Parse attachments from raw MIME if no attachment-info provided
    let rawMimeAttachments: MimeAttachment[] = []

    if ((!finalText && !finalHtml) && rawEmail) {
      console.log('[SendGrid Inbound] No text/html, attempting to parse raw email')
      try {
        const parsed = parseMimeContent(rawEmail)
        finalText = parsed.text
        finalHtml = parsed.html
        finalHeaders = parsed.headers || finalHeaders
        console.log('[SendGrid Inbound] Parsed raw email, text:', finalText?.length || 0, 'html:', finalHtml?.length || 0)
      } catch (parseError) {
        console.error('[SendGrid Inbound] Failed to parse raw email:', parseError)
      }
    }

    // Extract attachments from raw MIME if present (for Raw mode)
    if (rawEmail && !attachmentInfo) {
      console.log('[SendGrid Inbound] Parsing attachments from raw MIME...')
      rawMimeAttachments = parseMimeAttachments(rawEmail)
      console.log('[SendGrid Inbound] Found', rawMimeAttachments.length, 'attachments in raw MIME')
    }

    // Repair UTF-8 bodies that upstream decoded one step too far as Latin-1 /
    // Windows-1252 (e.g. "HiÂ Devin,Â" from a non-breaking space). Done once
    // here so the stored body, snippet, and AI input are all clean. No-op on
    // already-correct content.
    if (finalText) finalText = repairUtf8Mojibake(finalText)
    if (finalHtml) finalHtml = repairUtf8Mojibake(finalHtml)

    // Parse sender
    const fromParsed = parseEmailAddress(from)

    // Parse recipients
    const toAddresses = to ? to.split(',').map(e => parseEmailAddress(e.trim()).email) : []
    const ccAddresses = cc ? cc.split(',').map(e => parseEmailAddress(e.trim()).email) : []

    // Find matching email account
    const { data: matchingAccounts } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('id, email_address, user_id, organization_id')
      .in('email_address', [...toAddresses, ...ccAddresses])
      .eq('is_deleted', false)
      .eq('is_active', true)

    if (!matchingAccounts || matchingAccounts.length === 0) {
      console.log('No matching email accounts found for:', toAddresses)
      return NextResponse.json({ received: true, processed: false, reason: 'No matching account' })
    }

    // Parse headers for threading
    let messageId: string | null = null
    let inReplyTo: string | null = null
    let references: string | null = null

    if (headers) {
      // Unfold folded header lines (RFC 5322: a header value can continue on
      // following lines that begin with whitespace) before scanning, so a
      // multi-line References / In-Reply-To header is captured in full rather
      // than just its first line. The previous split-and-startsWith logic only
      // ever saw the first line, which is why reply-linkage was almost never
      // recorded and inbound mail fell through to subject matching.
      const unfolded = headers
        .replace(/\r\n/g, '\n')
        .replace(/\n[ \t]+/g, ' ')
      for (const line of unfolded.split('\n')) {
        const colon = line.indexOf(':')
        if (colon === -1) continue
        const key = line.slice(0, colon).trim().toLowerCase()
        const value = line.slice(colon + 1).trim()
        if (key === 'message-id' && !messageId) messageId = value
        else if (key === 'in-reply-to' && !inReplyTo) inReplyTo = value
        else if (key === 'references' && !references) references = value
      }
    }

    // Determine if this is spam
    const isSpam = spamScore ? parseFloat(spamScore) > 5.0 : false

    // Process for each matching account
    for (const account of matchingAccounts) {
      const uploadedAttachments: Array<{
        filename: string
        mimeType: string
        size: number
        content: string
      }> = []
      const forwardAttachments: InboundForwardAttachment[] = []

      // Resolve the org for this account so every inbound row is org-stamped.
      // Inserts here use the service-role client, which bypasses the
      // set_organization_id trigger (no auth.uid()), so a NULL org would make
      // these rows globally visible under the org-isolation RLS policy.
      let accountOrgId: string | null = account.organization_id ?? null
      if (!accountOrgId) {
        const { data: accountUser } = await getSupabaseAdmin()
          .from('users')
          .select('organization_id')
          .eq('id', account.user_id)
          .single()
        accountOrgId = accountUser?.organization_id ?? null
      }

      // Try to find existing thread
      let threadId: string | null = null

      if (inReplyTo || references) {
        // Search for an existing message whose Message-ID matches one of this
        // email's references. Scoped to THIS account only (per-account
        // isolation). Uses .in() rather than a hand-built .or() string so
        // angle-bracketed Message-IDs can't corrupt the filter expression.
        const refsToSearch = [inReplyTo, ...(references ? parseReferences(references) : [])]
          .filter((r): r is string => !!r)

        if (refsToSearch.length > 0) {
          const { data: existingEmail } = await getSupabaseAdmin()
            .from('emails')
            .select('thread_id')
            .eq('email_account_id', account.id)
            .in('message_id', refsToSearch)
            .not('thread_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (existingEmail?.thread_id) {
            threadId = existingEmail.thread_id
          }
        }
      }

      // If headers didn't link this message to a thread, fall back to subject —
      // but ONLY merge into a thread we've ALREADY exchanged mail with this same
      // correspondent on. Matching on subject alone merged unrelated
      // conversations that merely shared a subject line (e.g. "Next Steps",
      // "Re: Quote") into a single thread; requiring a shared participant keeps
      // distinct conversations apart. Still scoped to THIS account only.
      if (!threadId && subject) {
        const normalizeSubject = (s: string) =>
          s.replace(/^((re|fwd|fw)\s*:\s*)+/gi, '').trim().toLowerCase()
        const cleaned = normalizeSubject(subject)
        const senderEmail = (fromParsed.email || '').toLowerCase()

        // Only match if the subject is meaningful (avoid "hi", "hey", etc.)
        if (cleaned.length > 3 && senderEmail) {
          // Escape LIKE wildcards so subjects containing % or _ match literally.
          const likeSuffix = cleaned.replace(/([\\%_])/g, '\\$1')
          // Coarse prefilter: any message whose subject ends with this cleaned
          // subject (covers "Re:"/"Fwd:" prefixes). The exact normalized-subject
          // and shared-participant checks below are the real gate.
          const { data: candidates } = await getSupabaseAdmin()
            .from('emails')
            .select('thread_id, subject, from_address, to_addresses, cc_addresses')
            .eq('email_account_id', account.id)
            .not('thread_id', 'is', null)
            .ilike('subject', `%${likeSuffix}`)
            .order('created_at', { ascending: false })
            .limit(100)

          const match = (candidates || []).find((m) => {
            if (normalizeSubject(m.subject || '') !== cleaned) return false
            const parties = [
              (m.from_address || '').toLowerCase(),
              ...(((m.to_addresses as Array<{ email?: string }> | null) || []).map((r) => (r.email || '').toLowerCase())),
              ...(((m.cc_addresses as Array<{ email?: string }> | null) || []).map((r) => (r.email || '').toLowerCase())),
            ]
            return parties.includes(senderEmail)
          })

          if (match?.thread_id) {
            threadId = match.thread_id
            console.log('[SendGrid Inbound] Matched thread by subject + shared participant:', threadId)
          }
        }
      }

      // Create new thread if needed
      if (!threadId) {
        const { data: newThread, error: threadError } = await getSupabaseAdmin()
          .from('email_threads')
          .insert({
            email_account_id: account.id,
            organization_id: accountOrgId,
            subject: subject || '(no subject)',
            folder: isSpam ? 'spam' : 'inbox',
            is_read: false,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (threadError) {
          console.error('Error creating thread:', threadError)
          continue
        }

        threadId = newThread.id
      } else {
        // Update existing thread
        await getSupabaseAdmin()
          .from('email_threads')
          .update({
            is_read: false,
            last_message_at: new Date().toISOString(),
            folder: isSpam ? 'spam' : 'inbox',
          })
          .eq('id', threadId)
      }

      // Create email record
      const emailId = uuidv4()
      const emailSnippet = generateSnippet(finalText || stripHtml(finalHtml || ''))

      console.log('[SendGrid Inbound] Inserting email:', {
        emailId,
        threadId,
        accountId: account.id,
        hasBodyText: !!finalText,
        bodyTextLength: finalText?.length || 0,
        hasBodyHtml: !!finalHtml,
        bodyHtmlLength: finalHtml?.length || 0,
        snippetLength: emailSnippet?.length || 0,
      })

      const { error: emailError } = await getSupabaseAdmin()
        .from('emails')
        .insert({
          id: emailId,
          thread_id: threadId,
          email_account_id: account.id,
          organization_id: accountOrgId,
          message_id: messageId,
          in_reply_to: inReplyTo,
          references_header: references ? references.split(/\s+/) : null,
          from_address: fromParsed.email,
          from_name: fromParsed.name,
          to_addresses: toAddresses.map(email => ({ email, name: null })),
          cc_addresses: ccAddresses.length > 0 ? ccAddresses.map(email => ({ email, name: null })) : [],
          subject: subject || '',
          body_text: finalText,
          body_html: finalHtml,
          snippet: emailSnippet,
          status: 'delivered',
          is_inbound: true,
          is_read: false,
          headers: finalHeaders ? { raw: finalHeaders } : null,
        })

      if (emailError) {
        console.error('Error creating email:', emailError)
        continue
      }

      // Handle attachments
      if (preUploadedAttachments && preUploadedAttachments.length > 0) {
        // Forwarded by the inbound-email-service: bytes are already in Storage,
        // so just record each attachment against this account's email. Pull the
        // bytes back only when Nimbus needs them for analysis.
        const nimbusOn = process.env.EMAIL_AI_ENABLED === 'true' || process.env.NIMBUS_ANALYSIS_ENABLED === 'true'
        for (const ref of preUploadedAttachments) {
          await getSupabaseAdmin().from('email_attachments').insert({
            email_id: emailId,
            filename: ref.filename,
            content_type: ref.content_type,
            size_bytes: ref.size_bytes,
            storage_path: ref.storage_path,
            public_url: ref.public_url,
            content_id: ref.content_id || null,
            is_inline: ref.content_id ? true : false,
          })

          if (!ref.content_id) {
            try {
              const { data: blob } = await getSupabaseAdmin().storage
                .from('email-attachments')
                .download(ref.storage_path)
              if (blob) {
                const buf = Buffer.from(await blob.arrayBuffer())
                uploadedAttachments.push({
                  filename: ref.filename,
                  mimeType: ref.content_type,
                  size: ref.size_bytes,
                  content: buf.toString('base64'),
                })
                forwardAttachments.push({
                  filename: ref.filename,
                  type: ref.content_type,
                  content: buf.toString('base64'),
                  disposition: 'attachment',
                })
              }
            } catch (dlErr) {
              console.error('[SendGrid Inbound] Failed to download pre-uploaded attachment:', ref.filename, dlErr)
            }
          } else if (nimbusOn) {
            try {
              const { data: blob } = await getSupabaseAdmin().storage
                .from('email-attachments')
                .download(ref.storage_path)
              if (blob) {
                const buf = Buffer.from(await blob.arrayBuffer())
                uploadedAttachments.push({
                  filename: ref.filename,
                  mimeType: ref.content_type,
                  size: ref.size_bytes,
                  content: buf.toString('base64'),
                })
              }
            } catch (dlErr) {
              console.error('[SendGrid Inbound] Failed to download inline pre-uploaded attachment for analysis:', ref.filename, dlErr)
            }
          }
        }

        await getSupabaseAdmin()
          .from('email_threads')
          .update({ has_attachments: true })
          .eq('id', threadId)
      } else if (attachmentInfo) {
        try {
          const attachmentData = JSON.parse(attachmentInfo)
          console.log('[SendGrid Inbound] Parsed attachment-info:', attachmentData)

          for (const [key, info] of Object.entries(attachmentData)) {
            const attInfo = info as { filename?: string; type?: string; ['content-id']?: string }
            const fileData = formData.get(key) as File | null

            console.log('[SendGrid Inbound] Processing attachment:', {
              key,
              filename: attInfo.filename,
              type: attInfo.type,
              hasFileData: !!fileData,
              fileSize: fileData?.size || 0,
            })

            if (fileData && attInfo.filename) {
              // Upload to Supabase Storage
              const storagePath = `emails/${emailId}/${attInfo.filename}`
              const safeContentType = sanitizeContentType(attInfo.type)

              const { error: uploadError } = await getSupabaseAdmin().storage
                .from('email-attachments')
                .upload(storagePath, fileData, {
                  contentType: safeContentType,
                })

              if (uploadError) {
                console.error('Error uploading attachment:', uploadError)
                continue
              }

              // Get public URL
              const { data: { publicUrl } } = getSupabaseAdmin().storage
                .from('email-attachments')
                .getPublicUrl(storagePath)

              // Create attachment record
              await getSupabaseAdmin().from('email_attachments').insert({
                email_id: emailId,
                filename: attInfo.filename,
                content_type: safeContentType,
                size_bytes: fileData.size,
                storage_path: storagePath,
                public_url: publicUrl,
                content_id: attInfo['content-id'] || null,
                is_inline: attInfo['content-id'] ? true : false,
              })

              const attachmentBuffer = Buffer.from(await fileData.arrayBuffer())
              uploadedAttachments.push({
                filename: attInfo.filename,
                mimeType: attInfo.type || fileData.type || 'application/octet-stream',
                size: fileData.size,
                content: attachmentBuffer.toString('base64'),
              })
              if (!attInfo['content-id']) {
                forwardAttachments.push({
                  filename: attInfo.filename,
                  type: safeContentType,
                  content: attachmentBuffer.toString('base64'),
                  disposition: 'attachment',
                })
              }
            }
          }

          // Update thread has_attachments
          await getSupabaseAdmin()
            .from('email_threads')
            .update({ has_attachments: true })
            .eq('id', threadId)
        } catch (attError) {
          console.error('Error processing attachments:', attError)
        }
      } else if (rawMimeAttachments.length > 0) {
        // Handle attachments from raw MIME parsing
        console.log('[SendGrid Inbound] Processing', rawMimeAttachments.length, 'raw MIME attachments')
        try {
          for (const att of rawMimeAttachments) {
            // Upload to Supabase Storage
            const storagePath = `emails/${emailId}/${att.filename}`
            const safeContentType = sanitizeContentType(att.contentType)

            const { error: uploadError } = await getSupabaseAdmin().storage
              .from('email-attachments')
              .upload(storagePath, att.content, {
                contentType: safeContentType,
              })

            if (uploadError) {
              console.error('[SendGrid Inbound] Error uploading raw MIME attachment:', uploadError)
              continue
            }

            // Get public URL
            const { data: { publicUrl } } = getSupabaseAdmin().storage
              .from('email-attachments')
              .getPublicUrl(storagePath)

            // Create attachment record
            await getSupabaseAdmin().from('email_attachments').insert({
              email_id: emailId,
              filename: att.filename,
              content_type: safeContentType,
              size_bytes: att.content.length,
              storage_path: storagePath,
              public_url: publicUrl,
              content_id: att.contentId || null,
              is_inline: att.contentId ? true : false,
            })

            uploadedAttachments.push({
              filename: att.filename,
              mimeType: att.contentType,
              size: att.content.length,
              content: att.content.toString('base64'),
            })
            if (!att.contentId) {
              forwardAttachments.push({
                filename: att.filename,
                type: safeContentType,
                content: att.content.toString('base64'),
                disposition: 'attachment',
              })
            }

            console.log('[SendGrid Inbound] Uploaded raw MIME attachment:', att.filename)
          }

          // Update thread has_attachments
          await getSupabaseAdmin()
            .from('email_threads')
            .update({ has_attachments: true })
            .eq('id', threadId)
        } catch (attError) {
          console.error('[SendGrid Inbound] Error processing raw MIME attachments:', attError)
        }
      }

      console.log(`Email processed for account ${account.email_address}:`, {
        emailId,
        threadId,
        subject,
        from: fromParsed.email,
      })

      try {
        await forwardHelloInboundEmail({
          accountEmail: account.email_address,
          fromEmail: fromParsed.email,
          fromName: fromParsed.name || null,
          toAddresses,
          ccAddresses,
          subject,
          bodyText: finalText,
          bodyHtml: finalHtml,
          attachments: forwardAttachments,
          messageId,
        })
      } catch (forwardError) {
        console.error('[SendGrid Inbound] Failed to forward hello@ email:', forwardError)
      }

      try {
        // Process email for AI analysis, linking, and follow-up automations.
        const aiResult = await processEmailForAI(
          emailId,
          fromParsed.email,
          fromParsed.name || null,
          toAddresses,
          subject || '',
          finalText || null,
          finalHtml || null,
          true, // isInbound
          account.user_id
        )

        console.log(`AI processing complete for email ${emailId}:`, {
          linkedLead: aiResult.linkedLead,
          linkedContact: aiResult.linkedContact,
          tasksCreated: aiResult.tasksCreated.length,
          hasSummary: !!aiResult.analysis?.summary,
          leadCreated: aiResult.leadCreated,
          newLeadId: aiResult.newLeadId,
          funnelEnrolled: aiResult.funnelEnrollment?.enrolled || false,
          funnelName: aiResult.funnelEnrollment?.funnel_name || null,
        })

        // Tie any calendar invite (ICS / .calendar / text-calendar attachment)
        // to the byetalk calendar. Runs regardless of Nimbus — parsing an invite
        // is deterministic, not AI — and dedups by iCal UID so it's safe to retry.
        try {
          await syncCalendarInvitesForEmail({
            emailId,
            assignedTo: account.user_id,
            organizationId: accountOrgId,
            leadId: aiResult.linkedLead,
            contactId: aiResult.linkedContact,
            bodyText: finalText,
            bodyHtml: finalHtml,
          })
        } catch (calErr) {
          console.error('[SendGrid Inbound] Calendar invite sync failed:', calErr)
        }

        // Nimbus agreement / attachment AI is sales-CRM only — not enabled on VAAA.
      } catch (err) {
        console.error(`AI processing failed for email ${emailId}:`, err)
      }

      // Send notification to user's personal email/SMS (non-blocking)
      // Skip spam emails from notifications
      if (!isSpam) {
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.voicealchemyacademy.com'
          fetch(`${appUrl}/api/notifications/email-received`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.INTERNAL_API_SECRET
                ? { 'x-internal-secret': process.env.INTERNAL_API_SECRET }
                : {}),
            },
            body: JSON.stringify({
              emailId,
              threadId,
              userId: account.user_id,
              fromEmail: fromParsed.email,
              fromName: fromParsed.name,
              subject: subject || '(no subject)',
            }),
          }).catch(notifyError => {
            console.error('[SendGrid Inbound] Notification request failed:', notifyError)
          })
        } catch (notifyError) {
          console.error('[SendGrid Inbound] Failed to trigger notification:', notifyError)
        }
      }
    }

    return NextResponse.json({ received: true, processed: true })
  } catch (error) {
    console.error('Inbound webhook error:', error)
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }
}
