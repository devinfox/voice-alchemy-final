import sgMail, { MailService } from '@sendgrid/mail'
import sgClient from '@sendgrid/client'

// Initialize SendGrid. Prefer SENDGRID_API_KEY; fall back to OTHER_SENDGRID_API_KEY
// so VAAA can run entirely on the Meridian/other SendGrid account.
const apiKey = process.env.SENDGRID_API_KEY || process.env.OTHER_SENDGRID_API_KEY

if (apiKey) {
  sgMail.setApiKey(apiKey)
  sgClient.setApiKey(apiKey)
}

export { sgMail, sgClient }

/**
 * Per-domain sending credentials (Meridian / VAAA pattern).
 *
 * When the From address is on OTHER_SENDGRID_DOMAIN, use OTHER_SENDGRID_API_KEY
 * (isolated MailService). Voice Alchemy Academy is intended to run entirely on
 * that "other" SendGrid account (same account as Meridian Gold).
 *
 * If SENDGRID_API_KEY is unset but OTHER_SENDGRID_API_KEY is set, the other key
 * is also used as the default so domain auth + send work from one account.
 */
function getSenderClient(fromEmail?: string | null): { client: typeof sgMail; key: string | undefined } {
  const domain = fromEmail?.split('@')[1]?.toLowerCase()
  const otherDomain = process.env.OTHER_SENDGRID_DOMAIN?.toLowerCase()
  const otherKey = process.env.OTHER_SENDGRID_API_KEY

  if (domain && otherDomain && domain === otherDomain && otherKey) {
    const other = new MailService()
    other.setApiKey(otherKey)
    return { client: other, key: otherKey }
  }

  // VAAA single-tenant fallback: prefer OTHER key when primary is absent
  if (!apiKey && otherKey) {
    const other = new MailService()
    other.setApiKey(otherKey)
    return { client: other, key: otherKey }
  }

  return { client: sgMail, key: apiKey }
}

// ============================================================================
// Domain Authentication Helpers
// ============================================================================

export interface SendGridDomainResponse {
  id: number
  domain: string
  subdomain: string
  username: string
  user_id: number
  ips: string[]
  custom_spf: boolean
  default: boolean
  legacy: boolean
  automatic_security: boolean
  valid: boolean
  dns: {
    mail_cname: { host: string; type: string; data: string; valid: boolean }
    dkim1: { host: string; type: string; data: string; valid: boolean }
    dkim2: { host: string; type: string; data: string; valid: boolean }
  }
}

export async function createDomainAuthentication(domain: string): Promise<SendGridDomainResponse> {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/whitelabel/domains',
    body: {
      domain,
      automatic_security: true,
    },
  })
  return response.body as SendGridDomainResponse
}

export async function getDomainAuthentication(domainId: string | number): Promise<SendGridDomainResponse> {
  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/whitelabel/domains/${domainId}`,
  })
  return response.body as SendGridDomainResponse
}

export async function validateDomain(domainId: string | number): Promise<{
  id: number
  valid: boolean
  validation_results: {
    mail_cname: { valid: boolean; reason: string | null }
    dkim1: { valid: boolean; reason: string | null }
    dkim2: { valid: boolean; reason: string | null }
  }
}> {
  const [response] = await sgClient.request({
    method: 'POST',
    url: `/v3/whitelabel/domains/${domainId}/validate`,
  })
  return response.body as any
}

export async function deleteDomainAuthentication(domainId: string | number): Promise<void> {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/whitelabel/domains/${domainId}`,
  })
}

export async function listDomainAuthentications(): Promise<SendGridDomainResponse[]> {
  const [response] = await sgClient.request({
    method: 'GET',
    url: '/v3/whitelabel/domains',
  })
  return response.body as SendGridDomainResponse[]
}

// ============================================================================
// Inbound Parse Helpers
// ============================================================================

export interface InboundParseSettings {
  hostname: string
  url: string
  spam_check: boolean
  send_raw: boolean
}

export async function getInboundParseSettings(): Promise<InboundParseSettings[]> {
  const [response] = await sgClient.request({
    method: 'GET',
    url: '/v3/user/webhooks/parse/settings',
  })
  return (response.body as any).result || []
}

export async function createInboundParseWebhook(
  hostname: string,
  url: string,
  spamCheck = true,
  sendRaw = false
): Promise<InboundParseSettings> {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/user/webhooks/parse/settings',
    body: {
      hostname,
      url,
      spam_check: spamCheck,
      send_raw: sendRaw,
    },
  })
  return response.body as InboundParseSettings
}

