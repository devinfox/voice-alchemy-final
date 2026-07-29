/** Gmail API is not enabled in VAAA (SendGrid-only). */

export async function getValidAccessToken(..._args: unknown[]): Promise<string | null> {
  return null
}

export async function sendMessage(..._args: unknown[]): Promise<{ id?: string; threadId?: string }> {
  throw new Error('Gmail is not available in Voice Alchemy Academy')
}

export function createRfc2822Message(..._args: unknown[]): string {
  throw new Error('Gmail is not available in Voice Alchemy Academy')
}

export function encodeToBase64Url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function getAttachment(..._args: unknown[]): Promise<null> {
  return null
}

export async function downloadAttachment(..._args: unknown[]): Promise<null> {
  return null
}

export async function getMessage(..._args: unknown[]): Promise<null> {
  return null
}

export async function getAttachmentsInfo(..._args: unknown[]): Promise<unknown[]> {
  return []
}
