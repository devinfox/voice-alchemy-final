const TELNYX_API_URL = 'https://api.telnyx.com/v2/messages'
const DEFAULT_SIGNUP_FROM_NUMBER = '+14156045517'

export interface SendSmsParams {
  to: string
  body: string
}

export interface SendSmsResult {
  id: string
  status: string
  to: string
}

function getTelnyxApiKey(): string | undefined {
  return process.env.OTHER_TELNYX_API_KEY
}

function getTelnyxFromNumber(): string {
  return process.env.OTHER_TELNYX_FROM_NUMBER || process.env.TELNYX_SIGNUP_FROM_NUMBER || DEFAULT_SIGNUP_FROM_NUMBER
}

function getTelnyxMessagingProfileId(): string | undefined {
  return process.env.OTHER_TELNYX_MESSAGING_PROFILE_ID
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  if (digits.length === 10) {
    return `+1${digits}`
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  if (digits.length > 10) {
    return `+${digits}`
  }

  return ''
}

export function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(normalizePhone(phone))
}

export function isTelnyxConfigured(): boolean {
  return Boolean(getTelnyxApiKey() && getTelnyxFromNumber())
}

export async function sendSms({ to, body }: SendSmsParams): Promise<SendSmsResult> {
  const apiKey = getTelnyxApiKey()
  const fromNumber = getTelnyxFromNumber()

  if (!apiKey) {
    throw new Error('OTHER_TELNYX_API_KEY not configured')
  }

  if (!fromNumber) {
    throw new Error('OTHER_TELNYX_FROM_NUMBER or TELNYX_SIGNUP_FROM_NUMBER not configured')
  }

  const normalizedTo = normalizePhone(to)

  if (!isValidPhone(normalizedTo)) {
    throw new Error('Invalid phone number')
  }

  const payload: Record<string, string> = {
    from: fromNumber,
    to: normalizedTo,
    text: body,
  }

  const messagingProfileId = getTelnyxMessagingProfileId()
  if (messagingProfileId) {
    payload.messaging_profile_id = messagingProfileId
  }

  const response = await fetch(TELNYX_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const detail = error?.errors?.[0]?.detail || response.statusText
    console.error('[Telnyx] SMS send failed:', detail)
    throw new Error(`Telnyx SMS failed: ${detail}`)
  }

  const result = await response.json()

  return {
    id: result.data?.id || 'unknown',
    status: result.data?.to?.[0]?.status || 'queued',
    to: normalizedTo,
  }
}