export async function deleteInboundParseWebhook(hostname: string): Promise<void> {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/user/webhooks/parse/settings/${hostname}`,
  })
}

// ============================================================================
// Event Webhook Helpers
// ============================================================================

export async function getEventWebhookSettings(): Promise<any> {
  const [response] = await sgClient.request({
    method: 'GET',
    url: '/v3/user/webhooks/event/settings',
  })
  return response.body
}

export async function updateEventWebhookSettings(settings: {
  enabled: boolean
  url: string
  group_resubscribe?: boolean
  delivered?: boolean
  group_unsubscribe?: boolean
  spam_report?: boolean
  bounce?: boolean
  deferred?: boolean
  unsubscribe?: boolean
  processed?: boolean
  open?: boolean
  click?: boolean
  dropped?: boolean
}): Promise<any> {
  const [response] = await sgClient.request({
    method: 'PATCH',
    url: '/v3/user/webhooks/event/settings',
    body: settings,
  })
  return response.body
}

// ============================================================================
// Email Sending Helpers
// ============================================================================

export interface SendEmailParams {
  to: { email: string; name?: string }[]
  cc?: { email: string; name?: string }[]
  bcc?: { email: string; name?: string }[]
  from: { email: string; name?: string }
  replyTo?: { email: string; name?: string }
  subject: string
  text?: string
  html?: string
  attachments?: {
    content: string // base64 encoded
    filename: string
    type?: string
    disposition?: 'attachment' | 'inline'
    contentId?: string
  }[]
  headers?: Record<string, string>
  trackingSettings?: {
    clickTracking?: { enable: boolean; enableText?: boolean }
    openTracking?: { enable: boolean; substitutionTag?: string }
    subscriptionTracking?: { enable: boolean }
  }
  sendAt?: number // Unix timestamp for scheduled sending
}

export async function sendEmail(params: SendEmailParams): Promise<{
  messageId: string
  statusCode: number
}> {
  // Pick the SendGrid account based on the sender: the configured other-org
  // domain uses its own account; everyone else uses the shared default.
  const fromEmail = typeof params.from === 'string' ? params.from : params.from?.email
  const { client: sgClientForSend, key: effectiveKey } = getSenderClient(fromEmail)

  if (!effectiveKey) {
    throw new Error('SendGrid API key is not configured. Please set SENDGRID_API_KEY environment variable.')
  }

  const msg: any = {
    to: params.to,
    from: params.from,
    subject: params.subject,
  }

  // Only include text/html when they actually have content. SendGrid rejects
  // empty content values ("The content value must be a string at least one
  // character in length"), which happens when sending attachment-only emails
  // with an empty body_text.
  if (params.text) msg.text = params.text
  if (params.html) msg.html = params.html

  if (params.cc?.length) msg.cc = params.cc
  if (params.bcc?.length) msg.bcc = params.bcc
  if (params.replyTo) msg.replyTo = params.replyTo
  if (params.attachments?.length) msg.attachments = params.attachments
  if (params.headers) msg.headers = params.headers
  if (params.sendAt) msg.sendAt = params.sendAt

  // Default tracking settings
  msg.trackingSettings = params.trackingSettings || {
    clickTracking: { enable: true },
    openTracking: { enable: true },
  }

  try {
    const [response] = await sgClientForSend.send(msg)

    return {
      messageId: response.headers['x-message-id'] as string,
      statusCode: response.statusCode,
    }
  } catch (error: any) {
    // SendGrid errors have a response body with more details
    console.error('[SendGrid] Send error:', error)
    if (error.response?.body) {
      console.error('[SendGrid] Error body:', JSON.stringify(error.response.body, null, 2))
      const errors = error.response.body.errors
      if (errors && errors.length > 0) {
        throw new Error(`SendGrid error: ${errors.map((e: any) => e.message).join(', ')}`)
      }
    }
    throw error
  }
}

// ============================================================================
// Webhook Signature Verification
// ============================================================================

import crypto from 'crypto'

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  verificationKey: string
): boolean {
  const timestampedPayload = timestamp + payload
  const expectedSignature = crypto
    .createHmac('sha256', verificationKey)
    .update(timestampedPayload)
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

// ============================================================================
// DNS Record Formatting
// ============================================================================

import { DNSRecord } from '@/types/email.types'

export function formatDNSRecordsFromSendGrid(sgDomain: SendGridDomainResponse): DNSRecord[] {
  const records: DNSRecord[] = []

  // Mail CNAME (for receiving - MX routing)
  if (sgDomain.dns.mail_cname) {
    records.push({
      type: 'cname',
      host: sgDomain.dns.mail_cname.host,
      value: sgDomain.dns.mail_cname.data,
      verified: sgDomain.dns.mail_cname.valid,
    })
  }

  // DKIM records
  if (sgDomain.dns.dkim1) {
    records.push({
      type: 'cname',
      host: sgDomain.dns.dkim1.host,
      value: sgDomain.dns.dkim1.data,
      verified: sgDomain.dns.dkim1.valid,
    })
  }

  if (sgDomain.dns.dkim2) {
    records.push({
      type: 'cname',
      host: sgDomain.dns.dkim2.host,
      value: sgDomain.dns.dkim2.data,
      verified: sgDomain.dns.dkim2.valid,
    })
  }

  // Add MX record instruction for inbound mail
  records.push({
    type: 'mx',
    host: '@',
    value: 'mx.sendgrid.net',
    priority: 10,
    verified: false, // Will be verified separately
  })

  // Add SPF record instruction
  records.push({
    type: 'txt',
    host: '@',
    value: 'v=spf1 include:sendgrid.net ~all',
    verified: false,
  })

  return records
}
