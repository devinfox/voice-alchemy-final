/**
 * Signed one-click unsubscribe links.
 *
 * `{{unsubscribe_url}}` in a template renders to
 *   <app>/api/email/unsubscribe?e=<email>&t=<token>
 * where the token is an HMAC of the address, so a link can only unsubscribe
 * the address it was sent to. No database round trip is needed to build one.
 */
import { createHmac, timingSafeEqual } from 'crypto'

function secret(): string {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'voice-alchemy-unsubscribe'
  )
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', secret()).update(normalizeEmail(email)).digest('hex').slice(0, 40)
}

export function verifyUnsubscribeToken(email: string, token: string | null | undefined): boolean {
  if (!email || !token) return false
  const expected = Buffer.from(unsubscribeToken(email))
  const given = Buffer.from(String(token))
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export function appBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.voicealchemyacademy.app').trim()
  return base.replace(/\/$/, '')
}

export function unsubscribeUrl(email: string): string {
  const e = normalizeEmail(email)
  return `${appBaseUrl()}/api/email/unsubscribe?e=${encodeURIComponent(e)}&t=${unsubscribeToken(e)}`
}

/** RFC 8058 headers so Gmail/Apple Mail show their own unsubscribe control. */
export function listUnsubscribeHeaders(email: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
