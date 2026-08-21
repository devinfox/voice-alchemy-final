// Email Provider Abstraction Layer
// Unified interface for SendGrid and Microsoft email providers

import { EmailProviderType } from '@/types/email.types'

// ============================================================================
// INTERFACES
// ============================================================================

export interface EmailRecipient {
  email: string
  name?: string
}

export interface SendEmailParams {
  from: {
    email: string
    name?: string
  }
  to: EmailRecipient[]
  cc?: EmailRecipient[]
  bcc?: EmailRecipient[]
  subject: string
  bodyHtml?: string
  bodyText?: string
  replyTo?: string
  attachments?: Array<{
    filename: string
    content: string // Base64 for Microsoft, raw content for SendGrid
    contentType: string
    contentId?: string // For inline attachments
  }>
  headers?: Record<string, string>
  // CRM integration
  threadId?: string
  leadId?: string
  contactId?: string
  dealId?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface EmailProvider {
  type: EmailProviderType
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>
}

// ============================================================================
// SENDGRID PROVIDER
// ============================================================================

export class SendGridProvider implements EmailProvider {
  type: EmailProviderType = 'sendgrid'

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: params.from,
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          bodyHtml: params.bodyHtml,
          bodyText: params.bodyText,
          replyTo: params.replyTo,
          attachments: params.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            type: a.contentType,
            content_id: a.contentId,
          })),
          threadId: params.threadId,
          leadId: params.leadId,
          contactId: params.contactId,
          dealId: params.dealId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error || 'Send failed' }
      }

      return { success: true, messageId: data.messageId }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

// ============================================================================
// MICROSOFT PROVIDER
// ============================================================================

export class MicrosoftProvider implements EmailProvider {
  type: EmailProviderType = 'microsoft'
  private accountId: string

  constructor(accountId: string) {
    this.accountId = accountId
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const response = await fetch('/api/email/microsoft/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: this.accountId,
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          bodyHtml: params.bodyHtml,
          bodyText: params.bodyText,
          attachments: params.attachments?.map((a) => ({
            name: a.filename,
            contentType: a.contentType,
            contentBytes: a.content, // Must be Base64
          })),
          threadId: params.threadId,
          leadId: params.leadId,
          contactId: params.contactId,
          dealId: params.dealId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error || 'Send failed' }
      }

      return { success: true, messageId: data.emailId }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

// ============================================================================
// GMAIL PROVIDER
// ============================================================================

export class GmailProvider implements EmailProvider {
  type: EmailProviderType = 'gmail'
  private accountId: string

  constructor(accountId: string) {
    this.accountId = accountId
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const response = await fetch('/api/email/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: this.accountId,
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          bodyHtml: params.bodyHtml,
          bodyText: params.bodyText,
          threadId: params.threadId,
          leadId: params.leadId,
          contactId: params.contactId,
          dealId: params.dealId,
          // Transform attachments for Gmail API
          attachments: params.attachments?.map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            content: a.content, // Base64 encoded
            contentId: a.contentId,
          })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error || 'Send failed' }
      }

      return { success: true, messageId: data.emailId }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

export interface EmailAccountInfo {
  id: string
  provider: EmailProviderType
  email_address: string
  display_name?: string
}

/**
 * Gets the appropriate email provider for an account
 */
export function getEmailProvider(account: EmailAccountInfo): EmailProvider {
  switch (account.provider) {
    case 'microsoft':
      return new MicrosoftProvider(account.id)
    case 'gmail':
      return new GmailProvider(account.id)
    case 'sendgrid':
    default:
      return new SendGridProvider()
  }
}

/**
 * Sends an email using the appropriate provider for the account
 */
export async function sendEmailWithProvider(
  account: EmailAccountInfo,
  params: Omit<SendEmailParams, 'from'>
): Promise<SendEmailResult> {
  const provider = getEmailProvider(account)

  return provider.sendEmail({
    ...params,
    from: {
      email: account.email_address,
      name: account.display_name,
    },
  })
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Triggers email sync for Microsoft accounts
 */
export async function syncMicrosoftEmails(
  tokenId?: string,
  fullSync: boolean = false
): Promise<{ success: boolean; results?: any[]; error?: string }> {
  try {
    const response = await fetch('/api/email/microsoft/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId, fullSync }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error }
    }

    return { success: true, results: data.results }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Triggers email sync for Gmail accounts
 */
export async function syncGmailEmails(
  tokenId?: string,
  fullSync: boolean = false
): Promise<{ success: boolean; results?: any[]; error?: string }> {
  try {
    const response = await fetch('/api/email/gmail/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId, fullSync }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error }
    }

    return { success: true, results: data.results }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Syncs emails for a specific provider
 */
export async function syncEmails(
  provider: EmailProviderType,
  tokenId?: string,
  fullSync: boolean = false
): Promise<{ success: boolean; results?: any[]; error?: string }> {
  switch (provider) {
    case 'microsoft':
      return syncMicrosoftEmails(tokenId, fullSync)
    case 'gmail':
      return syncGmailEmails(tokenId, fullSync)
    default:
      return { success: false, error: 'Provider does not support sync' }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts file to base64 for attachments
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = (error) => reject(error)
  })
}

/**
 * Gets provider display name
 */
export function getProviderDisplayName(provider: EmailProviderType): string {
  switch (provider) {
    case 'microsoft':
      return 'Microsoft 365'
    case 'gmail':
      return 'Gmail'
    case 'sendgrid':
    default:
      return 'Email'
  }
}

/**
 * Gets provider icon/color
 */
export function getProviderStyle(provider: EmailProviderType): {
  color: string
  bgColor: string
  icon: string
} {
  switch (provider) {
    case 'microsoft':
      return {
        color: '#00a4ef',
        bgColor: 'rgba(0, 164, 239, 0.1)',
        icon: '',
      }
    case 'gmail':
      return {
        color: '#ea4335',
        bgColor: 'rgba(234, 67, 53, 0.1)',
        icon: '',
      }
    case 'sendgrid':
    default:
      return {
        color: '#1a82e2',
        bgColor: 'rgba(26, 130, 226, 0.1)',
        icon: '',
      }
  }
}
