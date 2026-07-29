'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EmailThread, Email, EmailAttachment } from '@/types/email.types'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const emailKeys = {
  all: ['emails'] as const,
  threads: (folder?: string, accountId?: string) =>
    [...emailKeys.all, 'threads', { folder, accountId }] as const,
  thread: (threadId: string) =>
    [...emailKeys.all, 'thread', threadId] as const,
  email: (emailId: string) =>
    [...emailKeys.all, 'email', emailId] as const,
  counts: (accountId?: string) =>
    [...emailKeys.all, 'counts', accountId] as const,
}

// ============================================================================
// TYPES
// ============================================================================

interface ThreadResponse {
  thread: EmailThread & {
    email_account?: {
      id: string
      email_address: string
      display_name: string | null
    } | null
  }
  emails: (Email & { attachments: EmailAttachment[] })[]
  wasUnread?: boolean
}

interface ThreadsResponse {
  threads: EmailThread[]
  totalCount: number
  page: number
  pageSize: number
}

// ============================================================================
// FETCHERS
// ============================================================================

async function fetchThread(threadId: string): Promise<ThreadResponse> {
  const response = await fetch(`/api/email/threads/${threadId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch thread')
  }
  return response.json()
}

async function fetchThreads(params: {
  folder?: string
  accountId?: string
  page?: number
  pageSize?: number
}): Promise<ThreadsResponse> {
  const searchParams = new URLSearchParams()
  if (params.folder) searchParams.set('folder', params.folder)
  if (params.accountId) searchParams.set('accountId', params.accountId)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const response = await fetch(`/api/email/threads?${searchParams}`)
  if (!response.ok) {
    throw new Error('Failed to fetch threads')
  }
  return response.json()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch a single email thread with all its emails
 */
export function useEmailThread(threadId: string | null) {
  return useQuery({
    queryKey: threadId ? emailKeys.thread(threadId) : ['disabled'],
    queryFn: () => fetchThread(threadId!),
    enabled: !!threadId,
    // NOTE: Do not trigger side effects (e.g. dispatching events that update
    // other components) here. React Query's `select` runs during render, so
    // updating the sidebar from here caused a "setState while rendering"
    // warning. The unread-count event is dispatched from a useEffect in the
    // consuming component instead.
  })
}

/**
 * Hook to fetch email threads for a folder
 */
export function useEmailThreads(params: {
  folder?: string
  accountId?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}) {
  const { folder, accountId, page = 1, pageSize = 20, enabled = true } = params

  return useQuery({
    queryKey: emailKeys.threads(folder, accountId),
    queryFn: () => fetchThreads({ folder, accountId, page, pageSize }),
    enabled,
  })
}

/**
 * Hook to invalidate email caches (for use after mutations)
 */
export function useInvalidateEmailCache() {
  const queryClient = useQueryClient()

  return {
    invalidateThread: (threadId: string) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadId) })
    },
    invalidateAllThreads: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
    },
    invalidateFolder: (folder: string, accountId?: string) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.threads(folder, accountId) })
    },
  }
}

// ============================================================================
// MUTATIONS
// ============================================================================

interface StarThreadParams {
  threadId: string
  isStarred: boolean
}

/**
 * Hook to toggle star on a thread
 */
export function useToggleStarMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ threadId, isStarred }: StarThreadParams) => {
      const response = await fetch(`/api/email/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_starred: !isStarred }),
      })
      if (!response.ok) {
        throw new Error('Failed to update thread')
      }
      return { threadId, newStarred: !isStarred }
    },
    // Optimistic update
    onMutate: async ({ threadId, isStarred }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: emailKeys.thread(threadId) })

      // Snapshot current value
      const previousThread = queryClient.getQueryData<ThreadResponse>(emailKeys.thread(threadId))

      // Optimistically update
      if (previousThread) {
        queryClient.setQueryData<ThreadResponse>(emailKeys.thread(threadId), {
          ...previousThread,
          thread: { ...previousThread.thread, is_starred: !isStarred },
        })
      }

      return { previousThread }
    },
    onError: (_err, { threadId }, context) => {
      // Rollback on error
      if (context?.previousThread) {
        queryClient.setQueryData(emailKeys.thread(threadId), context.previousThread)
      }
    },
    onSuccess: ({ threadId, newStarred }) => {
      // Dispatch event for sidebar update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('email-starred-changed', {
          detail: { threadId, isStarred: newStarred }
        }))
      }
    },
    onSettled: () => {
      // Refetch threads to ensure consistency
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
    },
  })
}

interface MoveThreadParams {
  threadId: string
  folder: 'inbox' | 'archive' | 'trash' | 'spam'
}

/**
 * Hook to move a thread to a folder
 */
export function useMoveThreadMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ threadId, folder }: MoveThreadParams) => {
      const response = await fetch(`/api/email/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      if (!response.ok) {
        throw new Error('Failed to move thread')
      }
      return { threadId, folder }
    },
    onSuccess: () => {
      // Invalidate all thread lists as the thread moved between folders
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
    },
  })
}

/**
 * Hook to delete a thread permanently
 */
export function useDeleteThreadMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (threadId: string) => {
      const response = await fetch(`/api/email/threads/${threadId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to delete thread')
      }
      return threadId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
    },
  })
}
