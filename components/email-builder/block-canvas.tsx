'use client'

import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEmailBuilder, EmailBlock } from '@/lib/email-builder-context'
import { BlockRenderer } from './block-renderer'
import { GripVertical, Mail } from 'lucide-react'

interface SortableBlockProps {
  block: EmailBlock
  isSelected: boolean
  onSelect: () => void
  contentBackgroundColor: string
}

function SortableBlock({ block, isSelected, onSelect, contentBackgroundColor }: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'z-50' : ''}`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <div className="p-1 bg-white/10 rounded">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      </div>

      {/* Block content */}
      <BlockRenderer
        block={block}
        isSelected={isSelected}
        onClick={onSelect}
        contentBackgroundColor={contentBackgroundColor}
      />
    </div>
  )
}

export function BlockCanvas() {
  const { blocks, selectedBlockId, selectBlock, emailSettings } = useEmailBuilder()

  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas',
  })

  return (
    <div
      className="flex-1 overflow-y-auto p-6 transition-colors"
      style={{ backgroundColor: emailSettings.backgroundColor }}
    >
      <div
        ref={setNodeRef}
        className={`max-w-[600px] mx-auto min-h-[500px] rounded-lg shadow-2xl transition-all ${
          isOver ? 'ring-2 ring-yellow-500 ring-offset-4 ring-offset-gray-900' : ''
        }`}
        style={{
          backgroundColor: emailSettings.contentBackgroundColor,
        }}
      >
        {blocks.length === 0 ? (
          <div
            className="h-[500px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg m-4 transition-colors"
            style={{
              borderColor: emailSettings.previewMode === 'dark' ? '#4a4a4a' : '#d1d5db',
              color: emailSettings.previewMode === 'dark' ? '#9ca3af' : '#6b7280',
            }}
          >
            <Mail className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">Start building your email</p>
            <p className="text-sm mt-2">Drag blocks from the left sidebar</p>
          </div>
        ) : (
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="p-4 space-y-2">
              {blocks.map((block) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  isSelected={selectedBlockId === block.id}
                  onSelect={() => selectBlock(block.id)}
                  contentBackgroundColor={emailSettings.contentBackgroundColor}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  )
}
