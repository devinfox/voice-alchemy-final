/**
 * Inbound Email Service
 *
 * SendGrid Inbound Parse POSTs the entire email — body + every attachment — in a
 * single request. On Vercel that hits a hard ~4.5MB request-body limit and the
 * webhook is rejected before any code runs, so large emails never land in the CRM.
 *
 * This tiny service runs on Railway (no body-size limit). It:
 *   1. Receives the full SendGrid Inbound Parse POST.
 *   2. Uploads each attachment straight to Supabase Storage.
 *   3. Forwards a SLIM payload (text fields + attachment *references*, never raw
 *      bytes) to the existing CRM webhook, which keeps all the threading / AI /
 *      lead-linking logic in one place.
 *
 * It deliberately stays a separate service so the phone dialer is never coupled
 * to email ingestion.
 */

import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  parseMimeAttachments,
  parseMimeContent,
  parseMultipart,
  sanitizeContentType,
  type FormPart,
  type MimeAttachment,
} from './mime.js'

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRM_BASE_URL', 'INBOUND_FORWARD_SECRET'] as const
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[inbound] Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRM_BASE_URL = process.env.CRM_BASE_URL!.replace(/\/$/, '')
const INBOUND_FORWARD_SECRET = process.env.INBOUND_FORWARD_SECRET!
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'email-attachments'
const PORT = parseInt(process.env.PORT || '3000', 10)
// Cap matches SendGrid's documented inbound message ceiling; protects memory.
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || String(35 * 1024 * 1024), 10)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface AttachmentRef {
  filename: string
  content_type: string
  size_bytes: number
  storage_path: string
  public_url: string | null
  content_id: string | null
}

