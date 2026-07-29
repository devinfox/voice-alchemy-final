/**
 * ByeTalk document attachments — stubbed for VAAA (no document suite).
 * Preserves CRM type shapes so draft/AI/compose imports compile.
 */

export type ByeTalkFileKind = 'document' | 'sheet' | 'presentation' | 'project_file'
export type SheetExportFormat = 'xlsx' | 'csv'

export interface ByeTalkAttachmentRef {
  kind: ByeTalkFileKind
  id: string
  format?: SheetExportFormat
  name?: string
  // Optional aliases used by some UI paths
  file_name?: string
  mime_type?: string
  public_url?: string
  storage_path?: string
}

export interface ByeTalkListItem {
  kind: ByeTalkFileKind
  id: string
  name: string
  updated_at: string
}

export async function listByeTalkFilesForEmail(..._args: unknown[]): Promise<ByeTalkListItem[]> {
  return []
}

export async function buildByeTalkExport(..._args: unknown[]): Promise<{
  filename: string
  contentType: string
  base64: string
  data: Buffer
  size: number
} | null> {
  return null
}

export async function resolveByeTalkAttachment(..._args: unknown[]): Promise<ByeTalkAttachmentRef | null> {
  return null
}

export async function exportByeTalkFileAsAttachment(..._args: unknown[]): Promise<{
  filename: string
  content: string
  contentType: string
} | null> {
  return null
}
