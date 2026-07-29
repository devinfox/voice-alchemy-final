/** Stub SMS sender — VAAA email notifications use email only unless Telnyx is wired later. */

export async function sendSms(_params: {
  to: string
  body: string
}): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'SMS not configured for Voice Alchemy Academy' }
}
