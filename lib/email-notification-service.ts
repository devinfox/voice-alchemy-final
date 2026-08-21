import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/sendgrid'
import { sendSms } from '@/lib/telnyx-sms'
import crypto from 'crypto'

interface NotifyUserParams {
  userId: string
  emailId: string
  threadId: string
  fromEmail: string
  fromName: string | null
  subject: string
}

interface NotificationResult {
  success: boolean
  emailSent: boolean
  smsSent: boolean
  error?: string
}

/**
 * Notify a user that they received an email in Voice Alchemy
 * Sends notification to their personal email and/or phone based on preferences
 */
export async function notifyUserOfEmail(params: NotifyUserParams): Promise<NotificationResult> {
  const { userId, emailId, threadId, fromEmail, fromName, subject } = params
  const supabase = getSupabaseAdmin()

  // Get user with notification preferences
  const { data: user, error } = await supabase
    .from('users')
    .select(`
      id,
      first_name,
      personal_email,
      personal_phone,
      email_notification_enabled,
      sms_notification_enabled,
      notification_quiet_hours_start,
      notification_quiet_hours_end,
      organization_id
    `)
    .eq('id', userId)
    .single()

  if (error || !user) {
    console.error('[EmailNotification] User not found:', userId, error)
    return { success: false, emailSent: false, smsSent: false, error: 'User not found' }
  }

  // Verify the email actually belongs to an account owned by this user (same
  // org). This prevents a caller from emailing/SMSing an arbitrary email's body
  // to an unrelated user. We join through email_accounts and constrain by both
  // the account's user_id and organization_id.
  const { data: ownedEmail } = await supabase
    .from('emails')
    .select('id, body_html, body_text, snippet, email_account_id, email_accounts!inner(user_id, organization_id)')
    .eq('id', emailId)
    .eq('email_accounts.user_id', userId)
    .eq('email_accounts.organization_id', user.organization_id)
    .maybeSingle()

  if (!ownedEmail) {
    console.error('[EmailNotification] Email does not belong to user/org:', { emailId, userId })
    return { success: false, emailSent: false, smsSent: false, error: 'Email not found for user' }
  }

  // Check if any notification method is enabled
  if (!user.email_notification_enabled && !user.sms_notification_enabled) {
    console.log('[EmailNotification] Notifications disabled for user:', userId)
    return { success: true, emailSent: false, smsSent: false }
  }

  // Check quiet hours
  if (isInQuietHours(user.notification_quiet_hours_start, user.notification_quiet_hours_end)) {
    console.log('[EmailNotification] Skipping notification - quiet hours for user:', userId)
    return { success: true, emailSent: false, smsSent: false }
  }

  // Generate magic link token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000) // 20 minutes

  const { error: tokenError } = await supabase.from('email_notification_tokens').insert({
    user_id: userId,
    token,
    email_id: emailId,
    thread_id: threadId,
    expires_at: expiresAt.toISOString(),
  })

  if (tokenError) {
    console.error('[EmailNotification] Failed to create token:', tokenError)
    return { success: false, emailSent: false, smsSent: false, error: 'Failed to create token' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.voicealchemyacademy.com'
  const magicLink = `${appUrl}/api/auth/magic-link/verify?token=${token}`
  const senderDisplay = fromName ? `${fromName} <${fromEmail}>` : fromEmail

  // Use the already-verified, org-owned email body (fetched above).
  const emailRow = ownedEmail

  // Send notifications
  let emailSent = false
  let smsSent = false

  if (user.email_notification_enabled && user.personal_email) {
    try {
      await sendEmailNotification({
        to: user.personal_email,
        firstName: user.first_name || 'there',
        sender: senderDisplay,
        subject,
        magicLink,
        bodyHtml: emailRow?.body_html || null,
        bodyText: emailRow?.body_text || emailRow?.snippet || null,
      })
      emailSent = true
      console.log('[EmailNotification] Email notification sent to:', user.personal_email)
    } catch (err) {
      console.error('[EmailNotification] Failed to send email notification:', err)
    }
  }

  if (user.sms_notification_enabled && user.personal_phone) {
    try {
      await sendSmsNotification({
        to: user.personal_phone,
        sender: fromName || fromEmail,
        subject,
        magicLink,
      })
      smsSent = true
      console.log('[EmailNotification] SMS notification sent to:', user.personal_phone)
    } catch (err) {
      console.error('[EmailNotification] Failed to send SMS notification:', err)
    }
  }

  return { success: true, emailSent, smsSent }
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false

  const now = new Date()
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end
  }
  return currentTime >= start && currentTime < end
}

/**
 * Send email notification via SendGrid
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function sendEmailNotification(params: {
  to: string
  firstName: string
  sender: string
  subject: string
  magicLink: string
  bodyHtml?: string | null
  bodyText?: string | null
}): Promise<void> {
  const LOGO = 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/quick-send-logo.png'

  // Render the full received message: prefer HTML, fall back to escaped plain text
  const messageBody = params.bodyHtml
    ? params.bodyHtml
    : params.bodyText
      ? escapeHtml(params.bodyText).replace(/\r?\n/g, '<br>')
      : '<span style="color:#999;">(No preview available — open the message to read it.)</span>'

  await sendEmail({
    to: [{ email: params.to }],
    from: { email: process.env.SENDGRID_FROM_EMAIL || 'noreply@voicealchemyacademy.com', name: 'Voice Alchemy Academy Notification' },
    subject: `New email from ${params.sender}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', Times, serif; background-color: #f5f5f5;">
  <div style="max-width: 640px; margin: 0 auto;">
    <!-- Header -->
    <div style="background-color: #3d4a3a; padding: 20px 20px 24px; text-align: center; border-bottom: 3px solid #d4af37;">
      <img src="${LOGO}" alt="Voice Alchemy Academy" style="height: 70px; margin-bottom: 10px;">
      <div style="color: #ffffff; font-size: 13px;">
        800-605-5597 | <a href="https://voicealchemyacademy.com" style="color: #d4af37; text-decoration: underline;">voicealchemyacademy.com</a>
      </div>
    </div>

    <!-- Body -->
    <div style="background-color: #ffffff; padding: 28px 28px 12px;">
      <p style="margin: 0 0 14px; color: #333333; font-size: 16px;">Hi ${params.firstName},</p>
      <p style="margin: 0 0 18px; color: #333333; font-size: 15px;">You received a new email in Voice Alchemy Academy:</p>

      <div style="border-left: 3px solid #d4af37; background: #faf8f2; padding: 14px 16px; margin: 0 0 18px;">
        <p style="margin: 0 0 6px; color: #555555; font-size: 14px;"><strong style="color:#3d4a3a;">From:</strong> ${escapeHtml(params.sender)}</p>
        <p style="margin: 0; color: #555555; font-size: 14px;"><strong style="color:#3d4a3a;">Subject:</strong> ${escapeHtml(params.subject)}</p>
      </div>

      <div style="border: 1px solid #e5e5e5; border-radius: 6px; padding: 18px; margin: 0 0 24px; color: #333333; font-size: 14px; line-height: 1.6; overflow-wrap: break-word; word-break: break-word;">
        ${messageBody}
      </div>

      <div style="text-align: center; margin: 0 0 6px;">
        <a href="${params.magicLink}" style="display: inline-block; background: linear-gradient(135deg, #d4af37 0%, #f4d03f 50%, #d4af37 100%); color: #1a1a1a; padding: 13px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Open</a>
      </div>
      <p style="color: #999999; font-size: 12px; text-align: center; margin: 12px 0 0;">This secure link expires in 20 minutes and can only be used once.</p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f0f0f0; padding: 22px 20px; text-align: center; font-size: 12px; color: #666666;">
      <p style="margin: 0;">Voice Alchemy Academy | 2029 Century Park E #400N | Los Angeles, CA 90067</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    text: `Hi ${params.firstName},\n\nYou received a new email in Voice Alchemy Academy:\n\nFrom: ${params.sender}\nSubject: ${params.subject}\n\n${params.bodyText || '(open the message to read it)'}\n\nOpen it here: ${params.magicLink}\n\nThis link expires in 20 minutes and can only be used once.`,
  })
}

/**
 * Send SMS notification via Twilio
 */
async function sendSmsNotification(params: {
  to: string
  sender: string
  subject: string
  magicLink: string
}): Promise<void> {
  // Truncate subject for SMS
  const truncatedSubject = params.subject.length > 40
    ? params.subject.substring(0, 40) + '...'
    : params.subject

  // Truncate sender for SMS
  const truncatedSender = params.sender.length > 25
    ? params.sender.substring(0, 25) + '...'
    : params.sender

  await sendSms({
    to: params.to,
    body: `Voice Alchemy: Email from ${truncatedSender}\n"${truncatedSubject}"\n\nView: ${params.magicLink}`,
  })
}

/**
 * Determine which notification method will be used
 */
function determineNotificationMethod(user: {
  email_notification_enabled: boolean | null
  sms_notification_enabled: boolean | null
}): string {
  if (user.email_notification_enabled && user.sms_notification_enabled) return 'both'
  if (user.email_notification_enabled) return 'email'
  if (user.sms_notification_enabled) return 'sms'
  return 'none'
}
