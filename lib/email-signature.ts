// Email Signature Generation Utilities

/**
 * Optional hosted logo for signatures. Set NEXT_PUBLIC_EMAIL_LOGO_URL to a
 * public PNG (for example one uploaded through the template image uploader).
 * Without it the signature renders a text wordmark instead of an image, so
 * nothing broken ever ships in an email.
 */
function signatureLogoHtml(): string {
  const url = (process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || '').trim()
  if (url) {
    return `<img src="${url}" alt="Voice Alchemy Academy" style="height: 80px; width: auto;">`
  }
  return `<div style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: bold; color: #171229; line-height: 1.2;">Voice<br>Alchemy<br><span style="color: #CEB466;">Academy</span></div>`
}

// Format phone for display
function formatPhoneDisplay(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

export interface SignatureConfig {
  name: string
  title: string
  phone: string
  email: string
  /** @deprecated Citadel-era badges; ignored. Kept so stored configs still type-check. */
  includeTrustBadges?: boolean
  /** @deprecated Citadel-era press logos; ignored. */
  includeAsSeenOn?: boolean
}

// Default signature for Devin Fox
export const DEVIN_FOX_SIGNATURE: SignatureConfig = {
  name: 'Devin Fox',
  title: 'Founder & Vocal Instructor',
  phone: '818.209.2305',
  email: 'devin@voicealchemyacademy.com',
}

/**
 * Generate a professional email signature HTML
 */
export function generateSignatureHtml(config: SignatureConfig): string {
  const { name, title, phone, email } = config
  const formattedPhone = formatPhoneDisplay(phone)

  return `
    <!-- Email Signature -->
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px; border-collapse: collapse;">
      <tr>
        <td style="padding-right: 20px; vertical-align: top;">
          <!-- Left Column - Contact Info -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; color: #000; padding-bottom: 4px;">
                ${name}
              </td>
            </tr>
            ${title ? `<tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 12px;">
                ${title}
              </td>
            </tr>` : ''}
            ${formattedPhone ? `<tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="font-weight: 600; color: #CEB466; margin-right: 6px;">P:</span>${formattedPhone}
              </td>
            </tr>` : ''}
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="font-weight: 600; color: #CEB466; margin-right: 6px;">E:</span><a href="mailto:${email}" style="color: #333; text-decoration: none;">${email}</a>
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                <span style="font-weight: 600; color: #CEB466; margin-right: 6px;">W:</span><a href="https://www.voicealchemyacademy.com" style="color: #333; text-decoration: none;">www.voicealchemyacademy.com</a>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align: top; padding-left: 20px;">
          <!-- Right Column - Logo -->
          ${signatureLogoHtml()}
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <div style="border-top: 2px solid #c9a227; margin: 25px 0 20px 0; max-width: 500px;"></div>`
}

/**
 * Generate a simple text-only signature
 */
export function generateSignatureText(config: SignatureConfig): string {
  const { name, title, phone, email } = config
  return `
--
${name}
${title}
${phone}
${email}
www.voicealchemyacademy.com
`.trim()
}

/**
 * Resolve a rep's job title from their email address.
 * Everyone defaults to "Vocal Coach & Instructor" except specific named users.
 */
export function resolveRepTitle(email: string): string {
  const normalized = (email || '').trim().toLowerCase()
  if (normalized === 'devin@voicealchemyacademy.com' || normalized === 'devinfox@voicealchemyacademy.com') {
    return 'Founder & Vocal Instructor'
  }
  return 'Vocal Coach & Instructor'
}

/**
 * Format a phone number with spaces (e.g. 8006055597 -> "800 605 5597").
 * Matches the Quick Send signature formatting.
 */
function formatSignaturePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  return phone
}

export interface StandardSignatureConfig {
  name: string
  title: string
  phone: string
  email: string
}

/**
 * Standard per-user email signature used in compose / reply / forward.
 *
 * Uses the exact same table-based format as Quick Send for email client compatibility.
 * This signature is rendered as an HTML preview below the compose editor (not inside TipTap).
 */
export function generateStandardSignatureHtml(config: StandardSignatureConfig): string {
  const { name, title, phone, email } = config
  const formattedPhone = formatSignaturePhone(phone)

  return `
    <!-- Email Signature -->
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px; border-collapse: collapse;">
      <tr>
        <td style="padding-right: 20px; vertical-align: top;">
          <!-- Left Column - Contact Info -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; color: #000; padding-bottom: 4px;">
                ${name}
              </td>
            </tr>
            ${title ? `<tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 12px;">
                ${title}
              </td>
            </tr>` : ''}
            ${formattedPhone ? `<tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="font-weight: 600; color: #CEB466; margin-right: 6px;">P:</span>${formattedPhone}
              </td>
            </tr>` : ''}
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="font-weight: 600; color: #CEB466; margin-right: 6px;">E:</span><a href="mailto:${email}" style="color: #333; text-decoration: none;">${email}</a>
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                <span style="font-weight: 600; color: #CEB466; margin-right: 6px;">W:</span><a href="https://www.voicealchemyacademy.com" style="color: #333; text-decoration: none;">www.voicealchemyacademy.com</a>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align: top; padding-left: 20px;">
          <!-- Right Column - Logo -->
          ${signatureLogoHtml()}
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <div style="border-top: 2px solid #c9a227; margin: 25px 0 20px 0; max-width: 500px;"></div>`
}

/**
 * Generate a minimal signature (just name and contact)
 */
export function generateMinimalSignatureHtml(config: Pick<SignatureConfig, 'name' | 'title' | 'phone' | 'email'>): string {
  const { name, title, phone, email } = config
  const formattedPhone = formatPhoneDisplay(phone)

  return `
    <div style="margin-top: 24px; font-family: Arial, sans-serif;">
      <div style="font-size: 16px; font-weight: bold; color: #000;">${name}</div>
      <div style="font-size: 14px; color: #666; margin-top: 2px;">${title}</div>
      <div style="font-size: 14px; color: #333; margin-top: 8px;">
        <span>P: ${formattedPhone}</span>
        <span style="margin: 0 8px;">|</span>
        <a href="mailto:${email}" style="color: #333; text-decoration: none;">E: ${email}</a>
      </div>
    </div>
  `
}
