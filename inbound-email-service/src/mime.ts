/**
 * MIME helpers ported from the CRM's SendGrid inbound webhook so this service
 * can fully handle BOTH SendGrid Inbound Parse modes:
 *  - "parsed" (default): text/html + attachment-info + individual file fields
 *  - "raw": a single `email` field containing the full MIME message
 *
 * Kept dependency-free on purpose — this service ships with only supabase-js.
 */

export function sanitizeContentType(ct?: string | null): string {
  const fallback = 'application/octet-stream'
  if (!ct) return fallback
  const base = ct.split(/[;\s]/)[0].trim().toLowerCase()
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(base) ? base : fallback
}

export function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
}

export interface MimeAttachment {
  filename: string
  contentType: string
  content: Buffer
  contentId?: string
}

export interface FormPart {
  name: string
  filename?: string
  contentType?: string
  data: Buffer
}

/**
 * Minimal, binary-safe multipart/form-data parser used as a FALLBACK for Node's
 * built-in `Request(...).formData()` (undici), which throws
 * "Failed to parse body as FormData" on a subset of real SendGrid Inbound Parse
 * posts — silently dropping attachment-bearing email.
 *
 * It works directly on the raw Buffer, treats every part body as opaque bytes
 * (never decodes binary as text), and splits only on the OUTER form boundary,
 * which MIME guarantees does not occur inside any part's content. The huge `email`
 * field (raw MIME, with its own inner boundaries) is therefore passed through
 * untouched for parseMimeAttachments()/parseMimeContent() to handle downstream.
 */
export function parseMultipart(body: Buffer, contentType: string): FormPart[] {
  const m = /boundary="?([^";]+)"?/i.exec(contentType || '')
  if (!m) throw new Error('parseMultipart: no boundary in Content-Type')
  const boundary = m[1].trim()

  const dash = Buffer.from(`--${boundary}`)
  const start = body.indexOf(dash)
  if (start < 0) throw new Error('parseMultipart: boundary not found in body')

  // Detect the EOL from the bytes right after the first boundary token. SendGrid
  // sends standard CRLF; we tolerate LF-only as defense in depth. Only delimiter
  // detection depends on the EOL — part DATA is always sliced out as untouched
  // bytes, so binary attachments are never corrupted, whatever the EOL.
  const e = start + dash.length
  const eol = body[e] === 0x0d && body[e + 1] === 0x0a ? '\r\n' : body[e] === 0x0a ? '\n' : '\r\n'
  const eolBuf = Buffer.from(eol)
  const delim = Buffer.from(`${eol}--${boundary}`) // inter-part delimiter (incl. leading EOL)
  const sepSeq = eol + eol

  const parts: FormPart[] = []
  let pos = e // just past the first "--boundary"
  while (pos <= body.length) {
    // Closing delimiter is "--boundary--".
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break
    // Each opening boundary is followed by an EOL before the part headers.
    if (body.subarray(pos, pos + eolBuf.length).equals(eolBuf)) pos += eolBuf.length

    const next = body.indexOf(delim, pos)
    if (next < 0) break

    const part = body.subarray(pos, next)
    const sep = part.indexOf(sepSeq)
    if (sep >= 0) {
      const meta = parsePartHeaders(part.subarray(0, sep).toString('utf8'))
      if (meta) parts.push({ ...meta, data: part.subarray(sep + sepSeq.length) })
    }
    pos = next + delim.length
  }
  return parts
}

function parsePartHeaders(headerText: string): Omit<FormPart, 'data'> | null {
  let name: string | undefined
  let filename: string | undefined
  let contentType: string | undefined
  for (const line of headerText.split(/\r?\n/)) {
    if (/^content-disposition:/i.test(line)) {
      const n = /\bname="([^"]*)"/i.exec(line) || /\bname=([^;\r\n]+)/i.exec(line)
      const f = /\bfilename="([^"]*)"/i.exec(line) || /\bfilename=([^;\r\n]+)/i.exec(line)
      if (n) name = n[1].trim()
      if (f) filename = f[1].trim()
    } else if (/^content-type:/i.test(line)) {
      contentType = line.slice(line.indexOf(':') + 1).trim()
    }
  }
  if (!name) return null
  return { name, filename, contentType }
}

