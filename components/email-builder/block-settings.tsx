'use client'

import { useEmailBuilder, BlockType } from '@/lib/email-builder-context'
import { Trash2, Copy, X } from 'lucide-react'
import { TextBlockSettings } from './blocks/text-block'
import { ImageBlockSettings } from './blocks/image-block'
import { ButtonBlockSettings } from './blocks/button-block'
import { DividerBlockSettings } from './blocks/divider-block'
import { SpacerBlockSettings } from './blocks/spacer-block'
import { ColumnsBlockSettings } from './blocks/columns-block'
import { SocialBlockSettings } from './blocks/social-block'
import { VideoBlockSettings } from './blocks/video-block'
import { HeaderBlockSettings } from './blocks/header-block'
import { FooterBlockSettings } from './blocks/footer-block'
import { BLOCK_METADATA } from './utils/default-blocks'

export function BlockSettings() {
  const {
    selectedBlockId,
    getSelectedBlock,
    updateBlock,
    removeBlock,
    duplicateBlock,
    selectBlock,
  } = useEmailBuilder()

  const selectedBlock = getSelectedBlock()

  if (!selectedBlock) {
    return (
      <div className="w-64 flex-shrink-0 glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Settings
        </h3>
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">
            Select a block to edit its properties
          </p>
        </div>
      </div>
    )
  }

  const blockMeta = BLOCK_METADATA.find((b) => b.type === selectedBlock.type)

  const handleChange = (props: Record<string, any>) => {
    if (selectedBlockId) {
      updateBlock(selectedBlockId, props)
    }
  }

  const renderSettings = () => {
    const props = {
      properties: selectedBlock.properties,
      onChange: handleChange,
    }

    switch (selectedBlock.type) {
      case 'text':
        return <TextBlockSettings {...props} />
      case 'image':
        return <ImageBlockSettings {...props} />
      case 'button':
        return <ButtonBlockSettings {...props} />
      case 'divider':
        return <DividerBlockSettings {...props} />
      case 'spacer':
        return <SpacerBlockSettings {...props} />
      case 'columns':
        return <ColumnsBlockSettings {...props} />
      case 'social':
        return <SocialBlockSettings {...props} />
      case 'video':
        return <VideoBlockSettings {...props} />
      case 'header':
        return <HeaderBlockSettings {...props} />
      case 'footer':
        return <FooterBlockSettings {...props} />
      default:
        return <p className="text-sm text-gray-500">No settings available</p>
    }
  }

  return (
    <div className="w-64 flex-shrink-0 glass-card p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Settings
          </h3>
          <p className="text-sm text-white mt-1">{blockMeta?.label || 'Block'}</p>
        </div>
        <button
          onClick={() => selectBlock(null)}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Settings Form */}
      <div className="mb-6">{renderSettings()}</div>

      {/* Actions */}
      <div className="pt-4 border-t border-white/10 space-y-2">
        <button
          onClick={() => selectedBlockId && duplicateBlock(selectedBlockId)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 glass-button rounded-lg text-sm"
        >
          <Copy className="w-4 h-4" />
          Duplicate Block
        </button>
        <button
          onClick={() => selectedBlockId && removeBlock(selectedBlockId)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Block
        </button>
      </div>
    </div>
  )
}
