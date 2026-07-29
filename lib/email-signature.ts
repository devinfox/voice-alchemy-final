// Email Signature Generation Utilities

const EMAIL_IMAGES = {
  sigLogo: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/citadel-logo-no-shadow-small.png',
  sigBbb: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/bb-rating.png',
  sigGoogle: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/google-G-logo.png',
  sigCheckmark: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/green-checkmark.png',
  sigFox: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/fox-news-logo.png',
  sigCnbc: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/cnbc-logo.png',
  sigForbes: 'https://ohpjilsntlmlusgbpest.supabase.co/storage/v1/object/public/email-images/forbes-logo.png',
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
  includeTrustBadges?: boolean
  includeAsSeenOn?: boolean
}

// Default signature for Devin Fox
export const DEVIN_FOX_SIGNATURE: SignatureConfig = {
  name: 'Devin Fox',
  title: 'Director of Technologies',
  phone: '818.209.2305',
  email: 'devinfox@citadelgold.com',
  includeTrustBadges: true,
  includeAsSeenOn: true,
}

/**
 * Generate a professional email signature HTML
 */
export function generateSignatureHtml(config: SignatureConfig): string {
  const { name, title, phone, email, includeTrustBadges = true, includeAsSeenOn = true } = config
  const formattedPhone = formatPhoneDisplay(phone)

  let html = `
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
                <span style="margin-right: 8px;">📞</span>${formattedPhone}
              </td>
            </tr>` : ''}
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="margin-right: 8px;">✉️</span><a href="mailto:${email}" style="color: #333; text-decoration: none;">${email}</a>
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                <span style="margin-right: 8px;">🌐</span><a href="https://www.citadelgold.com" style="color: #333; text-decoration: none;">www.citadelgold.com</a>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align: top; padding-left: 20px;">
          <!-- Right Column - Logo -->
          <img src="${EMAIL_IMAGES.sigLogo}" alt="Citadel Gold" style="height: 80px; width: auto;">
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <div style="border-top: 2px solid #c9a227; margin: 25px 0 20px 0; max-width: 500px;"></div>`

  if (includeTrustBadges || includeAsSeenOn) {
    html += `
    <!-- Trust Badges Section -->
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
      <tr>`

    if (includeTrustBadges) {
      html += `
        <td style="vertical-align: top; padding-right: 60px;">
          <!-- Trusted by Investors -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #000; padding-bottom: 15px;">
                Trusted by Investors Nationwide:
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 10px;">
                      <img src="${EMAIL_IMAGES.sigBbb}" alt="BBB A Rating" style="height: 36px; width: auto;">
                    </td>
                    <td style="vertical-align: middle; font-family: Arial, sans-serif; font-size: 13px; color: #333;">
                      <strong>A</strong> Grade with BBB
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 10px;">
                      <img src="${EMAIL_IMAGES.sigGoogle}" alt="Google Reviews" style="height: 28px; width: auto;">
                    </td>
                    <td style="vertical-align: middle; font-family: Arial, sans-serif; font-size: 13px; color: #333;">
                      5-Star Google Reviews
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 10px;">
                      <img src="${EMAIL_IMAGES.sigCheckmark}" alt="NCBA Member" style="height: 28px; width: auto;">
                    </td>
                    <td style="vertical-align: middle; font-family: Arial, sans-serif; font-size: 13px; color: #333;">
                      Members - National Coin<br>& Bullion Association
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>`
    }

    if (includeAsSeenOn) {
      html += `
        <td style="vertical-align: top;">
          <!-- As Seen On -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #000; padding-bottom: 15px;">
                As Seen On
              </td>
            </tr>
            <tr>
              <td>
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right: 15px;">
                      <img src="${EMAIL_IMAGES.sigFox}" alt="Fox News" style="height: 30px; width: auto;">
                    </td>
                    <td style="padding-right: 15px;">
                      <img src="${EMAIL_IMAGES.sigCnbc}" alt="CNBC" style="height: 30px; width: auto;">
                    </td>
                    <td>
                      <img src="${EMAIL_IMAGES.sigForbes}" alt="Forbes" style="height: 30px; width: auto;">
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>`
    }

    html += `
      </tr>
    </table>`
  }

  return html
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
www.citadelgold.com
`.trim()
}

/**
 * Resolve a rep's job title from their email address.
 * Everyone defaults to "Precious Metals Specialist" except specific named users.
 */
export function resolveRepTitle(email: string): string {
  const normalized = (email || '').trim().toLowerCase()
  if (normalized === 'devinfox@citadelgold.com') {
    return 'Director of Technologies'
  }
  return 'Precious Metals Specialist'
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
                <span style="margin-right: 8px;">📞</span>${formattedPhone}
              </td>
            </tr>` : ''}
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding-bottom: 6px;">
                <span style="margin-right: 8px;">✉️</span><a href="mailto:${email}" style="color: #333; text-decoration: none;">${email}</a>
              </td>
            </tr>
            <tr>
              <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                <span style="margin-right: 8px;">🌐</span><a href="https://www.citadelgold.com" style="color: #333; text-decoration: none;">www.citadelgold.com</a>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align: top; padding-left: 20px;">
          <!-- Right Column - Logo -->
          <img src="${EMAIL_IMAGES.sigLogo}" alt="Citadel Gold" style="height: 80px; width: auto;">
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
        <span>📞 ${formattedPhone}</span>
        <span style="margin: 0 8px;">|</span>
        <a href="mailto:${email}" style="color: #333; text-decoration: none;">✉️ ${email}</a>
      </div>
    </div>
  `
}
