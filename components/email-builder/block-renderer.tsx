'use client'

import { EmailBlock } from '@/lib/email-builder-context'
import { TextBlock } from './blocks/text-block'
import { ImageBlock } from './blocks/image-block'
import { ButtonBlock } from './blocks/button-block'
import { DividerBlock } from './blocks/divider-block'
import { SpacerBlock } from './blocks/spacer-block'
import { ColumnsBlock } from './blocks/columns-block'
import { SocialBlock } from './blocks/social-block'
import { VideoBlock } from './blocks/video-block'
import { HeaderBlock } from './blocks/header-block'
import { FooterBlock } from './blocks/footer-block'

interface BlockRendererProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
  contentBackgroundColor?: string
}

export function BlockRenderer({ block, isSelected, onClick, contentBackgroundColor = '#ffffff' }: BlockRendererProps) {
  const commonProps = { block, isSelected, onClick, contentBackgroundColor }

  switch (block.type) {
    case 'text':
      return <TextBlock {...commonProps} />
    case 'image':
      return <ImageBlock {...commonProps} />
    case 'button':
      return <ButtonBlock {...commonProps} />
    case 'divider':
      return <DividerBlock {...commonProps} />
    case 'spacer':
      return <SpacerBlock {...commonProps} />
    case 'columns':
      return <ColumnsBlock {...commonProps} />
    case 'social':
      return <SocialBlock {...commonProps} />
    case 'video':
      return <VideoBlock {...commonProps} />
    case 'header':
      return <HeaderBlock {...commonProps} />
    case 'footer':
      return <FooterBlock {...commonProps} />
    default:
      return (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">Unknown block type: {block.type}</p>
        </div>
      )
  }
}
