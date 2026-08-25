import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/sendgrid'
import { generateMessageId, generateSnippet, stripHtml } from '@/lib/email-utils'
import { v4 as uuidv4 } from 'uuid'

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET

const BATCH_LIMIT = 25

interface Recipient {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  email: string | null
}

function displayName(r: Recipient): string {
  if (r.name) return r.name
  return `${r.first_name || ''} ${r.last_name || ''}`.trim()
}

function renderTemplate(text: string, r: Recipient): string {
  const first = r.first_name || r.name?.split(' ')[0] || ''
  const last = r.last_name || r.name?.split(' ').slice(1).join(' ') || ''
  const replacements: Record<string, string> = {
    '{{first_name}}': first,
    '{{last_name}}': last,
    '{{full_name}}': displayName(r),
    '{{email}}': r.email || '',
  }
  let out = text
  for (const [key, value] of Object.entries(replacements)) {
    out = out.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value)
  }
  return out
}

// GET /api/cron/process-email-queue
// The dispatcher the email system was missing: sends (a) one-off emails that
// were scheduled ("queued" with a due scheduled_at) and (b) due funnel
// enrollment phases. Without this cron, "Schedule Emails" and active funnels
// wrote rows that nothing ever processed.
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const nowIso = new Date().toISOString()
    const summary = {
      scheduledSent: 0,
      scheduledFailed: 0,
      funnelSent: 0,
      funnelCompleted: 0,
      funnelSkipped: 0,
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

    if (dueError) {
      console.error('[Email Queue Cron] Error fetching due emails:', dueError)
    }

    for (const email of dueEmails || []) {
      try {
        const to = Array.isArray(email.to_addresses) ? email.to_addresses : []
        if (to.length === 0 || !to[0]?.email) {
          await admin.from('emails').update({ status: 'failed' }).eq('id', email.id)
          summary.scheduledFailed++
          continue
        }
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
          await admin
            .from('email_threads')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', email.thread_id)
        }
        summary.scheduledSent++
      } catch (err) {
        console.error('[Email Queue Cron] Failed to send scheduled email:', email.id, err)
        await admin.from('emails').update({ status: 'failed' }).eq('id', email.id)
        summary.scheduledFailed++
      }
    }

    // ------------------------------------------------------------------
    // Part B: due funnel enrollments
    // ------------------------------------------------------------------
    const { data: dueEnrollments, error: enrollError } = await admin
      .from('email_funnel_enrollments')
      .select('id, funnel_id, lead_id, current_phase, enrolled_by')
      .eq('status', 'active')
      .not('next_email_scheduled_at', 'is', null)
      .lte('next_email_scheduled_at', nowIso)
      .limit(BATCH_LIMIT)

    if (enrollError) {
      console.error('[Email Queue Cron] Error fetching due enrollments:', enrollError)
    }

    for (const enrollment of dueEnrollments || []) {
      try {
        // Funnel must still be active
        const { data: funnel } = await admin
          .from('email_funnels')
          .select('id, status, is_deleted, total_emails_sent, total_completed, phases:email_funnel_phases(id, phase_order, delay_days, delay_hours, template_id, emails_sent)')
          .eq('id', enrollment.funnel_id)
          .maybeSingle()

        if (!funnel || funnel.is_deleted || funnel.status !== 'active') {
          summary.funnelSkipped++
          continue
        }

        const phases = (funnel.phases || []).sort(
          (a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order
        )
        const phase = phases[enrollment.current_phase - 1]
        if (!phase) {
          // Enrollment points past the last phase — mark completed
          await admin
            .from('email_funnel_enrollments')
            .update({ status: 'completed', completed_at: nowIso, next_email_scheduled_at: null })
            .eq('id', enrollment.id)
          summary.funnelCompleted++
          continue
        }

        // Resolve recipient: enrollment lead_id is a profiles.id; email lives
        // in the users mirror of auth.users.
        const [{ data: profileRow }, { data: userRow }] = await Promise.all([
          admin.from('profiles').select('id, first_name, last_name, name').eq('id', enrollment.lead_id).maybeSingle(),
          admin.from('users').select('id, email').eq('id', enrollment.lead_id).maybeSingle(),
        ])
        const recipient: Recipient = {
          id: enrollment.lead_id,
          first_name: profileRow?.first_name ?? null,
          last_name: profileRow?.last_name ?? null,
          name: profileRow?.name ?? null,
          email: userRow?.email ?? null,
        }
        if (!recipient.email) {
          await admin
            .from('email_funnel_enrollments')
            .update({
              status: 'cancelled',
              cancelled_at: nowIso,
              cancel_reason: 'Recipient has no email address',
              next_email_scheduled_at: null,
            })
            .eq('id', enrollment.id)
          summary.funnelSkipped++
          continue
        }

        // Template for this phase
        const { data: template } = phase.template_id
          ? await admin
              .from('email_templates')
              .select('id, subject, body, body_html')
              .eq('id', phase.template_id)
              .maybeSingle()
          : { data: null }

        let emailId: string | null = null
        if (template) {
          // Sending account: prefer the enroller's active account, else any
          // active account on a verified domain.
          let accountQuery = admin
            .from('email_accounts')
            .select('id, email_address, display_name, organization_id, domain:email_domains(domain, verification_status)')
            .eq('is_active', true)
            .eq('is_deleted', false)
          if (enrollment.enrolled_by) {
            accountQuery = accountQuery.eq('user_id', enrollment.enrolled_by)
          }
          let { data: account } = await accountQuery.limit(1).maybeSingle()
          if (!account && enrollment.enrolled_by) {
            const { data: fallback } = await admin
              .from('email_accounts')
              .select('id, email_address, display_name, organization_id, domain:email_domains(domain, verification_status)')
              .eq('is_active', true)
              .eq('is_deleted', false)
              .limit(1)
              .maybeSingle()
            account = fallback
          }
          const domainInfo = Array.isArray(account?.domain) ? account?.domain[0] : account?.domain
          if (!account || domainInfo?.verification_status !== 'verified') {
            console.error('[Email Queue Cron] No verified sending account for enrollment', enrollment.id)
            summary.funnelSkipped++
            continue
          }

          const subject = renderTemplate(template.subject || '', recipient)
          const bodyHtml = renderTemplate(template.body_html || template.body || '', recipient)
          const bodyText = renderTemplate(stripHtml(template.body_html || '') || template.body || '', recipient)

          const { data: thread } = await admin
            .from('email_threads')
            .insert({
              email_account_id: account.id,
              organization_id: account.organization_id,
              subject: subject || '(no subject)',
              folder: 'sent',
              is_read: true,
              last_message_at: nowIso,
            })
            .select()
            .single()

          emailId = uuidv4()
          await admin.from('emails').insert({
            id: emailId,
            thread_id: thread?.id,
            email_account_id: account.id,
            organization_id: account.organization_id,
            message_id: `<${generateMessageId(domainInfo.domain)}>`,
            from_address: account.email_address,
            from_name: account.display_name,
            to_addresses: [{ email: recipient.email, name: displayName(recipient) || null }],
            subject,
            body_text: bodyText,
            body_html: bodyHtml,
            snippet: generateSnippet(bodyText || stripHtml(bodyHtml)),
            status: 'sending',
            is_inbound: false,
            is_read: true,
          })

          const result = await sendEmail({
            to: [{ email: recipient.email, name: displayName(recipient) || undefined }],
            from: { email: account.email_address, name: account.display_name || undefined },
            subject,
            text: bodyText || undefined,
            html: bodyHtml || undefined,
          })

          await admin
            .from('emails')
            .update({ status: 'sent', sent_at: new Date().toISOString(), sendgrid_message_id: result.messageId })
            .eq('id', emailId)

          await admin.from('email_funnel_logs').insert({
            enrollment_id: enrollment.id,
            phase_id: phase.id,
            email_id: emailId,
            sent_at: new Date().toISOString(),
            scheduled_for: nowIso,
            status: 'sent',
          })

          await admin
            .from('email_funnel_phases')
            .update({ emails_sent: (phase.emails_sent || 0) + 1 })
            .eq('id', phase.id)
          await admin
            .from('email_funnels')
            .update({ total_emails_sent: (funnel.total_emails_sent || 0) + 1 })
            .eq('id', funnel.id)

          summary.funnelSent++
        } else {
          console.error('[Email Queue Cron] Phase has no template, advancing enrollment', enrollment.id)
        }

        // Advance to the next phase or complete
        const nextPhase = phases[enrollment.current_phase]
        if (nextPhase) {
          const delayMs =
            (((nextPhase.delay_days || 0) * 24 + (nextPhase.delay_hours || 0)) * 60) * 60 * 1000
          await admin
            .from('email_funnel_enrollments')
            .update({
              current_phase: enrollment.current_phase + 1,
              last_email_sent_at: nowIso,
              next_email_scheduled_at: new Date(Date.now() + delayMs).toISOString(),
            })
            .eq('id', enrollment.id)
        } else {
          await admin
            .from('email_funnel_enrollments')
            .update({
              status: 'completed',
              completed_at: nowIso,
              last_email_sent_at: nowIso,
              next_email_scheduled_at: null,
            })
            .eq('id', enrollment.id)
          await admin
            .from('email_funnels')
            .update({ total_completed: (funnel.total_completed || 0) + 1 })
            .eq('id', funnel.id)
          summary.funnelCompleted++
        }
      } catch (err) {
        console.error('[Email Queue Cron] Failed to process enrollment:', enrollment.id, err)
        summary.funnelSkipped++
      }
    }

    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[Email Queue Cron] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
