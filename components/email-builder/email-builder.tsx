'use client'

import { useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Sun, Moon } from 'lucide-react'
import {
  EmailBuilderProvider,
  useEmailBuilder,
  EmailBlock,
  BlockType,
  EmailSettings,
} from '@/lib/email-builder-context'
import { BlockSidebar } from './block-sidebar'
import { BlockCanvas } from './block-canvas'
import { BlockSettings } from './block-settings'
import { createBlock } from './utils/default-blocks'
import { parseBodyToBlocks, blocksToHtml } from './utils/blocks-to-html'

interface EmailBuilderProps {
  initialBlocks?: EmailBlock[]
  initialBody?: string
  onChange: (blocks: EmailBlock[], html: string, settings: EmailSettings) => void
}

function EmailBuilderInner({ initialBlocks, initialBody, onChange }: EmailBuilderProps) {
  const {
    blocks,
    setBlocks,
    addBlock,
    moveBlock,
    isDragging,
    setIsDragging,
    selectBlock,
    emailSettings,
    updateEmailSettings,
  } = useEmailBuilder()

  // Initialize blocks from props
  useEffect(() => {
    if (initialBlocks && initialBlocks.length > 0) {
      setBlocks(initialBlocks)
    } else if (initialBody) {
      const parsed = parseBodyToBlocks(initialBody)
      setBlocks(parsed)
    }
  }, [initialBlocks, initialBody, setBlocks]) // Re-run when initialBlocks changes

  // Notify parent of changes
  useEffect(() => {
    const html = blocksToHtml(blocks, emailSettings)
    onChange(blocks, html, emailSettings)
  }, [blocks, emailSettings, onChange])

  // Toggle dark/light mode
  const toggleMode = () => {
    const isDark = emailSettings.previewMode === 'dark'
    updateEmailSettings({
      previewMode: isDark ? 'light' : 'dark',
      backgroundColor: isDark ? '#f5f5f5' : '#1a1a1a',
      contentBackgroundColor: isDark ? '#ffffff' : '#2d2d2d',
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true)
    // Deselect when starting to drag
    selectBlock(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false)
    const { active, over } = event

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Check if dragging from sidebar (new block)
    if (activeId.startsWith('sidebar-')) {
      const blockType = active.data.current?.type as BlockType
      if (blockType) {
        const newBlock = createBlock(blockType)

        // Find index to insert
        if (overId === 'canvas') {
          addBlock(newBlock)
        } else {
          const overIndex = blocks.findIndex((b) => b.id === overId)
          if (overIndex !== -1) {
            addBlock(newBlock, overIndex)
          } else {
            addBlock(newBlock)
          }
        }
      }
      return
    }

    // Reordering existing blocks
    if (activeId !== overId) {
      const oldIndex = blocks.findIndex((b) => b.id === activeId)
      const newIndex = blocks.findIndex((b) => b.id === overId)

      if (oldIndex !== -1 && newIndex !== -1) {
        moveBlock(oldIndex, newIndex)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-[650px]">
        {/* Settings Bar */}
        <div className="flex items-center justify-between px-4 py-2 mb-2 glass-card rounded-lg">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Email Design</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Background Color */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Background:</span>
              <input
                type="color"
                value={emailSettings.backgroundColor}
                onChange={(e) => updateEmailSettings({ backgroundColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20"
                title="Email background color"
              />
            </div>
            {/* Content Background Color */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Content:</span>
              <input
                type="color"
                value={emailSettings.contentBackgroundColor}
                onChange={(e) => updateEmailSettings({ contentBackgroundColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20"
                title="Content area background color"
              />
            </div>
            {/* Dark/Light Mode Toggle */}
            <button
              onClick={toggleMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
                emailSettings.previewMode === 'dark'
                  ? 'bg-gray-700 text-yellow-400 border border-yellow-500/30'
                  : 'bg-white/10 text-gray-300 border border-white/10 hover:bg-white/20'
              }`}
            >
              {emailSettings.previewMode === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  Dark
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  Light
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Builder Area */}
        <div className="flex flex-1 gap-4 min-h-0">
          <BlockSidebar />
          <BlockCanvas />
          <BlockSettings />
        </div>
      </div>
    </DndContext>
  )
}

export function EmailBuilder(props: EmailBuilderProps) {
  return (
    <EmailBuilderProvider>
      <EmailBuilderInner {...props} />
    </EmailBuilderProvider>
  )
}
