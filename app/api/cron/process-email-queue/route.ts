import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/sendgrid'
import { generateMessageId, generateSnippet } from '@/lib/email-utils'
import { renderEmailTemplate, templateHtml, type RecipientContext, type SenderContext } from '@/lib/email-variables'
import { v4 as uuidv4 } from 'uuid'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelEnrollments, enrollInFunnel, findFunnelByTrigger, isUnsubscribed } from '@/lib/email-leads'
import { listUnsubscribeHeaders } from '@/lib/email-unsubscribe'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET
const BATCH_LIMIT = 25
// How long a worker "owns" an enrollment while sending. Prevents an
// overlapping cron run from sending the same phase twice.
const CLAIM_MS = 10 * 60 * 1000
// After a send failure, retry this much later instead of every run.
const RETRY_DELAY_MS = 30 * 60 * 1000

interface PhaseRow {
  id: string
  phase_order: number
  delay_days: number | null
  delay_hours: number | null
  template_id: string | null
  emails_sent: number | null
}

interface SendingAccount {
  id: string
  email_address: string
  display_name: string | null
  organization_id: string | null
  domain: string
}

function phaseDelayMs(phase: Pick<PhaseRow, 'delay_days' | 'delay_hours'>): number {
  return (((phase.delay_days || 0) * 24 + (phase.delay_hours || 0)) * 60) * 60 * 1000
}

function recipientName(r: RecipientContext): string {
  return r.name || `${r.first_name || ''} ${r.last_name || ''}`.trim()
}

// How far back the signup sweep looks for new student accounts. Activating
// the student funnel therefore never mails the whole historical roster.
const SIGNUP_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Pick the mailbox a funnel email goes out from: the enroller's active
 * account when they have one on a verified domain, else the address named
 * by EMAIL_FUNNEL_FROM (e.g. hello@), else any verified account.
 */
async function resolveSendingAccount(admin: SupabaseClient, preferredUserId: string | null, cache: Map<string, SendingAccount | null>): Promise<SendingAccount | null> {
  const key = preferredUserId || '*'
  if (cache.has(key)) return cache.get(key)!
  const preferredAddress = (process.env.EMAIL_FUNNEL_FROM || '').trim().toLowerCase()

  const select = 'id, user_id, email_address, display_name, organization_id, domain:email_domains(domain, verification_status)'
  const pick = (rows: any[] | null): SendingAccount | null => {
    for (const row of rows || []) {
      const d = Array.isArray(row.domain) ? row.domain[0] : row.domain
      if (d?.verification_status === 'verified' && d.domain) {
        return { id: row.id, email_address: row.email_address, display_name: row.display_name, organization_id: row.organization_id, domain: d.domain }
      }
    }
    return null
  }

  let account: SendingAccount | null = null
  if (preferredUserId) {
    const { data } = await admin.from('email_accounts').select(select).eq('user_id', preferredUserId).eq('is_active', true).eq('is_deleted', false)
    account = pick(data)
  }
  if (!account && preferredAddress) {
    const { data } = await admin.from('email_accounts').select(select).ilike('email_address', preferredAddress).eq('is_active', true).eq('is_deleted', false)
    account = pick(data)
  }
  if (!account) {
    const { data } = await admin.from('email_accounts').select(select).eq('is_active', true).eq('is_deleted', false).order('created_at', { ascending: true })
    account = pick(data)
  }
  cache.set(key, account)
  return account
}

/**
 * Part 0: new student accounts join the "student_signup" funnel, and any lead
 * track for the same address ends (they no longer need to be sold the app).
 */
