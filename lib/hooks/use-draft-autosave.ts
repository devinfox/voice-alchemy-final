'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface DraftData {
  id?: string
  email_account_id?: string
  thread_id?: string | null
  reply_to_email_id?: string | null
  to_emails?: string[]
  cc_emails?: string[]
  bcc_emails?: string[]
  subject?: string
  body_html?: string
  attachments?: any[]
  compose_mode?: 'new' | 'reply' | 'forward'
}

interface UseDraftAutosaveOptions {
  debounceMs?: number
  enabled?: boolean
  onSaved?: (draft: DraftData) => void
  onError?: (error: Error) => void
}

interface UseDraftAutosaveReturn {
  draftId: string | null
  isSaving: boolean
  lastSavedAt: Date | null
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveDraft: (data: DraftData) => Promise<void>
  deleteDraft: () => Promise<void>
}

export function useDraftAutosave(
  initialDraftId?: string,
  options: UseDraftAutosaveOptions = {}
): UseDraftAutosaveReturn {
  const {
    debounceMs = 5000,
    enabled = true,
    onSaved,
    onError,
  } = options

  const [draftId, setDraftId] = useState<string | null>(initialDraftId || null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingDataRef = useRef<DraftData | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const performSave = useCallback(async (data: DraftData) => {
    if (!enabled) return

    setIsSaving(true)
    setSaveStatus('saving')

    try {
      const response = await fetch('/api/email/user-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          id: draftId,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save draft')
      }

      const savedDraft = await response.json()
      setDraftId(savedDraft.id)
      setLastSavedAt(new Date())
      setSaveStatus('saved')
      onSaved?.(savedDraft)

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle')
      }, 2000)
    } catch (error) {
      console.error('Error saving draft:', error)
      setSaveStatus('error')
      onError?.(error instanceof Error ? error : new Error('Unknown error'))
    } finally {
      setIsSaving(false)
    }
  }, [draftId, enabled, onSaved, onError])

  const saveDraft = useCallback(async (data: DraftData) => {
    // Store the pending data
    pendingDataRef.current = data

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        performSave(pendingDataRef.current)
        pendingDataRef.current = null
      }
    }, debounceMs)
  }, [debounceMs, performSave])

  const deleteDraft = useCallback(async () => {
    if (!draftId) return

    // Clear any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    pendingDataRef.current = null

    try {
      const response = await fetch(`/api/email/user-draft?id=${draftId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete draft')
      }

      setDraftId(null)
      setLastSavedAt(null)
      setSaveStatus('idle')
    } catch (error) {
      console.error('Error deleting draft:', error)
    }
  }, [draftId])

  return {
    draftId,
    isSaving,
    lastSavedAt,
    saveStatus,
    saveDraft,
    deleteDraft,
  }
}
