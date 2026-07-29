import { sendEmail } from '@/lib/sendgrid'

export const HELLO_FORWARD_FROM = 'hello@voicealchemyacademy.com'
export const JULIA_FORWARD_TO = 'voicealchemyacademy@gmail.com'

export interface InboundForwardAttachment {
  content: string
  filename: string
  type?: string
  disposition?: 'attachment' | 'inline'
  contentId?: string
}

export interface ForwardInboundEmailParams {
  accountEmail: string
  fromEmail: string
  fromName?: string | null
  toAddresses: string[]
  ccAddresses?: string[]
  subject?: string | null
  bodyText?: string | null
  bodyHtml?: string | null
  attachments?: InboundForwardAttachment[]
  messageId?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isHelloAddress(value?: string | null): boolean {
  return (value || '').trim().toLowerCase() === HELLO_FORWARD_FROM
}

export function shouldForwardHelloInbound(accountEmail: string, toAddresses: string[], ccAddresses: string[] = []): boolean {
  if (isHelloAddress(accountEmail)) return true
  return [...toAddresses, ...ccAddresses].some(isHelloAddress)
}

export async function forwardHelloInboundEmail(params: ForwardInboundEmailParams): Promise<void> {
  if (!shouldForwardHelloInbound(params.accountEmail, params.toAddresses, params.ccAddresses)) return

  const originalSubject = params.subject?.trim() || '(no subject)'
  const subject = originalSubject.toLowerCase().startsWith('fwd:')
    ? originalSubject
    : `Fwd: ${originalSubject}`
  const fromDisplay = params.fromName
    ? `${params.fromName} <${params.fromEmail}>`
    : params.fromEmail
  const toDisplay = params.toAddresses.join(', ')
  const ccDisplay = params.ccAddresses?.length ? params.ccAddresses.join(', ') : ''
  const originalBodyText = params.bodyText || ''
  const originalBodyHtml = params.bodyHtml || (originalBodyText ? `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(originalBodyText)}</pre>` : '')

  const textLines = [
    `Forwarded message from ${HELLO_FORWARD_FROM}`,
    '',
    `From: ${fromDisplay}`,
    `To: ${toDisplay}`,
    ...(ccDisplay ? [`Cc: ${ccDisplay}`] : []),
    `Subject: ${originalSubject}`,
    '',
    originalBodyText || '[HTML email forwarded below]',
  ]

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">
      <p>Forwarded message from <strong>${escapeHtml(HELLO_FORWARD_FROM)}</strong></p>
      <div style="border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db;padding:12px 0;margin:12px 0;color:#374151">
        <div><strong>From:</strong> ${escapeHtml(fromDisplay)}</div>
        <div><strong>To:</strong> ${escapeHtml(toDisplay)}</div>
        ${ccDisplay ? `<div><strong>Cc:</strong> ${escapeHtml(ccDisplay)}</div>` : ''}
        <div><strong>Subject:</strong> ${escapeHtml(originalSubject)}</div>
      </div>
      <div>${originalBodyHtml}</div>
    </div>
  `

  await sendEmail({
    to: [{ email: JULIA_FORWARD_TO }],
    from: { email: HELLO_FORWARD_FROM, name: 'Voice Alchemy Academy' },
    replyTo: params.fromEmail ? { email: params.fromEmail, name: params.fromName || undefined } : undefined,
    subject,
    text: textLines.join('\n'),
    html,
    attachments: params.attachments,
    headers: params.messageId
      ? {
          'X-VAAA-Forwarded-Message-ID': params.messageId,
        }
      : undefined,
    trackingSettings: {
      clickTracking: { enable: false },
      openTracking: { enable: false },
      subscriptionTracking: { enable: false },
    },
  })
}