async function sweepNewStudents(admin: SupabaseClient, summary: { signupEnrolled: number; errors: string[] }) {
  const funnel = await findFunnelByTrigger(admin, 'student_signup')
  if (!funnel || funnel.status !== 'active') return

  const since = new Date(Date.now() - SIGNUP_LOOKBACK_MS).toISOString()
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, created_at')
    .eq('role', 'student')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error || !profiles || profiles.length === 0) return

  const ids = profiles.map(p => p.id)
  const [{ data: users }, { data: existing }] = await Promise.all([
    admin.from('users').select('id, email').in('id', ids),
    admin.from('email_funnel_enrollments').select('lead_id').eq('funnel_id', funnel.id).in('lead_id', ids),
  ])
  const emailById = new Map((users || []).map(u => [u.id, (u.email || '').toLowerCase()]))
  const seen = new Set((existing || []).map(e => e.lead_id))

  for (const profile of profiles) {
    if (seen.has(profile.id)) continue
    const email = emailById.get(profile.id)
    if (!email) continue
    try {
      if (await isUnsubscribed(admin, email)) continue
      const result = await enrollInFunnel(admin, funnel, { profileId: profile.id }, { via: 'signup' })
      if (result.enrolled) summary.signupEnrolled++

      // Link the website lead (if any) to the account and stop the lead track.
      const { data: lead } = await admin.from('email_leads').select('id, profile_id').eq('email', email).maybeSingle()
      if (lead) {
        if (!lead.profile_id) await admin.from('email_leads').update({ profile_id: profile.id, updated_at: new Date().toISOString() }).eq('id', lead.id)
        await cancelEnrollments(admin, { leadId: lead.id }, 'Created an account', ['student_lead'])
      }
    } catch (err) {
      summary.errors.push(`signup ${profile.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

// GET /api/cron/process-email-queue
// Dispatcher for (a) one-off emails scheduled from the template sender and
// (b) due funnel phases. Runs every few minutes from vercel.json.
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const now = new Date()
    const nowIso = now.toISOString()
    const summary = {
      signupEnrolled: 0,
      scheduledSent: 0,
      scheduledFailed: 0,
      funnelSent: 0,
      funnelCompleted: 0,
      funnelSkipped: 0,
      funnelFailed: 0,
      errors: [] as string[],
    }

    // ------------------------------------------------------------------
    // Part 0: auto-enroll new student accounts
    // ------------------------------------------------------------------
    try {
      await sweepNewStudents(admin, summary)
    } catch (err) {
      console.error('[Email Queue Cron] signup sweep failed:', err)
      summary.errors.push(`signup sweep: ${err instanceof Error ? err.message : String(err)}`)
    }

    // ------------------------------------------------------------------
    // Part A: scheduled one-off emails (status 'queued', due scheduled_at)
    // ------------------------------------------------------------------
    const { data: dueEmails, error: dueError } = await admin
      .from('emails')
      .select('id, thread_id, from_address, from_name, to_addresses, subject, body_text, body_html')
      .eq('status', 'queued')
      .eq('is_inbound', false)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', nowIso)
      .limit(BATCH_LIMIT)

    if (dueError) console.error('[Email Queue Cron] Error fetching due emails:', dueError)

    for (const email of dueEmails || []) {
      // Claim: only proceed if we flipped it from queued -> sending ourselves
      const { data: claimed } = await admin
        .from('emails')
        .update({ status: 'sending', updated_at: nowIso })
        .eq('id', email.id)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle()
      if (!claimed) continue

      try {
        const to = Array.isArray(email.to_addresses) ? email.to_addresses : []
        if (to.length === 0 || !to[0]?.email) throw new Error('No recipient address')

        const result = await sendEmail({
          to,
          from: { email: email.from_address, name: email.from_name || undefined },
          subject: email.subject || '(no subject)',
          text: email.body_text || undefined,
          html: email.body_html || undefined,
        })
        await admin
          .from('emails')
          .update({ status: 'sent', sent_at: new Date().toISOString(), sendgrid_message_id: result.messageId })
          .eq('id', email.id)
        if (email.thread_id) {
          await admin.from('email_threads').update({ last_message_at: new Date().toISOString() }).eq('id', email.thread_id)
        }
        summary.scheduledSent++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[Email Queue Cron] Failed to send scheduled email:', email.id, err)
        await admin.from('emails').update({ status: 'failed', error_message: message }).eq('id', email.id)
        summary.scheduledFailed++
        summary.errors.push(`email ${email.id}: ${message}`)
      }
    }

    // ------------------------------------------------------------------
    // Part B: due funnel enrollments
    // ------------------------------------------------------------------
    const { data: dueEnrollments, error: enrollError } = await admin
      .from('email_funnel_enrollments')
      .select('id, funnel_id, lead_id, contact_id, current_phase, enrolled_by, next_email_scheduled_at')
      .eq('status', 'active')
      .not('next_email_scheduled_at', 'is', null)
      .lte('next_email_scheduled_at', nowIso)
      .order('next_email_scheduled_at', { ascending: true })
      .limit(BATCH_LIMIT)

    if (enrollError) console.error('[Email Queue Cron] Error fetching due enrollments:', enrollError)

    const accountCache = new Map<string, SendingAccount | null>()

    for (const enrollment of dueEnrollments || []) {
      const scheduledFor = enrollment.next_email_scheduled_at as string

      // Claim the row by pushing its due time forward. If another run got
      // here first the conditional update matches nothing and we move on.
      const { data: claimed } = await admin
        .from('email_funnel_enrollments')
        .update({ next_email_scheduled_at: new Date(now.getTime() + CLAIM_MS).toISOString(), updated_at: nowIso })
        .eq('id', enrollment.id)
        .eq('status', 'active')
        .eq('current_phase', enrollment.current_phase)
        .lte('next_email_scheduled_at', nowIso)
        .select('id')
        .maybeSingle()
      if (!claimed) continue

      const retryLater = async (reason: string) => {
        summary.funnelFailed++
        summary.errors.push(`enrollment ${enrollment.id}: ${reason}`)
        await admin
          .from('email_funnel_enrollments')
          .update({ next_email_scheduled_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(), updated_at: new Date().toISOString() })
          .eq('id', enrollment.id)
      }

      try {
        const { data: funnel } = await admin
          .from('email_funnels')
          .select('id, status, is_deleted, total_emails_sent, total_completed, phases:email_funnel_phases(id, phase_order, delay_days, delay_hours, template_id, emails_sent)')
          .eq('id', enrollment.funnel_id)
          .maybeSingle()

        if (!funnel || funnel.is_deleted || funnel.status !== 'active') {
          // Funnel paused or gone: leave the enrollment alone (still active)
          // but un-claim it so it fires as soon as the funnel is reactivated.
          await admin.from('email_funnel_enrollments').update({ next_email_scheduled_at: scheduledFor }).eq('id', enrollment.id)
          summary.funnelSkipped++
          continue
        }

        const phases = ((funnel.phases || []) as PhaseRow[]).sort((a, b) => a.phase_order - b.phase_order)
        const phase = phases.find(p => p.phase_order === enrollment.current_phase)
        const nextPhase = phases.find(p => p.phase_order === enrollment.current_phase + 1)

        if (!phase) {
          await admin
            .from('email_funnel_enrollments')
            .update({ status: 'completed', completed_at: nowIso, next_email_scheduled_at: null, updated_at: nowIso })
            .eq('id', enrollment.id)
          summary.funnelCompleted++
          continue
        }

        // Recipient: an account (lead_id = profiles.id, email in the users
        // mirror) or a website lead (contact_id = email_leads.id).
        let recipient: RecipientContext
        let recipientUnsubscribed = false
        if (enrollment.lead_id) {
          const [{ data: profileRow }, { data: userRow }] = await Promise.all([
            admin.from('profiles').select('id, first_name, last_name, name').eq('id', enrollment.lead_id).maybeSingle(),
            admin.from('users').select('id, email').eq('id', enrollment.lead_id).maybeSingle(),
          ])
          recipient = {
            first_name: profileRow?.first_name ?? null,
            last_name: profileRow?.last_name ?? null,
            name: profileRow?.name ?? null,
            email: userRow?.email ?? null,
          }
        } else if (enrollment.contact_id) {
          const { data: leadRow } = await admin
            .from('email_leads')
            .select('id, first_name, last_name, email, is_unsubscribed')
            .eq('id', enrollment.contact_id)
            .maybeSingle()
          recipient = {
            first_name: leadRow?.first_name ?? null,
            last_name: leadRow?.last_name ?? null,
            name: null,
            email: leadRow?.email ?? null,
          }
          recipientUnsubscribed = !!leadRow?.is_unsubscribed
        } else {
          recipient = { email: null }
        }
        if (!recipient.email) {
          await admin
            .from('email_funnel_enrollments')
            .update({ status: 'cancelled', cancelled_at: nowIso, cancel_reason: 'Recipient has no email address', next_email_scheduled_at: null, updated_at: nowIso })
            .eq('id', enrollment.id)
          summary.funnelSkipped++
          continue
        }
        if (recipientUnsubscribed || (await isUnsubscribed(admin, recipient.email))) {
          await admin
            .from('email_funnel_enrollments')
            .update({ status: 'cancelled', cancelled_at: nowIso, cancel_reason: 'Unsubscribed', next_email_scheduled_at: null, updated_at: nowIso })
            .eq('id', enrollment.id)
          summary.funnelSkipped++
          continue
        }

        // Skip a phase that already has a sent log (belt and braces against
        // a crash between send and advance).
        const { data: alreadySent } = await admin
          .from('email_funnel_logs')
          .select('id')
          .eq('enrollment_id', enrollment.id)
          .eq('phase_id', phase.id)
          .eq('status', 'sent')
          .limit(1)
          .maybeSingle()

        if (!alreadySent) {
          const { data: template } = phase.template_id
            ? await admin.from('email_templates').select('id, subject, preheader, body, body_html, is_active, is_deleted').eq('id', phase.template_id).maybeSingle()
            : { data: null }

          if (!template || template.is_deleted || !template.is_active || !templateHtml(template)) {
            await retryLater(`phase ${phase.phase_order} has no usable template`)
            continue
          }

          const account = await resolveSendingAccount(admin, enrollment.enrolled_by, accountCache)
          if (!account) {
            await retryLater('no verified sending mailbox configured')
            continue
          }

          let senderProfile: { name: string | null; first_name: string | null } | null = null
          if (enrollment.enrolled_by) {
            const { data } = await admin.from('profiles').select('name, first_name, last_name').eq('id', enrollment.enrolled_by).maybeSingle()
            if (data) senderProfile = { name: data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || null, first_name: data.first_name }
          }
          const sender: SenderContext = {
            name: account.display_name || senderProfile?.name || null,
            first_name: senderProfile?.first_name || null,
            email: account.email_address,
          }

          const rendered = renderEmailTemplate(template, { recipient, sender })
          const messageId = generateMessageId(account.domain)

          const { data: thread } = await admin
            .from('email_threads')
            .insert({
              email_account_id: account.id,
              organization_id: account.organization_id,
              subject: rendered.subject || '(no subject)',
              folder: 'sent',
              is_read: true,
              last_message_at: nowIso,
            })
            .select()
            .single()

          const emailId = uuidv4()
          await admin.from('emails').insert({
            id: emailId,
            thread_id: thread?.id,
            email_account_id: account.id,
            organization_id: account.organization_id,
            message_id: `<${messageId}>`,
            from_address: account.email_address,
            from_name: account.display_name,
            to_addresses: [{ email: recipient.email, name: recipientName(recipient) || null }],
            subject: rendered.subject,
            body_text: rendered.text,
            body_html: rendered.html,
            snippet: generateSnippet(rendered.text),
            status: 'sending',
            is_inbound: false,
            is_read: true,
          })

          let sendResult: { messageId: string }
          try {
            sendResult = await sendEmail({
              to: [{ email: recipient.email, name: recipientName(recipient) || undefined }],
              from: { email: account.email_address, name: account.display_name || undefined },
              subject: rendered.subject,
              text: rendered.text || undefined,
              html: rendered.html,
              headers: { 'Message-ID': `<${messageId}>`, ...listUnsubscribeHeaders(recipient.email) },
            })
          } catch (sendErr) {
            const message = sendErr instanceof Error ? sendErr.message : String(sendErr)
            await admin.from('emails').update({ status: 'failed', error_message: message }).eq('id', emailId)
            await admin.from('email_funnel_logs').insert({
              enrollment_id: enrollment.id,
              phase_id: phase.id,
              email_id: emailId,
              scheduled_for: scheduledFor,
              status: 'failed',
              error_message: message,
            })
            await retryLater(message)
            continue
          }

          const sentAt = new Date().toISOString()
          await admin.from('emails').update({ status: 'sent', sent_at: sentAt, sendgrid_message_id: sendResult.messageId }).eq('id', emailId)
          await admin.from('email_funnel_logs').insert({
            enrollment_id: enrollment.id,
            phase_id: phase.id,
            email_id: emailId,
            sent_at: sentAt,
            scheduled_for: scheduledFor,
            status: 'sent',
          })
          await admin.from('email_funnel_phases').update({ emails_sent: (phase.emails_sent || 0) + 1, updated_at: sentAt }).eq('id', phase.id)
          await admin.from('email_funnels').update({ total_emails_sent: (funnel.total_emails_sent || 0) + 1, updated_at: sentAt }).eq('id', funnel.id)
          summary.funnelSent++
        }

        // Advance to the next phase or complete
        if (nextPhase) {
          await admin
            .from('email_funnel_enrollments')
            .update({
              current_phase: nextPhase.phase_order,
              last_email_sent_at: nowIso,
              next_email_scheduled_at: new Date(Date.now() + phaseDelayMs(nextPhase)).toISOString(),
              updated_at: nowIso,
            })
            .eq('id', enrollment.id)
        } else {
          await admin
            .from('email_funnel_enrollments')
            .update({ status: 'completed', completed_at: nowIso, last_email_sent_at: nowIso, next_email_scheduled_at: null, updated_at: nowIso })
            .eq('id', enrollment.id)
          await admin.from('email_funnels').update({ total_completed: (funnel.total_completed || 0) + 1 }).eq('id', funnel.id)
          summary.funnelCompleted++
        }
      } catch (err) {
        console.error('[Email Queue Cron] Failed to process enrollment:', enrollment.id, err)
        await retryLater(err instanceof Error ? err.message : String(err))
      }
    }

    console.log('[Email Queue Cron]', summary)
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[Email Queue Cron] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
