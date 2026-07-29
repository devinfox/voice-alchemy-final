'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Type,
  Image,
  Square,
  Minus,
  MoveVertical,
  Columns,
  Share2,
  Play,
  PanelTop,
  PanelBottom,
} from 'lucide-react'
import { BlockType } from '@/lib/email-builder-context'
import { BLOCK_METADATA } from './utils/default-blocks'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Type,
  Image,
  Square,
  Minus,
  MoveVertical,
  Columns,
  Share2,
  Play,
  PanelTop,
  PanelBottom,
}

interface DraggableBlockProps {
  type: BlockType
  label: string
  icon: string
  description: string
}

function DraggableBlock({ type, label, icon, description }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `sidebar-${type}`,
    data: { type, isNew: true },
  })

  const Icon = ICONS[icon] || Type

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center gap-3 p-3 glass-card-subtle rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/10 transition-all group"
    >
      <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 group-hover:bg-yellow-500/20 transition-colors">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>
    </div>
  )
}

export function BlockSidebar() {
  return (
    <div className="w-56 flex-shrink-0 glass-card p-4 overflow-y-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Blocks
      </h3>
      <div className="space-y-2">
        {BLOCK_METADATA.map((block) => (
          <DraggableBlock
            key={block.type}
            type={block.type}
            label={block.label}
            icon={block.icon}
            description={block.description}
          />
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-white/10">
        <p className="text-xs text-gray-500">
          Drag blocks to the canvas to build your email template.
        </p>
      </div>
    </div>
  )
}
