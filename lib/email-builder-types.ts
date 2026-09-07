/**
 * Email builder block types.
 *
 * Kept free of React so server code (starter-template installer, cron
 * renderer) can import block definitions and `blocksToHtml` without pulling
 * in the client-only builder context.
 */

export type BlockType =
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'columns'
  | 'social'
  | 'video'
  | 'header'
  | 'footer'

export interface EmailBlock {
  id: string
  type: BlockType
  // Block components read loosely-typed props per block type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>
  children?: EmailBlock[] // For columns
}

export interface EmailSettings {
  backgroundColor: string
  contentBackgroundColor: string
  previewMode: 'light' | 'dark'
}

export const defaultEmailSettings: EmailSettings = {
  backgroundColor: '#F5F5F5', // Slightly off-white for better dark mode compatibility
  contentBackgroundColor: '#FAFAFA', // Slightly off-white
  previewMode: 'light',
}

export const generateBlockId = () =>
  `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