export function parseMimeContent(
  mimeContent: string,
  depth = 0,
): { text: string | null; html: string | null; headers: string | null } {
  let text: string | null = null
  let html: string | null = null
  let headers: string | null = null

  if (depth > 5) return { text, html, headers }

  try {
    const headerBodySplit = mimeContent.split(/\r?\n\r?\n/)
    if (headerBodySplit.length >= 2) {
      const possibleHeaders = headerBodySplit[0]
      if (possibleHeaders.includes('Content-Type:') || possibleHeaders.includes('From:')) {
        headers = possibleHeaders
      }
    }

    const boundaryMatch = mimeContent.match(/boundary="?([^"\r\n;]+)"?/i)
    if (!boundaryMatch) {
      const cleanContent = mimeContent.replace(/^[\s\S]*?\r?\n\r?\n/, '')
      if (cleanContent.includes('<html') || cleanContent.includes('<div') || cleanContent.includes('<p>')) {
        html = cleanContent
      } else {
        text = cleanContent
      }
      return { text, html, headers }
    }

    const boundary = boundaryMatch[1].trim()
    const parts = mimeContent.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

    for (const part of parts) {
      if (part.trim() === '' || part.trim() === '--') continue

      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i)
      if (!contentTypeMatch) continue
      const contentType = contentTypeMatch[1].toLowerCase().trim()

      if (contentType.includes('multipart/')) {
        const nested = parseMimeContent(part, depth + 1)
        if (nested.text && !text) text = nested.text
        if (nested.html && !html) html = nested.html
        continue
      }

      const contentMatch = part.match(/\r?\n\r?\n([\s\S]*)/)
      if (!contentMatch) continue
      let content = contentMatch[1].trim()

      if (part.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
        content = decodeQuotedPrintable(content)
      }
      if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
        try {
          content = Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf-8')
        } catch {
          /* keep original */
        }
      }

      if (contentType.includes('text/plain') && !text) {
        text = content
      } else if (contentType.includes('text/html') && !html) {
        html = content
      }
    }
  } catch (e) {
    console.error('[mime] parseMimeContent error:', e)
  }

  return { text, html, headers }
}

export function parseMimeAttachments(mimeContent: string, depth = 0): MimeAttachment[] {
  const attachments: MimeAttachment[] = []
  if (depth > 5) return attachments

  try {
    const boundaryMatch = mimeContent.match(/boundary="?([^"\r\n;]+)"?/i)
    if (!boundaryMatch) return attachments

    const boundary = boundaryMatch[1].trim()
    const parts = mimeContent.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

    for (const part of parts) {
      if (part.trim() === '' || part.trim() === '--') continue

      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i)
      if (!contentTypeMatch) continue
      const contentType = contentTypeMatch[1].toLowerCase().trim()

      if (contentType.includes('multipart/')) {
        attachments.push(...parseMimeAttachments(part, depth + 1))
        continue
      }

      const hasAttachmentDisposition =
        part.toLowerCase().includes('content-disposition: attachment') ||
        part.toLowerCase().includes('content-disposition:attachment')

      if (!hasAttachmentDisposition) {
        if (contentType.includes('text/plain') || contentType.includes('text/html')) continue
      }

      let filename = ''
      const filenameMatch =
        part.match(/filename="?([^"\r\n;]+)"?/i) || part.match(/name="?([^"\r\n;]+)"?/i)
      if (filenameMatch) {
        filename = filenameMatch[1].trim()
        if (filename.startsWith('=?')) {
          try {
            const enc = filename.match(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/i)
            if (enc && enc[2].toUpperCase() === 'B') {
              filename = Buffer.from(enc[3], 'base64').toString('utf-8')
            }
          } catch {
            /* keep original */
          }
        }
      }
      if (!filename) {
        const ext = contentType.split('/')[1]?.split(';')[0] || 'bin'
        filename = `attachment_${Date.now()}.${ext}`
      }

      const contentIdMatch = part.match(/Content-ID:\s*<?([^>\r\n]+)>?/i)
      const contentId = contentIdMatch ? contentIdMatch[1] : undefined

      const contentMatch = part.match(/\r?\n\r?\n([\s\S]*)/)
      if (!contentMatch) continue
      const rawContent = contentMatch[1].trim()

      let contentBuffer: Buffer
      if (part.toLowerCase().includes('content-transfer-encoding: base64')) {
        try {
          contentBuffer = Buffer.from(rawContent.replace(/\s/g, ''), 'base64')
        } catch {
          continue
        }
      } else {
        contentBuffer = Buffer.from(rawContent)
      }

      // Skip phantom parts with no content — empty MIME parts were being saved
      // as bogus 0-byte "attachment_<n>.bin" files. A real attachment has bytes.
      if (contentBuffer.length === 0) continue

      attachments.push({ filename, contentType, content: contentBuffer, contentId })
    }
  } catch (e) {
    console.error('[mime] parseMimeAttachments error:', e)
  }

  return attachments
}
