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

export interface BlockSocialPlatform {
  name: string
  url?: string
  enabled?: boolean
}

export interface BlockSocialLink {
  name: string
  url?: string
}

export interface BlockColumnContent {
  type: 'text' | 'image'
  content: string
  align: string
  fontSize: number
  color: string
  src: string
  alt: string
  width: number
}

/**
 * Every property a block of any type may carry. All optional: a block only
 * holds the ones for its own type, and saved templates may omit some.
 */
export type BlockProperties = {
  // shared
  align?: string
  padding?: number
  width?: number
  color?: string
  bgColor?: string
  textColor?: string
  fontSize?: number
  text?: string
  // text
  content?: string
  // image
  src?: string
  alt?: string
  link?: string
  // button
  url?: string
  borderRadius?: number
  fullWidth?: boolean
  // divider
  thickness?: number
  style?: string
  // spacer
  height?: number
  // columns
  columnCount?: number
  columnWidths?: number[]
  gap?: number
  showDivider?: boolean
  dividerColor?: string
  dividerThickness?: number
  columnContent?: BlockColumnContent[]
  // social
  platforms?: BlockSocialPlatform[]
  iconSize?: number
  iconStyle?: string
  // video
  thumbnailUrl?: string
  videoUrl?: string
  playIconColor?: string
  overlayColor?: string
  // header
  logoUrl?: string
  companyName?: string
  // footer
  showSocial?: boolean
  socialLinks?: BlockSocialLink[]
  unsubscribeUrl?: string
}

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
