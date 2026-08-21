'use client'

import { useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { EmailSidebar } from './email-sidebar'
import { EmailPreviewPane } from './email-preview-pane'
import { EmailCompose } from './email-compose'
import { EmailUIProvider, useEmailUI } from '@/lib/contexts/email-ui-context'
import { useEmailShortcuts } from '@/lib/hooks/use-email-shortcuts'
import { EmailAccount, Email } from '@/types/email.types'
import { ArrowLeft } from 'lucide-react'
import { formatEmailDateFull, getQuotableMessageBody } from '@/lib/email-utils'
import { createClient } from '@/lib/supabase'

interface EmailSplitPaneLayoutProps {
  userId: string
  accounts: EmailAccount[]
  children: ReactNode
}

function EmailLayoutContent({ userId, accounts, children }: EmailSplitPaneLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const {
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
    navigateToNextThread,
    navigateToPrevThread,
  } = useEmailUI()

  const [replyData, setReplyData] = useState<any>(null)
  const [forwardData, setForwardData] = useState<any>(null)

  // Keyboard shortcut actions - use optimistic updates to avoid flicker
  const handleArchive = useCallback(async () => {
    if (!selectedThreadId) return
    // Move to next thread immediately (optimistic)
    navigateToNextThread()
    setSelectedThreadId(null)

    // Update database in background
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'archive', updated_at: new Date().toISOString() })
      .eq('id', selectedThreadId)
  }, [selectedThreadId, setSelectedThreadId, navigateToNextThread])

  const handleDelete = useCallback(async () => {
    if (!selectedThreadId) return
    if (!confirm('Move this conversation to trash?')) return

    // Move to next thread immediately (optimistic)
    navigateToNextThread()
    setSelectedThreadId(null)

    // Update database in background
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'trash', updated_at: new Date().toISOString() })
      .eq('id', selectedThreadId)
  }, [selectedThreadId, setSelectedThreadId, navigateToNextThread])

  const handleToggleStar = useCallback(async () => {
    if (!selectedThreadId) return
    const supabase = createClient()
    const { data: thread } = await supabase
      .from('email_threads')
      .select('is_starred')
      .eq('id', selectedThreadId)
      .maybeSingle()
    if (thread) {
      const newStarredState = !thread.is_starred
      // Dispatch event to update sidebar counts immediately
      window.dispatchEvent(new CustomEvent('email-starred-changed', {
        detail: { threadId: selectedThreadId, isStarred: newStarredState }
      }))
      // Update database
      await supabase
        .from('email_threads')
        .update({ is_starred: newStarredState })
        .eq('id', selectedThreadId)
    }
  }, [selectedThreadId])

  const handleOpenThread = useCallback(() => {
    // Already showing thread in same pane, no action needed
  }, [])

  const handleComposeNew = useCallback(() => {
    setComposeMode('new')
    setIsComposing(true)
    setSelectedThreadId(null)
  }, [setComposeMode, setIsComposing, setSelectedThreadId])

  const handleBack = () => {
    setSelectedThreadId(null)
    setIsComposing(false)
    setComposeMode(null)
  }

  // Keyboard shortcuts
  useEmailShortcuts({
    enabled: !isComposing,
    onNextThread: navigateToNextThread,
    onPrevThread: navigateToPrevThread,
    onOpenThread: handleOpenThread,
    onArchive: handleArchive,
    onDelete: handleDelete,
    onToggleStar: handleToggleStar,
    onCompose: handleComposeNew,
    onGoToInbox: () => router.push('/dashboard/email'),
    onGoToSent: () => router.push('/dashboard/email/sent'),
    onGoToDrafts: () => router.push('/dashboard/email/drafts'),
    onGoToStarred: () => router.push('/dashboard/email?starred=true'),
    onFocusSearch: () => {
      const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
      searchInput?.focus()
    },
  })

  // Check if we're in a thread detail view (direct URL navigation)
  const isThreadDetailView = pathname?.match(/\/dashboard\/email\/[a-f0-9-]+$/) !== null

  // Determine the current folder name for the back button
  const getCurrentFolderName = () => {
    if (pathname?.includes('/sent')) return 'Sent'
    if (pathname?.includes('/drafts')) return 'Drafts'
    if (pathname?.includes('/trash')) return 'Trash'
    if (pathname?.includes('/archive')) return 'Archive'
    if (pathname?.includes('/spam')) return 'Spam'
    if (pathname?.includes('/starred') || pathname?.includes('starred=true')) return 'Starred'
    if (pathname?.includes('/snoozed')) return 'Snoozed'
    return 'Inbox'
  }

  // Track previous pathname to detect actual navigation
  const prevPathnameRef = useRef(pathname)

  // Clear selection when navigating to a different folder
  // This ensures sidebar navigation (Inbox, Sent, Starred, etc.) always works
  useEffect(() => {
    // Only trigger on actual navigation (pathname change)
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname

      // Only clear if we're navigating to a folder view (not a thread detail view)
      if (!isThreadDetailView) {
        // Use setTimeout to defer state updates and avoid React render conflicts
        setTimeout(() => {
          setSelectedThreadId(null)
          setIsComposing(false)
          setComposeMode(null)
        }, 0)
      }
    }
  }, [pathname, isThreadDetailView, setSelectedThreadId, setIsComposing, setComposeMode])

  // Determine what to show in the main content area
  const showEmailBody = selectedThreadId && !isComposing
  const showCompose = isComposing
  const showEmailList = !showEmailBody && !showCompose && !isThreadDetailView

  // Fetch email data for reply/forward
  const fetchEmailData = async (emailId: string, threadId: string) => {
    try {
      const response = await fetch(`/api/email/threads/${threadId}`)
      if (response.ok) {
        const data = await response.json()
        const email = data.emails?.find((e: Email) => e.id === emailId)
        return { email, thread: data.thread }
      }
    } catch (error) {
      console.error('Error fetching email data:', error)
    }
    return null
  }

  const handleReply = async (emailId: string, threadId: string) => {
    const data = await fetchEmailData(emailId, threadId)
    if (data) {
      const { email, thread } = data
      setReplyData({
        email_id: email.id,
        thread_id: thread.id,
        to: !email.is_inbound
          ? (email.to_addresses?.[0]?.email || email.to_addresses?.[0] || '')
          : email.from_address,
        subject: `Re: ${thread.subject || ''}`,
        body: `<br><br><div style="border-left: 2px solid #444; padding-left: 10px; margin-left: 0; color: #888;">On ${formatEmailDateFull(email.sent_at || email.created_at)}, ${email.from_name || email.from_address} wrote:<br><br>${getQuotableMessageBody(email.body_html, email.body_text)}</div>`,
      })
      setReplyThreadId(threadId)
      setComposeMode('reply')
      setIsComposing(true)
    }
  }

  const handleReplyAll = async (emailId: string, threadId: string) => {
    const data = await fetchEmailData(emailId, threadId)
    if (!data) return
    const { email, thread } = data

    // Exclude every address we own so we never reply to ourselves.
    const ownAddresses = new Set(
      accounts.map((a) => (a.email_address || '').trim().toLowerCase())
    )
    const seen = new Set(ownAddresses)
    const emailOf = (r: any) =>
      (typeof r === 'string' ? (r.match(/<([^>]+)>/)?.[1] || r) : r?.email || '')
        .trim()
        .toLowerCase()
    const fmt = (r: any) =>
      typeof r === 'string' ? r : r?.name ? `${r.name} <${r.email}>` : r?.email || ''

    const to: string[] = []
    const cc: string[] = []
    const addTo = (r: any) => {
      const a = emailOf(r)
      if (!a || seen.has(a)) return
      seen.add(a)
      to.push(fmt(r))
    }
    const addCc = (r: any) => {
      const a = emailOf(r)
      if (!a || seen.has(a)) return
      seen.add(a)
      cc.push(fmt(r))
    }

    if (email.is_inbound) {
      // Reply to the sender; everyone else on the message moves to Cc.
      addTo(email.from_address)
      ;(email.to_addresses || []).forEach(addCc)
    } else {
      ;(email.to_addresses || []).forEach(addTo)
    }
    ;(email.cc_addresses || []).forEach(addCc)

    setReplyData({
      email_id: email.id,
      thread_id: thread.id,
      to: to.length ? to : [email.from_address],
      cc,
      subject: `Re: ${thread.subject || ''}`,
      body: `<br><br><div style="border-left: 2px solid #444; padding-left: 10px; margin-left: 0; color: #888;">On ${formatEmailDateFull(email.sent_at || email.created_at)}, ${email.from_name || email.from_address} wrote:<br><br>${getQuotableMessageBody(email.body_html, email.body_text)}</div>`,
    })
    setReplyThreadId(threadId)
    setComposeMode('reply')
    setIsComposing(true)
  }

  const handleForward = async (emailId: string) => {
    if (selectedThreadId) {
      const data = await fetchEmailData(emailId, selectedThreadId)
      if (data) {
        const { email, thread } = data
        setForwardData({
          email_id: email.id,
          subject: `Fwd: ${thread.subject || ''}`,
          body: `<br><br>---------- Forwarded message ---------<br>From: ${email.from_name || email.from_address}<br>Date: ${formatEmailDateFull(email.sent_at || email.created_at)}<br>Subject: ${thread.subject || ''}<br>To: ${email.to_addresses?.map((r: any) => typeof r === 'string' ? r : r.email).join(', ')}<br><br>${getQuotableMessageBody(email.body_html, email.body_text)}`,
          attachments: email.attachments || [],
        })
        setComposeMode('forward')
        setIsComposing(true)
      }
    }
  }

  const closeCompose = () => {
    setIsComposing(false)
    setComposeMode(null)
    setReplyData(null)
    setForwardData(null)
    setReplyToEmailId(null)
    setReplyThreadId(null)
  }

  const validAccounts = accounts.filter(
    (a: any) => a.provider === 'microsoft' || a.provider === 'gmail' || a.domain?.verification_status === 'verified'
  )

  return (
    <div className="flex h-full overflow-hidden w-full gap-5 p-5">
      {/* Email notification toast is mounted globally in the dashboard layout */}

      {/* Email Folder Sidebar - Premium glass panel */}
      <div
        className="flex-shrink-0 rounded-2xl overflow-hidden w-60"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        <EmailSidebar
          userId={userId}
          onCompose={handleComposeNew}
        />
      </div>

      {/* Main Content Area - Premium floating document */}
      <div
        className="flex-1 min-w-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        }}
      >
        {/* Back button header when viewing an email - Premium styling. Compact (~44px).
            NOT shown while composing: the composer renders its own "Back to Inbox" link
            inside its header row (via onBack), so a separate bar here would just stack a
            redundant second row above "New Message". */}
        {showEmailBody && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.06] flex-shrink-0 backdrop-blur-xl">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] text-gray-400 hover:text-white transition-colors duration-150"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to {getCurrentFolderName()}</span>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {showEmailList && children}

          {showEmailBody && (
            <EmailPreviewPane
              threadId={selectedThreadId}
              accounts={accounts}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
            />
          )}

          {showCompose && (
            <EmailCompose
              accounts={validAccounts}
              defaultAccountId={replyThreadId ? accounts.find(a => a.is_primary)?.id : undefined}
              replyTo={composeMode === 'reply' ? replyData : undefined}
              forward={composeMode === 'forward' ? forwardData : undefined}
              onClose={closeCompose}
              onBack={closeCompose}
              isInline
            />
          )}

          {isThreadDetailView && children}
        </div>
      </div>
    </div>
  )
}

export function EmailSplitPaneLayout({ userId, accounts, children }: EmailSplitPaneLayoutProps) {
  return (
    <EmailUIProvider>
      <EmailLayoutContent userId={userId} accounts={accounts}>
        {children}
      </EmailLayoutContent>
    </EmailUIProvider>
  )
}
