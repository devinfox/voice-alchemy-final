/**
 * Email system health checks.
 *
 * Read-only diagnostics for the send/receive pipeline: env, SendGrid account
 * state, domain authentication, inbound parse, event webhook, and the
 * caller's mailbox. Surfaced on Email → Settings so problems (out of
 * credits, missing env, unverified domain) are visible without digging
 * through logs.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { Client as SendGridClient } from '@sendgrid/client'

export type HealthStatus = 'pass' | 'warn' | 'fail'

export interface HealthCheck {
  id: string
  label: string
  status: HealthStatus
  detail: string
  fix?: string
}

export interface EmailHealthReport {
  checked_at: string
  domain: string
  checks: HealthCheck[]
  summary: { pass: number; warn: number; fail: number }
}

// Own client instance so the key is read at call time, not module load.
function sendGridClient(): SendGridClient | null {
  const key = process.env.SENDGRID_API_KEY || process.env.OTHER_SENDGRID_API_KEY
  if (!key) return null
  const client = new SendGridClient()
  client.setApiKey(key)
  return client
}

async function sg<T = unknown>(url: string): Promise<T | null> {
  const client = sendGridClient()
  if (!client) return null
  try {
    const [response] = await client.request({ method: 'GET', url })
    return response.body as T
  } catch (err) {
    console.error('[email-health] SendGrid request failed:', url, err instanceof Error ? err.message : err)
    return null
  }
}

interface SgDomain {
  id: number
  domain: string
  subdomain: string
  valid: boolean
  dns?: Record<string, { host: string; data: string; valid: boolean }>
}

export async function runEmailHealthChecks(userId: string): Promise<EmailHealthReport> {
  const checks: HealthCheck[] = []
  const domain = (process.env.NEXT_PUBLIC_EMAIL_DOMAIN || process.env.OTHER_SENDGRID_DOMAIN || 'voicealchemyacademy.com').toLowerCase()
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const admin = getSupabaseAdmin()

  // --- Environment --------------------------------------------------------
  const hasKey = !!(process.env.SENDGRID_API_KEY || process.env.OTHER_SENDGRID_API_KEY)
  checks.push({
    id: 'sendgrid_key',
    label: 'SendGrid API key',
    status: hasKey ? 'pass' : 'fail',
    detail: hasKey ? 'Present' : 'Neither SENDGRID_API_KEY nor OTHER_SENDGRID_API_KEY is set',
    fix: hasKey ? undefined : 'Add SENDGRID_API_KEY to the environment and redeploy.',
  })

  checks.push({
    id: 'cron_secret',
    label: 'Delivery worker secret',
    status: process.env.CRON_SECRET ? 'pass' : 'fail',
    detail: process.env.CRON_SECRET
      ? 'CRON_SECRET is set; scheduled emails and funnels can run'
      : 'CRON_SECRET is not set, so every cron run is rejected and scheduled emails and funnels never send',
    fix: process.env.CRON_SECRET ? undefined : 'Add CRON_SECRET (any long random string) to the environment. Vercel passes it to cron requests automatically.',
  })

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || ''
  const fromDomain = fromEmail.split('@')[1]?.toLowerCase()
  checks.push({
    id: 'from_email',
    label: 'Notification sender address',
    status: !fromEmail ? 'warn' : fromDomain === domain ? 'pass' : 'fail',
    detail: !fromEmail
      ? `SENDGRID_FROM_EMAIL not set; notifications fall back to noreply@${domain}`
      : fromDomain === domain
      ? fromEmail
      : `${fromEmail} is not on ${domain}, so notification emails will be rejected or land in spam`,
    fix: fromDomain === domain ? undefined : `Set SENDGRID_FROM_EMAIL=noreply@${domain}`,
  })

  checks.push({
    id: 'app_url',
    label: 'App URL for links in emails',
    status: !appUrl ? 'warn' : appUrl.includes('voicealchemy') ? 'pass' : 'fail',
    detail: appUrl || 'NEXT_PUBLIC_APP_URL not set; login links fall back to the public website',
    fix: appUrl.includes('voicealchemy') ? undefined : 'Set NEXT_PUBLIC_APP_URL to the production app URL (https://www.voicealchemyacademy.app).',
  })

  checks.push({
    id: 'webhook_secret',
    label: 'Event webhook signature',
    status: process.env.SENDGRID_WEBHOOK_SECRET ? 'pass' : 'warn',
    detail: process.env.SENDGRID_WEBHOOK_SECRET
      ? 'Signed events are verified'
      : 'SENDGRID_WEBHOOK_SECRET not set; the events endpoint accepts unsigned posts',
    fix: process.env.SENDGRID_WEBHOOK_SECRET ? undefined : 'Enable Signed Event Webhook in SendGrid and set SENDGRID_WEBHOOK_SECRET to the verification key.',
  })

  // --- SendGrid account ---------------------------------------------------
  if (hasKey) {
    const credits = await sg<{ remain: number; total: number; used: number; reset_frequency: string; is_hard_limit: boolean }>('/v3/user/credits')
    const account = await sg<{ type: string; reputation: number }>('/v3/user/account')
    if (!credits) {
      checks.push({ id: 'sendgrid_credits', label: 'SendGrid sending credits', status: 'warn', detail: 'Could not read credits (key may lack the user.credits scope)' })
    } else {
      const exhausted = credits.total === 0 || (credits.is_hard_limit && credits.remain <= 0)
      checks.push({
        id: 'sendgrid_credits',
        label: 'SendGrid sending credits',
        status: exhausted ? 'fail' : credits.remain < Math.max(10, credits.total * 0.1) ? 'warn' : 'pass',
        detail: exhausted
          ? `Account type "${account?.type || 'unknown'}" has ${credits.total} credits; SendGrid answers every send with "Maximum credits exceeded"`
          : `${credits.remain} of ${credits.total} credits remaining (${credits.reset_frequency} reset)`,
        fix: exhausted ? 'Upgrade the SendGrid account (or add credits) at app.sendgrid.com → Settings → Account Details → Your Products.' : undefined,
      })
    }
    if (account && account.reputation < 90) {
      checks.push({ id: 'sendgrid_reputation', label: 'SendGrid reputation', status: 'warn', detail: `Reputation ${account.reputation}%`, fix: 'Check bounces and spam reports in SendGrid.' })
    }

    // --- Domain authentication -------------------------------------------
    const domains = await sg<SgDomain[]>('/v3/whitelabel/domains')
    if (domains) {
      const mine = domains.filter(d => d.domain.toLowerCase() === domain)
      const valid = mine.find(d => d.valid)
      const dnsDetail = valid?.dns
        ? Object.values(valid.dns).map(r => `${r.host} → ${r.data} (${r.valid ? 'ok' : 'missing'})`).join('; ')
        : ''
      checks.push({
        id: 'domain_auth',
        label: `Domain authentication for ${domain}`,
        status: valid ? 'pass' : mine.length ? 'fail' : 'fail',
        detail: valid
          ? `Verified in SendGrid (id ${valid.id}, subdomain ${valid.subdomain}). ${dnsDetail}`
          : mine.length
          ? 'Domain exists in SendGrid but its DNS records are not validating'
          : 'Domain is not authenticated in SendGrid',
        fix: valid ? undefined : 'Email → Settings → Domains: add the domain and publish the CNAME records SendGrid shows.',
      })
      const stale = mine.filter(d => !d.valid)
      if (valid && stale.length) {
        checks.push({ id: 'domain_duplicates', label: 'Stale domain records', status: 'warn', detail: `${stale.length} unverified duplicate(s) of ${domain} in SendGrid (ids ${stale.map(d => d.id).join(', ')})`, fix: 'Delete the unverified duplicates in SendGrid → Sender Authentication.' })
      }
    }

    // --- Inbound parse --------------------------------------------------
    const parse = await sg<{ result: Array<{ hostname: string; url: string; send_raw: boolean }> }>('/v3/user/webhooks/parse/settings')
    if (parse) {
      const entry = parse.result.find(p => p.hostname.toLowerCase() === domain)
      const expected = appUrl ? `${appUrl}/api/email/webhooks/sendgrid/inbound` : ''
      const pointsAtApp = !!entry && (!expected || entry.url === expected || entry.url.includes('voicealchemy'))
      checks.push({
        id: 'inbound_parse',
        label: 'Inbound parse (receiving)',
        status: entry ? (pointsAtApp ? 'pass' : 'warn') : 'fail',
        detail: entry ? `Mail for ${domain} posts to ${entry.url}` : `No inbound parse rule for ${domain}`,
        fix: entry
          ? pointsAtApp ? undefined : `Point the parse rule at ${expected || 'the production app'}/api/email/webhooks/sendgrid/inbound`
          : `SendGrid → Settings → Inbound Parse: host ${domain}, URL <app>/api/email/webhooks/sendgrid/inbound. MX for ${domain} must be mx.sendgrid.net.`,
      })
    }

    // --- Event webhook --------------------------------------------------
    const events = await sg<{ enabled: boolean; url: string; open: boolean; click: boolean; bounce: boolean; delivered: boolean }>('/v3/user/webhooks/event/settings')
    if (events) {
      const wanted = ['delivered', 'open', 'click', 'bounce'] as const
      const missing = wanted.filter(k => !events[k])
      checks.push({
        id: 'event_webhook',
        label: 'Event webhook (opens, clicks, bounces)',
        status: events.enabled && missing.length === 0 ? 'pass' : events.enabled ? 'warn' : 'warn',
        detail: events.enabled
          ? `Enabled → ${events.url}${missing.length ? ` (not sending: ${missing.join(', ')})` : ''}`
          : 'Disabled. Sent emails will never show delivered/opened/clicked, and funnel open rates stay at 0%',
        fix: events.enabled && missing.length === 0
          ? undefined
          : `SendGrid → Settings → Mail Settings → Event Webhook: URL ${appUrl || '<app>'}/api/email/webhooks/sendgrid/events, enable delivered, open, click, bounce, dropped, spam report.`,
      })
    }
  }

  // --- Database: domain + mailbox -----------------------------------------
  const { data: dbDomain } = await admin
    .from('email_domains')
    .select('id, domain, verification_status')
    .eq('is_deleted', false)
    .ilike('domain', domain)
    .limit(1)
    .maybeSingle()
  checks.push({
    id: 'db_domain',
    label: 'Domain record in app',
    status: dbDomain?.verification_status === 'verified' ? 'pass' : dbDomain ? 'warn' : 'fail',
    detail: dbDomain ? `${dbDomain.domain}: ${dbDomain.verification_status}` : `No email_domains row for ${domain}`,
    fix: dbDomain?.verification_status === 'verified' ? undefined : 'Email → Settings → Domains → Verify.',
  })

  const { data: mailbox } = await admin
    .from('email_accounts')
    .select('email_address, is_active, domain:email_domains(verification_status)')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  const mailboxDomain = Array.isArray(mailbox?.domain) ? mailbox?.domain[0] : mailbox?.domain
  checks.push({
    id: 'my_mailbox',
    label: 'Your sending mailbox',
    status: mailbox && mailboxDomain?.verification_status === 'verified' ? 'pass' : mailbox ? 'warn' : 'fail',
    detail: mailbox
      ? `${mailbox.email_address}${mailboxDomain?.verification_status === 'verified' ? '' : ' (domain not verified)'}`
      : 'You have no active mailbox, so Send, Schedule, and funnels you enroll cannot send',
    fix: mailbox ? undefined : 'Email → Settings → Accounts → add a mailbox on the verified domain.',
  })

  // --- Recent activity ----------------------------------------------------
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [{ count: inbound7d }, { count: outbound7d }, { count: failed7d }] = await Promise.all([
    admin.from('emails').select('id', { count: 'exact', head: true }).eq('is_inbound', true).gte('created_at', since),
    admin.from('emails').select('id', { count: 'exact', head: true }).eq('is_inbound', false).in('status', ['sent', 'delivered', 'opened', 'clicked']).gte('created_at', since),
    admin.from('emails').select('id', { count: 'exact', head: true }).eq('is_inbound', false).eq('status', 'failed').gte('created_at', since),
  ])
  checks.push({
    id: 'activity',
    label: 'Last 7 days',
    status: (failed7d || 0) > 0 && (outbound7d || 0) === 0 ? 'warn' : 'pass',
    detail: `${inbound7d || 0} received · ${outbound7d || 0} sent · ${failed7d || 0} failed`,
  })

  const summary = { pass: 0, warn: 0, fail: 0 }
  for (const c of checks) summary[c.status]++

  return { checked_at: new Date().toISOString(), domain, checks, summary }
}
