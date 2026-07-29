'use client'

import { useState, useEffect, useRef, useCallback, useMemo, memo, CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { List } from 'react-window'
import {
  Star,
  Paperclip,
  Trash2,
  Archive,
  ArchiveRestore,
  MailOpen,
  Mail,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { EmailThread } from '@/types/email.types'
import { formatEmailDate, stripHtml } from '@/lib/email-utils'
import { useEmailUI } from '@/lib/contexts/email-ui-context'

// Row height for virtual list
const ROW_HEIGHT = 72

interface EmailListProps {
  threads: (EmailThread & {
    emails?: {
      id: string
      from_address: string
      from_name: string | null
      snippet: string | null
      sent_at: string | null
      created_at: string
      is_read: boolean
      is_inbound?: boolean
    }[]
    // Set on rows that stand in for an unsent composer draft (`user_email_drafts`)
    // rather than a real thread. These open the composer, not the thread reader —
    // a draft you can't edit and send is just an unreachable row.
    is_composer_draft?: boolean
    compose_draft_id?: string
  })[]
  selectedAccountId?: string
  emptyMessage?: string
  currentPage?: number
  totalCount?: number
  pageSize?: number
  folder?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'
  useSplitPane?: boolean
}

// Helper to get display sender for inbox threads
// For inbox: show the external sender (first inbound email), not the user's own replies
function getDisplaySender(emails: EmailListProps['threads'][0]['emails'], folder?: string) {
  if (!emails || emails.length === 0) return { name: 'Unknown', email: '' }

  // For inbox, find the first inbound email's sender
  if (folder === 'inbox') {
    const inboundEmail = emails.find(e => e.is_inbound === true)
    if (inboundEmail) {
      return {
        name: inboundEmail.from_name || inboundEmail.from_address || 'Unknown',
        email: inboundEmail.from_address || ''
      }
    }
  }

  // Fallback to latest email's sender
  const latestEmail = emails[0]
  return {
    name: latestEmail?.from_name || latestEmail?.from_address || 'Unknown',
    email: latestEmail?.from_address || ''
  }
}

// Types for virtualized list
interface VirtualRowData {
  threads: EmailListProps['threads']
  selectedIds: Set<string>
  selectedThreadId: string | null
  loading: string | null
  folder?: string
  useSplitPane: boolean
  optimisticStars: Map<string, boolean>
  optimisticReads: Map<string, boolean>
  toggleSelect: (id: string, e: React.MouseEvent) => void
  toggleStar: (threadId: string, isStarred: boolean, e: React.MouseEvent) => void
  handleThreadClick: (threadId: string, e: React.MouseEvent) => void
}

// Row component props from react-window v2
interface VirtualRowProps extends VirtualRowData {
  ariaAttributes?: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
  index: number
  style: CSSProperties
}

// Virtual row component for performance - memoized to prevent unnecessary re-renders
const VirtualEmailRow = memo(function VirtualEmailRow({
  index,
  style,
  threads,
  selectedIds,
  selectedThreadId,
  loading,
  folder,
  useSplitPane,
  optimisticStars,
  optimisticReads,
  toggleSelect,
  toggleStar,
  handleThreadClick,
}: VirtualRowProps) {

  const thread = threads[index]
  if (!thread) return null

  // Memoize derived data
  const latestEmail = thread.emails?.[0]
  const displaySender = useMemo(
    () => getDisplaySender(thread.emails, folder),
    [thread.emails, folder]
  )
  const isSelected = selectedIds.has(thread.id)
  const isPreviewSelected = selectedThreadId === thread.id
  // Use optimistic star state if available, otherwise use thread's actual state
  const isStarred = optimisticStars.has(thread.id) ? optimisticStars.get(thread.id)! : thread.is_starred
  // Use optimistic read state if available, otherwise use thread's actual state
  const isRead = optimisticReads.has(thread.id) ? optimisticReads.get(thread.id)! : thread.is_read

  return (
    <div
      style={style}
      onClick={(e) => handleThreadClick(thread.id, e)}
      className={`group flex items-center gap-4 px-5 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors duration-150 w-full max-w-full min-w-0 cursor-pointer ${
        !isRead ? 'bg-white/[0.02]' : ''
      } ${isSelected ? 'bg-yellow-500/[0.08] border-l-2 border-l-yellow-500/60' : ''} ${isPreviewSelected ? 'bg-white/[0.06] border-l-2 border-l-yellow-400' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => toggleSelect(thread.id, e)}
        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
      >
        {isSelected ? (
          <CheckSquare className="w-4.5 h-4.5 text-yellow-400" />
        ) : (
          <Square className="w-4.5 h-4.5" />
        )}
      </button>

      {/* Star */}
      <button
        onClick={(e) => toggleStar(thread.id, isStarred, e)}
        className={`p-1.5 rounded-lg transition-all duration-200 ${
          isStarred
            ? 'text-yellow-400 bg-yellow-500/10'
            : 'text-gray-600 hover:text-yellow-400 hover:bg-white/[0.05]'
        }`}
      >
        <Star className={`w-4.5 h-4.5 ${isStarred ? 'fill-yellow-400' : ''}`} />
      </button>

      {/* Sender - Premium typography */}
      <div className="w-52 flex-shrink-0">
        <p className={`text-sm truncate tracking-tight ${!isRead ? 'text-white font-semibold' : 'text-gray-400'}`}>
          {displaySender.name}
        </p>
      </div>

      {/* Subject & Snippet - Better hierarchy */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className={`text-sm truncate tracking-tight ${!isRead ? 'text-white font-medium' : 'text-gray-300'}`}>
            {thread.subject || '(no subject)'}
          </span>
          {thread.message_count > 1 && (
            <span className="flex-shrink-0 text-[10px] text-gray-500 bg-white/[0.06] px-2 py-0.5 rounded-md font-medium tabular-nums">
              {thread.message_count}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500/80 truncate mt-0.5 leading-relaxed">
          {latestEmail?.snippet ? stripHtml(latestEmail.snippet) : ''}
        </p>
      </div>

      {/* Attachment indicator */}
      {thread.has_attachments && (
        <Paperclip className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
      )}

      {/* Date - Refined typography */}
      <div className="w-28 text-right flex-shrink-0">
        <span className={`text-xs tabular-nums font-medium ${!isRead ? 'text-gray-300' : 'text-gray-600'}`}>
          {formatEmailDate(thread.last_message_at)}
        </span>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memoization - only re-render if this row's data changed
  const prevThread = prevProps.threads[prevProps.index]
  const nextThread = nextProps.threads[nextProps.index]

  if (!prevThread || !nextThread) return prevThread === nextThread

  // Check optimistic star state for this thread
  const prevOptimisticStar = prevProps.optimisticStars.get(prevThread.id)
  const nextOptimisticStar = nextProps.optimisticStars.get(nextThread.id)
  // Check optimistic read state for this thread
  const prevOptimisticRead = prevProps.optimisticReads.get(prevThread.id)
  const nextOptimisticRead = nextProps.optimisticReads.get(nextThread.id)

  return (
    prevThread.id === nextThread.id &&
    prevThread.is_read === nextThread.is_read &&
    prevThread.is_starred === nextThread.is_starred &&
    prevOptimisticStar === nextOptimisticStar &&
    prevOptimisticRead === nextOptimisticRead &&
    prevThread.subject === nextThread.subject &&
    prevThread.message_count === nextThread.message_count &&
    prevThread.has_attachments === nextThread.has_attachments &&
    prevThread.last_message_at === nextThread.last_message_at &&
    prevProps.selectedIds.has(prevThread.id) === nextProps.selectedIds.has(nextThread.id) &&
    prevProps.selectedThreadId === nextProps.selectedThreadId &&
    prevProps.style.top === nextProps.style.top
  )
})

export function EmailList({
  threads,
  selectedAccountId,
  emptyMessage = 'No emails',
  currentPage = 1,
  totalCount = 0,
  pageSize = 20,
  folder,
  useSplitPane = true,
}: EmailListProps) {
  const isTrash = folder === 'trash'
  const isArchive = folder === 'archive'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Try to use email UI context for split-pane preview
  let emailUI: ReturnType<typeof useEmailUI> | null = null
  try {
    emailUI = useEmailUI()
  } catch {
    // Context not available, fall back to direct navigation
  }

  const { selectedThreadId, setSelectedThreadId, setThreadIds } = emailUI || {
    selectedThreadId: null,
    setSelectedThreadId: () => {},
    setThreadIds: () => {},
  }

  // Update thread IDs in context when threads change
  useEffect(() => {
    if (useSplitPane && setThreadIds) {
      const ids = threads.map(t => t.id)
      setThreadIds(ids)
    }
    // Only depend on threads length and useSplitPane to avoid unnecessary updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length, useSplitPane])

  const totalPages = Math.ceil(totalCount / pageSize)
  const hasPrevPage = currentPage > 1
  const hasNextPage = currentPage < totalPages

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page === 1) {
      params.delete('page')
    } else {
      params.set('page', String(page))
    }
    router.push(`?${params.toString()}`)
  }
  const [loading, setLoading] = useState<string | null>(null)

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedIds(prev => {
      const newSelected = new Set(prev)
      if (newSelected.has(id)) {
        newSelected.delete(id)
      } else {
        newSelected.add(id)
      }
      return newSelected
    })
  }, [])

  const selectAll = () => {
    if (selectedIds.size === threads.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(threads.map(t => t.id)))
    }
  }

  // Local optimistic state for stars (to avoid full page refresh flicker)
  const [optimisticStars, setOptimisticStars] = useState<Map<string, boolean>>(new Map())

  // Local optimistic state for read status (to show read immediately after viewing)
  const [optimisticReads, setOptimisticReads] = useState<Map<string, boolean>>(new Map())

  // Listen for email-read-changed events to update read status optimistically
  useEffect(() => {
    const handleReadChange = (e: CustomEvent<{ threadId: string; isRead: boolean }>) => {
      setOptimisticReads(prev => new Map(prev).set(e.detail.threadId, e.detail.isRead))
    }

    window.addEventListener('email-read-changed', handleReadChange as EventListener)
    return () => {
      window.removeEventListener('email-read-changed', handleReadChange as EventListener)
    }
  }, [])

  // Keep a ref of the currently-visible thread ids so the realtime handler can
  // tell which updates are relevant without re-subscribing on every list change.
  const threadIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    threadIdsRef.current = new Set(threads.map(t => t.id))
  }, [threads])

  // On mount (and whenever the server hands us a new thread set), reconcile each
  // row's read state against the database. This covers the case where the user
  // opened a thread on another route/device and navigated back: Next.js serves
  // the inbox from its (stale) client cache, so the prop still says unread even
  // though the DB now says read. A single keyed lookup corrects it without a
  // manual refresh.
  useEffect(() => {
    if (threads.length === 0) return
    const ids = threads.map(t => t.id)
    const propReadById = new Map(threads.map(t => [t.id, t.is_read]))
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('email_threads')
      .select('id, is_read')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return
        setOptimisticReads(prev => {
          let changed = false
          const next = new Map(prev)
          for (const row of data) {
            if (!propReadById.has(row.id)) continue
            const current = next.has(row.id) ? next.get(row.id) : propReadById.get(row.id)
            if (current !== row.is_read) {
              next.set(row.id, row.is_read)
              changed = true
            }
          }
          return changed ? next : prev
        })
      })
    return () => {
      cancelled = true
    }
  }, [threads])

  // Real-time read/unread sync: subscribe to email_threads UPDATEs so that
  // marking a thread read/unread anywhere (this tab's preview pane, another tab,
  // another device) updates the list live without a refresh.
  useEffect(() => {
    const supabase = createClient()
    // Unique channel name per subscription instance. A static name causes
    // Supabase to hand back an already-subscribed channel on remount/StrictMode,
    // and calling .on() after subscribe() throws.
    const channel = supabase
      .channel(`email-threads-read-${selectedAccountId || 'all'}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'email_threads',
          ...(selectedAccountId ? { filter: `email_account_id=eq.${selectedAccountId}` } : {}),
        },
        (payload) => {
          const row = payload.new as { id?: string; is_read?: boolean }
          if (!row?.id || typeof row.is_read !== 'boolean') return
          if (!threadIdsRef.current.has(row.id)) return
          setOptimisticReads(prev => {
            if (prev.get(row.id!) === row.is_read) return prev
            return new Map(prev).set(row.id!, row.is_read!)
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedAccountId])

  const toggleStar = useCallback(async (threadId: string, isStarred: boolean, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Composer-draft rows have no email_threads row behind them, so starring one
    // would optimistically light up and then never persist. Ignore the click.
    if (threadId.startsWith('composer-draft:')) return

    const newStarredState = !isStarred

    // Optimistic update - update local state immediately
    setOptimisticStars(prev => new Map(prev).set(threadId, newStarredState))

    // Dispatch event to update sidebar counts immediately
    window.dispatchEvent(new CustomEvent('email-starred-changed', {
      detail: { threadId, isStarred: newStarredState }
    }))

    // Update database in background. The optimistic state above already updated
    // the UI synchronously, so awaiting here does not block rendering.
    const supabase = createClient()
    try {
      await supabase
        .from('email_threads')
        .update({ is_starred: newStarredState })
        .eq('id', threadId)
    } finally {
      // Clear optimistic override once the server state is authoritative
      // (on success it matches; on failure we drop back to the server value)
      setOptimisticStars(prev => {
        const next = new Map(prev)
        next.delete(threadId)
        return next
      })
    }
  }, [])

  const markAsRead = useCallback(async (threadIds: string[]) => {
    // Clear selection immediately (optimistic)
    setSelectedIds(new Set())

    // Update sidebar counts immediately
    threadIds.forEach(id => {
      window.dispatchEvent(new CustomEvent('email-read-changed', {
        detail: { threadId: id, isRead: true }
      }))
    })

    // Update database in background
    const supabase = createClient()
    Promise.all([
      supabase
        .from('email_threads')
        .update({ is_read: true })
        .in('id', threadIds),
      supabase
        .from('emails')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('thread_id', threadIds)
    ])
  }, [])

  const markAsUnread = useCallback(async (threadIds: string[]) => {
    // Clear selection immediately (optimistic)
    setSelectedIds(new Set())

    // Update sidebar counts and row styling immediately
    threadIds.forEach(id => {
      window.dispatchEvent(new CustomEvent('email-read-changed', {
        detail: { threadId: id, isRead: false }
      }))
    })

    // Update database in background
    const supabase = createClient()
    Promise.all([
      supabase
        .from('email_threads')
        .update({ is_read: false })
        .in('id', threadIds),
      supabase
        .from('emails')
        .update({ is_read: false, read_at: null })
        .in('thread_id', threadIds)
        .eq('is_inbound', true)
    ])
  }, [])

  const moveToTrash = useCallback(async (threadIds: string[]) => {
    // Clear selection immediately (optimistic)
    setSelectedIds(new Set())

    // Update database in background, then refresh to remove from list
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'trash', updated_at: new Date().toISOString() })
      .in('id', threadIds)

    // Only refresh after trash to actually remove items from list
    router.refresh()
  }, [router])

  const unarchiveThreads = useCallback(async (threadIds: string[]) => {
    // Clear selection immediately (optimistic)
    setSelectedIds(new Set())

    // Move back to inbox, then refresh to remove from the archive list
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'inbox', updated_at: new Date().toISOString() })
      .in('id', threadIds)

    router.refresh()
  }, [router])

  const archiveThreads = useCallback(async (threadIds: string[]) => {
    // Clear selection immediately (optimistic)
    setSelectedIds(new Set())

    // Update database in background, then refresh to remove from list
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'archive', updated_at: new Date().toISOString() })
      .in('id', threadIds)

    // Only refresh after archive to actually remove items from list
    router.refresh()
  }, [router])

  const permanentlyDelete = useCallback(async (threadIds: string[]) => {
    if (!confirm(`Permanently delete ${threadIds.length} conversation${threadIds.length > 1 ? 's' : ''}? This cannot be undone.`)) {
      return
    }

    setLoading('deleting')
    try {
      // Delete threads in parallel
      await Promise.all(
        threadIds.map(async (threadId) => {
          const response = await fetch(`/api/email/threads/${threadId}`, {
            method: 'DELETE',
          })
          if (!response.ok) {
            throw new Error(`Failed to delete thread ${threadId}`)
          }
        })
      )
      router.refresh()
      setSelectedIds(new Set())
    } catch (error) {
      console.error('Error permanently deleting threads:', error)
      alert('Failed to delete some threads. Please try again.')
    } finally {
      setLoading(null)
    }
  }, [router])

  if (threads.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
            <Mail className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-gray-500 font-medium">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden max-w-full">
      {/* Toolbar - Desktop only - Premium floating bar */}
      <div className="hidden md:flex px-5 py-3 border-b border-white/[0.06] items-center gap-2.5 flex-shrink-0 max-w-full backdrop-blur-sm">
        <button
          onClick={selectAll}
          className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200"
        >
          {selectedIds.size === threads.length ? (
            <CheckSquare className="w-4.5 h-4.5 text-yellow-400" />
          ) : (
            <Square className="w-4.5 h-4.5" />
          )}
        </button>

        {selectedIds.size > 0 && (
          <>
            <div className="h-6 w-px bg-white/[0.08] mx-1" />
            <button
              onClick={() => markAsRead(Array.from(selectedIds))}
              className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200"
              title="Mark as read"
            >
              <MailOpen className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => markAsUnread(Array.from(selectedIds))}
              className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200"
              title="Mark as unread"
            >
              <Mail className="w-4.5 h-4.5" />
            </button>
            {isArchive ? (
              <button
                onClick={() => unarchiveThreads(Array.from(selectedIds))}
                className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200"
                title="Unarchive"
              >
                <ArchiveRestore className="w-4.5 h-4.5" />
              </button>
            ) : (
              <button
                onClick={() => archiveThreads(Array.from(selectedIds))}
                className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200"
                title="Archive"
              >
                <Archive className="w-4.5 h-4.5" />
              </button>
            )}
            {isTrash ? (
              <button
                onClick={() => permanentlyDelete(Array.from(selectedIds))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 text-red-400 transition-all duration-200"
                title="Permanently Delete"
                disabled={loading === 'deleting'}
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm font-medium">Delete Forever</span>
              </button>
            ) : (
              <button
                onClick={() => moveToTrash(Array.from(selectedIds))}
                className="p-2 rounded-xl bg-white/[0.03] hover:bg-red-500/10 border border-white/[0.04] hover:border-red-500/20 text-gray-500 hover:text-red-400 transition-all duration-200"
                title="Delete"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            )}
            <span className="text-xs text-gray-500 ml-3 font-medium tabular-nums">
              {selectedIds.size} selected
            </span>
          </>
        )}
      </div>

      {/* Thread List - Desktop (Virtualized) */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden max-w-full">
        <List<VirtualRowData>
          className="flex-1"
          rowCount={threads.length}
          rowHeight={ROW_HEIGHT}
          rowComponent={VirtualEmailRow as any}
          rowProps={{
            threads,
            selectedIds,
            selectedThreadId,
            loading,
            folder,
            useSplitPane,
            optimisticStars,
            optimisticReads,
            toggleSelect,
            toggleStar,
            handleThreadClick: (threadId: string, e: React.MouseEvent) => {
              // Ignore if clicking on buttons
              if ((e.target as HTMLElement).closest('button')) return

              // Composer drafts are unsent, so the thread reader (reply/forward,
              // no Send) is the wrong destination — reopen them in the composer.
              const clicked = threads.find(t => t.id === threadId)
              if (clicked?.is_composer_draft) {
                router.push(`/dashboard/email/compose?resumeDraftId=${clicked.compose_draft_id}`)
                return
              }

              if (useSplitPane && setSelectedThreadId) {
                // Single click: preview in pane
                setSelectedThreadId(threadId)
              } else {
                // No split pane - direct navigation
                router.push(`/dashboard/email/${threadId}`)
              }
            },
          }}
          overscanCount={5}
        />
      </div>

      {/* Thread List - Mobile - Premium styling */}
      <div className="md:hidden flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const latestEmail = thread.emails?.[0]
          const displaySender = getDisplaySender(thread.emails, folder)
          const senderName = displaySender.name.includes('@') ? displaySender.name.split('@')[0] : displaySender.name
          const senderEmail = displaySender.email
          // Honor optimistic/realtime read overrides so a thread opened then
          // navigated back from shows as read without a manual refresh.
          const isRead = optimisticReads.has(thread.id) ? optimisticReads.get(thread.id)! : thread.is_read

          return (
            <Link
              key={thread.id}
              href={thread.is_composer_draft
                ? `/dashboard/email/compose?resumeDraftId=${thread.compose_draft_id}`
                : `/dashboard/email/${thread.id}`}
              className={`flex items-start gap-4 px-5 py-4 border-b border-white/[0.04] active:bg-white/[0.04] transition-colors ${
                !isRead ? 'bg-white/[0.02]' : ''
              }`}
            >
              {/* Avatar - Premium styling */}
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                !isRead
                  ? 'bg-gradient-to-br from-yellow-500/15 to-yellow-600/5 border border-yellow-500/20'
                  : 'bg-white/[0.04] border border-white/[0.06]'
              }`}>
                <span className={`text-sm font-semibold ${!isRead ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {(senderName || 'U')[0].toUpperCase()}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm truncate tracking-tight ${!isRead ? 'text-white font-semibold' : 'text-gray-400'}`}>
                      {senderName}
                    </p>
                    <p className="text-xs text-gray-600 truncate">{senderEmail}</p>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className={`text-xs tabular-nums font-medium ${!isRead ? 'text-gray-400' : 'text-gray-600'}`}>
                      {formatEmailDate(thread.last_message_at)}
                    </span>
                    {!isRead && (
                      <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-sm shadow-yellow-500/50" />
                    )}
                  </div>
                </div>

                {/* Preview */}
                <p className="text-sm text-gray-500/80 mt-1.5 line-clamp-2 leading-relaxed">
                  {thread.subject || (latestEmail?.snippet ? stripHtml(latestEmail.snippet) : '') || '(no subject)'}
                </p>
              </div>
            </Link>
          )
        })}

        {/* Swipe hint - Subtle */}
        <div className="py-6 text-center">
          <p className="text-xs text-gray-600 font-medium">Swipe left for options →</p>
        </div>
      </div>

      {/* Pagination - Desktop only - Premium styling */}
      {totalPages > 1 && (
        <div className="hidden md:flex px-5 py-4 border-t border-white/[0.06] items-center justify-between flex-shrink-0 max-w-full backdrop-blur-sm">
          <div className="text-xs text-gray-500 font-medium tabular-nums">
            Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={!hasPrevPage}
              className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/[0.03] disabled:hover:border-white/[0.04]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 font-medium tabular-nums min-w-[80px] text-center">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={!hasNextPage}
              className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/[0.03] disabled:hover:border-white/[0.04]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
