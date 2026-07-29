/** Microsoft OAuth is not enabled in VAAA (SendGrid-only). */

export async function getValidAccessToken(..._args: unknown[]): Promise<string | null> {
  return null
}

export async function refreshMicrosoftToken(..._args: unknown[]): Promise<{
  access_token: string
  refresh_token?: string
  expires_at?: string
} | null> {
  return null
}

export function isTokenExpired(_expiresAt?: string | null): boolean {
  return true
}

export function calculateExpiresAt(_expiresIn?: number): string {
  return new Date(Date.now() + 3600 * 1000).toISOString()
}
