'use client'

import { useEffect, useCallback, useRef } from 'react'

interface EmailShortcutsOptions {
  // Navigation
  onNextThread?: () => void
  onPrevThread?: () => void
  onOpenThread?: () => void

  // Actions
  onArchive?: () => void
  onDelete?: () => void
  onToggleStar?: () => void
  onReply?: () => void
  onReplyAll?: () => void
  onForward?: () => void
  onCompose?: () => void
  onMarkAsRead?: () => void
  onMarkAsUnread?: () => void

  // Navigation to folders
  onGoToInbox?: () => void
  onGoToSent?: () => void
  onGoToDrafts?: () => void
  onGoToStarred?: () => void

  // Search
  onFocusSearch?: () => void

  // Enable/disable
  enabled?: boolean
}

export function useEmailShortcuts(options: EmailShortcutsOptions) {
  const {
    onNextThread,
    onPrevThread,
    onOpenThread,
    onArchive,
    onDelete,
    onToggleStar,
    onReply,
    onReplyAll,
    onForward,
    onCompose,
    onMarkAsRead,
    onMarkAsUnread,
    onGoToInbox,
    onGoToSent,
    onGoToDrafts,
    onGoToStarred,
    onFocusSearch,
    enabled = true,
  } = options

  // Track 'g' prefix for go-to shortcuts (g then i = inbox, g then s = sent)
  const gPrefixRef = useRef(false)
  const gTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const resetGPrefix = useCallback(() => {
    gPrefixRef.current = false
    if (gTimeoutRef.current) {
      clearTimeout(gTimeoutRef.current)
      gTimeoutRef.current = null
    }
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return

    // Ignore shortcuts when typing in input/textarea/contenteditable
    const target = e.target as HTMLElement
    const tagName = target.tagName.toLowerCase()
    const isEditable = target.isContentEditable ||
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select'

    // Allow shortcuts in some cases even when focused
    const allowInEditable = e.key === 'Escape'

    if (isEditable && !allowInEditable) return

    // Prevent shortcuts when modifiers are held (except shift for some)
    if (e.ctrlKey || e.metaKey || e.altKey) return

    const key = e.key.toLowerCase()

    // Handle 'g' prefix for go-to shortcuts
    if (gPrefixRef.current) {
      resetGPrefix()

      switch (key) {
        case 'i': // g then i = inbox
          e.preventDefault()
          onGoToInbox?.()
          return
        case 's': // g then s = sent
          e.preventDefault()
          onGoToSent?.()
          return
        case 'd': // g then d = drafts
          e.preventDefault()
          onGoToDrafts?.()
          return
        case 't': // g then t = starred
          e.preventDefault()
          onGoToStarred?.()
          return
      }
      return
    }

    // Start 'g' prefix sequence
    if (key === 'g' && !e.shiftKey) {
      gPrefixRef.current = true
      // Reset after 1 second if no follow-up key
      gTimeoutRef.current = setTimeout(resetGPrefix, 1000)
      return
    }

    switch (key) {
      // Navigation
      case 'j': // Next thread
        e.preventDefault()
        onNextThread?.()
        break
      case 'k': // Previous thread
        e.preventDefault()
        onPrevThread?.()
        break
      case 'o': // Open thread
      case 'enter':
        if (tagName !== 'button' && tagName !== 'a') {
          e.preventDefault()
          onOpenThread?.()
        }
        break

      // Actions
      case 'e': // Archive
        e.preventDefault()
        onArchive?.()
        break
      case '#': // Delete (requires shift+3)
        e.preventDefault()
        onDelete?.()
        break
      case 's': // Star/unstar
        e.preventDefault()
        onToggleStar?.()
        break
      case 'r': // Reply
        if (!e.shiftKey) {
          e.preventDefault()
          onReply?.()
        }
        break
      case 'a': // Reply all
        if (!e.shiftKey) {
          e.preventDefault()
          onReplyAll?.()
        }
        break
      case 'f': // Forward
        e.preventDefault()
        onForward?.()
        break
      case 'c': // Compose
        e.preventDefault()
        onCompose?.()
        break

      // Read/unread
      case 'i': // Mark read (shift+i for unread)
        if (e.shiftKey) {
          e.preventDefault()
          onMarkAsUnread?.()
        } else {
          // 'i' alone doesn't do anything unless following 'g'
        }
        break
      case 'u': // Mark unread
        e.preventDefault()
        onMarkAsUnread?.()
        break

      // Search
      case '/': // Focus search
        e.preventDefault()
        onFocusSearch?.()
        break

      // Escape - handled but not preventing default to allow modal closing etc
      case 'escape':
        resetGPrefix()
        break
    }
  }, [
    enabled,
    onNextThread,
    onPrevThread,
    onOpenThread,
    onArchive,
    onDelete,
    onToggleStar,
    onReply,
    onReplyAll,
    onForward,
    onCompose,
    onMarkAsRead,
    onMarkAsUnread,
    onGoToInbox,
    onGoToSent,
    onGoToDrafts,
    onGoToStarred,
    onFocusSearch,
    resetGPrefix,
  ])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      resetGPrefix()
    }
  }, [enabled, handleKeyDown, resetGPrefix])
}

// Shortcut help text for displaying to users
export const EMAIL_SHORTCUTS = {
  navigation: [
    { key: 'j', description: 'Next thread' },
    { key: 'k', description: 'Previous thread' },
    { key: 'o / Enter', description: 'Open thread' },
    { key: 'g then i', description: 'Go to Inbox' },
    { key: 'g then s', description: 'Go to Sent' },
    { key: 'g then d', description: 'Go to Drafts' },
    { key: 'g then t', description: 'Go to Starred' },
  ],
  actions: [
    { key: 'e', description: 'Archive' },
    { key: '#', description: 'Delete' },
    { key: 's', description: 'Star/unstar' },
    { key: 'r', description: 'Reply' },
    { key: 'a', description: 'Reply all' },
    { key: 'f', description: 'Forward' },
    { key: 'c', description: 'Compose new' },
    { key: 'u', description: 'Mark as unread' },
  ],
  search: [
    { key: '/', description: 'Focus search' },
  ],
}
