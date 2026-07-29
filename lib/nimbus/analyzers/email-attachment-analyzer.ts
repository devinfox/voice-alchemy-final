/** Stub: CRM Nimbus attachment analyzer is not ported to VAAA. */

export async function analyzeEmailAttachment(..._args: unknown[]): Promise<null> {
  return null
}

export async function extractDocxText(..._args: unknown[]): Promise<string> {
  return ''
}

export async function extractPdfText(..._args: unknown[]): Promise<string> {
  return ''
}

export async function saveAttachmentToEntity(..._args: unknown[]): Promise<{
  success: boolean
  documentId?: string
}> {
  return { success: false }
}

export async function processEmailAttachments(..._args: unknown[]): Promise<{
  processed: number
  skipped: number
}> {
  return { processed: 0, skipped: 0 }
}
