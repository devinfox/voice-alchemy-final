import { BlockType, EmailBlock, generateBlockId } from '@/lib/email-builder-context'

// Dark-mode friendly default colors
// Using slightly off-white and off-black for better dark mode compatibility
const defaultColors = {
  text: '#2D2D2D',           // Slightly off-black - better for dark mode inversion
  textLight: '#F5F5F5',      // Slightly off-white
  textMuted: '#8A8A8A',      // Works in both modes
  divider: '#E0E0E0',        // Visible in both light/dark
  accent: '#D4AF37',         // Gold accent
}

// Default properties for each block type
export const DEFAULT_BLOCK_PROPERTIES: Record<BlockType, Record<string, any>> = {
  text: {
    content: '<p>Enter your text here...</p>',
    align: 'left',
    padding: 16,
    fontSize: 16,
    color: defaultColors.text,
  },
  image: {
    src: '',
    alt: 'Image',
    width: 100, // percentage
    align: 'center',
    link: '',
    padding: 16,
  },
  button: {
    text: 'Click Here',
    url: '#',
    bgColor: '#D4AF37', // Gold
    textColor: '#000000',
    align: 'center',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    fullWidth: false,
  },
  divider: {
    color: defaultColors.divider,
    thickness: 1,
    width: 100, // percentage
    style: 'solid',
    padding: 16,
  },
  spacer: {
    height: 32,
  },
  columns: {
    columnCount: 2,
    columnWidths: [50, 50],
    gap: 16,
    padding: 16,
    showDivider: false,
    dividerColor: defaultColors.divider,
    dividerThickness: 1,
    columnContent: [
      { type: 'text', content: '<p>Column 1 text</p>', align: 'left', fontSize: 16, color: defaultColors.text, src: '', alt: '', width: 100 },
      { type: 'text', content: '<p>Column 2 text</p>', align: 'left', fontSize: 16, color: defaultColors.text, src: '', alt: '', width: 100 },
    ],
  },
  social: {
    platforms: [
      { name: 'facebook', url: '#', enabled: true },
      { name: 'twitter', url: '#', enabled: true },
      { name: 'instagram', url: '#', enabled: true },
      { name: 'linkedin', url: '#', enabled: false },
    ],
    iconSize: 32,
    iconStyle: 'colored', // 'colored' | 'dark' | 'light'
    align: 'center',
    padding: 16,
  },
  video: {
    thumbnailUrl: '',
    videoUrl: '',
    playIconColor: '#FFFFFF',
    overlayColor: 'rgba(0,0,0,0.3)',
    width: 100,
    align: 'center',
    padding: 16,
  },
  header: {
    logoUrl: '',
    companyName: 'Company Name',
    bgColor: '#1A1A1A',
    textColor: '#D4AF37',
    padding: 24,
    align: 'center',
  },
  footer: {
    text: '© 2024 Company Name. All rights reserved.',
    showSocial: true,
    socialLinks: [
      { name: 'facebook', url: '#' },
      { name: 'twitter', url: '#' },
    ],
    unsubscribeUrl: '#',
    bgColor: '#1E1E1E',  // Slightly lighter than pure black
    textColor: defaultColors.textMuted,
    padding: 24,
  },
}

// Block metadata for the sidebar
export interface BlockMetadata {
  type: BlockType
  label: string
  icon: string // Lucide icon name
  description: string
}

export const BLOCK_METADATA: BlockMetadata[] = [
  { type: 'text', label: 'Text', icon: 'Type', description: 'Rich text content' },
  { type: 'image', label: 'Image', icon: 'Image', description: 'Upload or link an image' },
  { type: 'button', label: 'Button', icon: 'Square', description: 'Call-to-action button' },
  { type: 'divider', label: 'Divider', icon: 'Minus', description: 'Horizontal line separator' },
  { type: 'spacer', label: 'Spacer', icon: 'MoveVertical', description: 'Vertical spacing' },
  { type: 'columns', label: 'Columns', icon: 'Columns', description: '2-3 column layout' },
  { type: 'social', label: 'Social', icon: 'Share2', description: 'Social media links' },
  { type: 'video', label: 'Video', icon: 'Play', description: 'Video thumbnail with play icon' },
  { type: 'header', label: 'Header', icon: 'PanelTop', description: 'Email header section' },
  { type: 'footer', label: 'Footer', icon: 'PanelBottom', description: 'Email footer section' },
]

// Create a new block with default properties
export function createBlock(type: BlockType): EmailBlock {
  return {
    id: generateBlockId(),
    type,
    properties: { ...DEFAULT_BLOCK_PROPERTIES[type] },
  }
}

// Clone a block with a new ID
export function cloneBlock(block: EmailBlock): EmailBlock {
  return {
    ...block,
    id: generateBlockId(),
    properties: { ...block.properties },
    children: block.children?.map(cloneBlock),
  }
}
