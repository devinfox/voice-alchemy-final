/** Microsoft Graph is not enabled in VAAA (SendGrid-only). */

export async function sendEmail(..._args: unknown[]): Promise<void> {
  throw new Error('Microsoft email is not available in Voice Alchemy Academy')
}

export async function sendEmailWithLargeAttachments(..._args: unknown[]): Promise<void> {
  throw new Error('Microsoft email is not available in Voice Alchemy Academy')
}

export async function getAttachment(..._args: unknown[]): Promise<null> {
  return null
}

export async function listAttachments(..._args: unknown[]): Promise<unknown[]> {
  return []
}

export async function getEmail(..._args: unknown[]): Promise<null> {
  return null
}

export async function getEmailWithAttachments(..._args: unknown[]): Promise<null> {
  return null
}
