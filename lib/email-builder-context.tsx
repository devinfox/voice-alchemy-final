'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// Block types
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

// Block interface
export interface EmailBlock {
  id: string
  type: BlockType
  properties: Record<string, any>
  children?: EmailBlock[] // For columns
}

// Email settings
export interface EmailSettings {
  backgroundColor: string
  contentBackgroundColor: string
  previewMode: 'light' | 'dark'
}

export const defaultEmailSettings: EmailSettings = {
  backgroundColor: '#F5F5F5',  // Slightly off-white for better dark mode compatibility
  contentBackgroundColor: '#FAFAFA',  // Slightly off-white
  previewMode: 'light',
}

// Context state
interface EmailBuilderState {
  blocks: EmailBlock[]
  selectedBlockId: string | null
  isDragging: boolean
  emailSettings: EmailSettings
}

// Context actions
interface EmailBuilderActions {
  setBlocks: (blocks: EmailBlock[]) => void
  addBlock: (block: EmailBlock, index?: number) => void
  updateBlock: (id: string, properties: Record<string, any>) => void
  removeBlock: (id: string) => void
  moveBlock: (fromIndex: number, toIndex: number) => void
  duplicateBlock: (id: string) => void
  selectBlock: (id: string | null) => void
  setIsDragging: (isDragging: boolean) => void
  getSelectedBlock: () => EmailBlock | null
  clearBlocks: () => void
  updateEmailSettings: (settings: Partial<EmailSettings>) => void
}

type EmailBuilderContextType = EmailBuilderState & EmailBuilderActions

const EmailBuilderContext = createContext<EmailBuilderContextType | null>(null)

// Generate unique ID
export const generateBlockId = () => `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Provider component
export function EmailBuilderProvider({ children }: { children: ReactNode }) {
  const [blocks, setBlocksState] = useState<EmailBlock[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(defaultEmailSettings)

  const setBlocks = useCallback((newBlocks: EmailBlock[]) => {
    setBlocksState(newBlocks)
  }, [])

  const addBlock = useCallback((block: EmailBlock, index?: number) => {
    setBlocksState((prev) => {
      if (index !== undefined) {
        const newBlocks = [...prev]
        newBlocks.splice(index, 0, block)
        return newBlocks
      }
      return [...prev, block]
    })
    setSelectedBlockId(block.id)
  }, [])

  const updateBlock = useCallback((id: string, properties: Record<string, any>) => {
    setBlocksState((prev) =>
      prev.map((block) =>
        block.id === id
          ? { ...block, properties: { ...block.properties, ...properties } }
          : block
      )
    )
  }, [])

  const removeBlock = useCallback((id: string) => {
    setBlocksState((prev) => prev.filter((block) => block.id !== id))
    setSelectedBlockId((current) => (current === id ? null : current))
  }, [])

  const moveBlock = useCallback((fromIndex: number, toIndex: number) => {
    setBlocksState((prev) => {
      const newBlocks = [...prev]
      const [movedBlock] = newBlocks.splice(fromIndex, 1)
      newBlocks.splice(toIndex, 0, movedBlock)
      return newBlocks
    })
  }, [])

  const duplicateBlock = useCallback((id: string) => {
    setBlocksState((prev) => {
      const index = prev.findIndex((block) => block.id === id)
      if (index === -1) return prev

      const originalBlock = prev[index]
      const newBlock: EmailBlock = {
        ...originalBlock,
        id: generateBlockId(),
        properties: { ...originalBlock.properties },
      }

      const newBlocks = [...prev]
      newBlocks.splice(index + 1, 0, newBlock)
      return newBlocks
    })
  }, [])

  const selectBlock = useCallback((id: string | null) => {
    setSelectedBlockId(id)
  }, [])

  const getSelectedBlock = useCallback(() => {
    return blocks.find((block) => block.id === selectedBlockId) || null
  }, [blocks, selectedBlockId])

  const clearBlocks = useCallback(() => {
    setBlocksState([])
    setSelectedBlockId(null)
  }, [])

  const updateEmailSettings = useCallback((settings: Partial<EmailSettings>) => {
    setEmailSettings((prev) => ({ ...prev, ...settings }))
  }, [])

  const value: EmailBuilderContextType = {
    blocks,
    selectedBlockId,
    isDragging,
    emailSettings,
    setBlocks,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    duplicateBlock,
    selectBlock,
    setIsDragging,
    getSelectedBlock,
    clearBlocks,
    updateEmailSettings,
  }

  return (
    <EmailBuilderContext.Provider value={value}>
      {children}
    </EmailBuilderContext.Provider>
  )
}

// Hook to use the context
export function useEmailBuilder() {
  const context = useContext(EmailBuilderContext)
  if (!context) {
    throw new Error('useEmailBuilder must be used within an EmailBuilderProvider')
  }
  return context
}