/** Read the raw request body into a Buffer, enforcing a hard size ceiling. */
function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error(`Body exceeds ${MAX_BODY_BYTES} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Upload one attachment to Storage and return its reference (no raw bytes). */
async function uploadAttachment(
  prefix: string,
  filename: string,
  contentType: string,
  body: Buffer,
): Promise<AttachmentRef | null> {
  const safeName = filename.replace(/[/\\]/g, '_')
  const storagePath = `${prefix}/${safeName}`
  const safeContentType = sanitizeContentType(contentType)

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, body, { contentType: safeContentType, upsert: true })

  if (error) {
    console.error('[inbound] attachment upload failed:', filename, error.message)
    return null
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  return {
    filename,
    content_type: safeContentType,
    size_bytes: body.length,
    storage_path: storagePath,
    public_url: data?.publicUrl ?? null,
    content_id: null,
  }
}

/**
 * Parse the inbound multipart body into form parts.
 *
 * PRIMARY: our own deterministic, binary-safe `parseMultipart`. EVERY message —
 * not just ones that previously failed — goes through this single robust path, so
 * behaviour no longer depends on undici's built-in multipart parser, which throws
 * "Failed to parse body as FormData" on a subset of real SendGrid posts and was
 * silently dropping attachment-bearing mail.
 *
 * BACKSTOP: if the manual parser ever throws or yields nothing, fall back to the
 * built-in parser. A message is only ever at risk if BOTH independent parsers
 * fail — and then the handler 500s so SendGrid retries, never a silent drop. The
 * two parsers were verified to extract identical fields on valid mail, so routing
 * everything through the manual path carries no regression for working mail.
 */
async function getParts(raw: Buffer, contentType: string): Promise<FormPart[]> {
  try {
    const parts = parseMultipart(raw, contentType)
    if (parts.length > 0) return parts
    console.warn('[inbound] manual parse produced 0 parts; falling back to formData()')
  } catch (err) {
    console.warn('[inbound] manual parse failed; falling back to formData():', (err as Error).message)
  }

  const webReq = new Request('http://local/inbound', {
    method: 'POST',
    headers: { 'content-type': contentType || 'multipart/form-data' },
    body: new Blob([new Uint8Array(raw)]),
  })
  const form = await webReq.formData()
  const entries: Array<[string, FormDataEntryValue]> = []
  form.forEach((value, name) => entries.push([name, value]))
  const parts: FormPart[] = []
  for (const [name, value] of entries) {
    if (typeof value === 'string') {
      parts.push({ name, data: Buffer.from(value, 'utf8') })
    } else {
      parts.push({
        name,
        filename: value.name || undefined,
        contentType: value.type || undefined,
        data: Buffer.from(await value.arrayBuffer()),
      })
    }
  }
  return parts
}

async function handleInbound(req: http.IncomingMessage, res: http.ServerResponse) {
  const raw = await readBody(req)
  const parts = await getParts(raw, req.headers['content-type'] || '')

  const str = (k: string) => {
    const p = parts.find((p) => p.name === k && p.filename === undefined)
    return p ? p.data.toString('utf8') : null
  }

  const attachmentInfo = str('attachment-info')
  const rawEmail = str('email')

  // Unique storage prefix shared by all of this message's attachments.
  const prefix = `emails/inbound/${randomUUID()}`
  const refs: AttachmentRef[] = []

  if (attachmentInfo) {
    // SendGrid "parsed" mode: files arrive as individual form fields.
    try {
      const info = JSON.parse(attachmentInfo) as Record<
        string,
        { filename?: string; type?: string; ['content-id']?: string }
      >
      for (const [key, meta] of Object.entries(info)) {
        const filePart = parts.find((p) => p.name === key && p.filename !== undefined)
        if (!filePart) continue
        const buf = filePart.data
        const ref = await uploadAttachment(
          prefix,
          meta.filename || filePart.filename || key,
          meta.type || filePart.contentType || '',
          buf,
        )
        if (ref) {
          ref.content_id = meta['content-id'] || null
          refs.push(ref)
        }
      }
    } catch (e) {
      console.error('[inbound] failed to process parsed attachments:', e)
    }
  } else if (rawEmail) {
    // SendGrid "raw" mode: parse the MIME ourselves and extract attachments.
    const mimeAtts: MimeAttachment[] = parseMimeAttachments(rawEmail)
    for (const att of mimeAtts) {
      const ref = await uploadAttachment(prefix, att.filename, att.contentType, att.content)
      if (ref) {
        ref.content_id = att.contentId || null
        refs.push(ref)
      }
    }
  }

  // Resolve body text/html. In raw mode, extract from the MIME so the forwarded
  // payload stays small (we never forward the raw email).
  let text = str('text')
  let html = str('html')
  let headers = str('headers')
  if (rawEmail && !text && !html) {
    const parsed = parseMimeContent(rawEmail)
    text = parsed.text
    html = parsed.html
    headers = headers || parsed.headers
  }

  // Build the slim multipart payload for the CRM webhook (no raw attachment bytes).
  const out = new FormData()
  for (const k of ['from', 'to', 'cc', 'subject', 'spam_score']) {
    const v = str(k)
    if (v != null) out.set(k, v)
  }
  if (text != null) out.set('text', text)
  if (html != null) out.set('html', html)
  if (headers != null) out.set('headers', headers)
  out.set('preuploaded-attachments', JSON.stringify(refs))

  const forwardRes = await fetch(`${CRM_BASE_URL}/api/email/webhooks/sendgrid/inbound`, {
    method: 'POST',
    headers: { 'x-inbound-secret': INBOUND_FORWARD_SECRET },
    body: out,
  })

  const bodyText = await forwardRes.text().catch(() => '')
  if (!forwardRes.ok) {
    console.error('[inbound] CRM webhook rejected forward:', forwardRes.status, bodyText.slice(0, 500))
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, forwarded: false, status: forwardRes.status }))
    return
  }

  console.log('[inbound] forwarded:', { to: str('to'), subject: str('subject'), attachments: refs.length })
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true, forwarded: true, attachments: refs.length }))
}

const server = http.createServer((req, res) => {
  // Health check for Railway.
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }

  if (req.method === 'POST' && (req.url === '/webhooks/sendgrid/inbound' || req.url === '/')) {
    handleInbound(req, res).catch((err) => {
      console.error('[inbound] handler error:', err)
      // 500 so SendGrid retries rather than silently dropping the message.
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'processing error' }))
      }
    })
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

server.listen(PORT, () => {
  console.log(`[inbound] Inbound Email Service listening on :${PORT} -> ${CRM_BASE_URL}`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
