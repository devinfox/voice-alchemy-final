'use client'

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

interface EmailUIContextType {
  // Selected thread for preview
  selectedThreadId: string | null
  setSelectedThreadId: (id: string | null) => void

  // Compose state
  isComposing: boolean
  setIsComposing: (value: boolean) => void
  composeMode: 'new' | 'reply' | 'forward' | null
  setComposeMode: (mode: 'new' | 'reply' | 'forward' | null) => void

  // Reply/forward context
  replyToEmailId: string | null
  setReplyToEmailId: (id: string | null) => void
  replyThreadId: string | null
  setReplyThreadId: (id: string | null) => void

  // Document panel
  showDocumentPanel: boolean
  setShowDocumentPanel: (value: boolean) => void

  // Navigation
  threadIds: string[]
  setThreadIds: (ids: string[]) => void
  navigateToNextThread: () => void
  navigateToPrevThread: () => void

  // Auto-advance after actions
  autoAdvanceEnabled: boolean
  setAutoAdvanceEnabled: (value: boolean) => void
}

const EmailUIContext = createContext<EmailUIContextType | undefined>(undefined)

interface EmailUIProviderProps {
  children: ReactNode
}

export function EmailUIProvider({ children }: EmailUIProviderProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [composeMode, setComposeMode] = useState<'new' | 'reply' | 'forward' | null>(null)
  const [replyToEmailId, setReplyToEmailId] = useState<string | null>(null)
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null)
  const [showDocumentPanel, setShowDocumentPanel] = useState(false)
  const [threadIds, setThreadIds] = useState<string[]>([])
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true)

  const navigateToNextThread = useCallback(() => {
    if (!selectedThreadId || threadIds.length === 0) return
    const currentIndex = threadIds.indexOf(selectedThreadId)
    if (currentIndex === -1 || currentIndex >= threadIds.length - 1) return
    setSelectedThreadId(threadIds[currentIndex + 1])
  }, [selectedThreadId, threadIds])

  const navigateToPrevThread = useCallback(() => {
    if (!selectedThreadId || threadIds.length === 0) return
    const currentIndex = threadIds.indexOf(selectedThreadId)
    if (currentIndex <= 0) return
    setSelectedThreadId(threadIds[currentIndex - 1])
  }, [selectedThreadId, threadIds])

  const value = useMemo(() => ({
    selectedThreadId,
    setSelectedThreadId,
    isComposing,
    setIsComposing,
    composeMode,
    setComposeMode,
    replyToEmailId,
    setReplyToEmailId,
    replyThreadId,
    setReplyThreadId,
    showDocumentPanel,
    setShowDocumentPanel,
    threadIds,
    setThreadIds,
    navigateToNextThread,
    navigateToPrevThread,
    autoAdvanceEnabled,
    setAutoAdvanceEnabled,
  }), [
    selectedThreadId,
    isComposing,
    composeMode,
    replyToEmailId,
    replyThreadId,
    showDocumentPanel,
    threadIds,
    navigateToNextThread,
    navigateToPrevThread,
    autoAdvanceEnabled,
  ])

  return (
    <EmailUIContext.Provider value={value}>
      {children}
    </EmailUIContext.Provider>
  )
}

export function useEmailUI() {
  const context = useContext(EmailUIContext)
  if (context === undefined) {
    throw new Error('useEmailUI must be used within an EmailUIProvider')
  }
  return context
}
