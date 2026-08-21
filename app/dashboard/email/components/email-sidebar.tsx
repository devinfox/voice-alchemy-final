'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  AlertOctagon,
  Archive,
  Star,
  Plus,
  Settings,
  ChevronDown,
  ChevronRight,
  Mail,
  Sparkles,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { SavedViewsList } from './saved-views-list'
import { createClient } from '@/lib/supabase'
import { EmailAccount, EmailFolder } from '@/types/email.types'
import { useTenant } from '@/lib/tenant'

interface EmailSidebarProps {
  userId: string
  onCompose?: () => void
}

interface FolderItem {
  name: string
  folder: EmailFolder
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const folders: FolderItem[] = [
  { name: 'Inbox', folder: 'inbox', href: '/dashboard/email', icon: Inbox },
  { name: 'Starred', folder: 'inbox', href: '/dashboard/email?starred=true', icon: Star },
  { name: 'Sent', folder: 'sent', href: '/dashboard/email/sent', icon: Send },
  { name: 'Drafts', folder: 'drafts', href: '/dashboard/email/drafts', icon: FileEdit },
  { name: 'Spam', folder: 'spam', href: '/dashboard/email/spam', icon: AlertOctagon },
  { name: 'Trash', folder: 'trash', href: '/dashboard/email/trash', icon: Trash2 },
  { name: 'Archive', folder: 'archive', href: '/dashboard/email/archive', icon: Archive },
]

export function EmailSidebar({ userId, onCompose }: EmailSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null)
  const [folderCounts, setFolderCounts] = useState<Record<string, { total: number; unread: number }>>({})
  const [starredCount, setStarredCount] = useState(0)
  const [aiDraftsCount, setAiDraftsCount] = useState(0)
  const [accountsExpanded, setAccountsExpanded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [hasMicrosoftAccount, setHasMicrosoftAccount] = useState(false)
  const [hasGmailAccount, setHasGmailAccount] = useState(false)
  const hasSyncableAccounts = hasMicrosoftAccount || hasGmailAccount

  // Use refs to track values for polling without causing re-renders
  const syncingRef = useRef(syncing)
  const hasSyncableAccountsRef = useRef(hasSyncableAccounts)

  // Keep refs in sync with state
  useEffect(() => {
    syncingRef.current = syncing
  }, [syncing])

  useEffect(() => {
    hasSyncableAccountsRef.current = hasSyncableAccounts
  }, [hasSyncableAccounts])

  // Get tenant configuration for theming
  const { isVoiceAlchemy, gradientConfig } = useTenant()
  const { accentColor, accentColorLight } = gradientConfig

  // Initial load effect - only runs once on mount
  useEffect(() => {
    loadAccounts()
    loadAiDraftsCount()
    triggerInitialSync()
  }, [userId])

  // Polling effect - sets up intervals using refs to avoid infinite loops
  useEffect(() => {
    // Set up automatic email polling every 60 seconds for Microsoft/Gmail accounts
    // Only poll when the tab is visible to reduce server load
    const pollInterval = setInterval(() => {
      if (hasSyncableAccountsRef.current && !syncingRef.current && document.visibilityState === 'visible') {
        console.log('[Email Sidebar] Auto-polling for new emails...')
        handleAutoSync()
      }
    }, 60000) // 60 seconds

    // Sync when tab becomes visible after being hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && hasSyncableAccountsRef.current && !syncingRef.current) {
        console.log('[Email Sidebar] Tab visible, checking for new emails...')
        handleAutoSync()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [userId])

  // Trigger initial email sync for Microsoft and Gmail (runs once on first login)
  // Optimized: Run both syncs in parallel
  const triggerInitialSync = useCallback(async () => {
    const syncPromises: Promise<boolean>[] = []

    // Microsoft initial sync
    syncPromises.push(
      fetch('/api/email/microsoft/initial-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
        .then(async (res) => {
          if (res.ok) {
            const result = await res.json()
            return result.results?.some((r: any) => r.created > 0) ?? false
          }
          return false
        })
        .catch(() => false)
    )

    // Gmail initial sync
    syncPromises.push(
      fetch('/api/email/gmail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: false }),
      })
        .then(async (res) => {
          if (res.ok) {
            const result = await res.json()
            return result.results?.some((r: any) => r.created > 0) ?? false
          }
          return false
        })
        .catch(() => false)
    )

    // Run in parallel - only update counts, don't refresh full page
    const results = await Promise.all(syncPromises)
    if (results.some(Boolean)) {
      loadAccounts()
      // Don't call router.refresh() here - it causes UI flicker
      // New emails will appear on next navigation or manual refresh
    }
  }, [])

  const loadAiDraftsCount = async () => {
    const supabase = createClient()
    const { count } = await supabase
      .from('email_drafts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')

    setAiDraftsCount(count || 0)
  }

  // Load folder counts whenever accounts change
  useEffect(() => {
    if (accounts.length > 0) {
      loadFolderCounts(accounts.map(a => a.id))
    }
  }, [accounts])

  // Listen for star changes to update count in real-time
  useEffect(() => {
    const handleStarredChange = (e: CustomEvent<{ threadId: string; isStarred: boolean }>) => {
      setStarredCount(prev => e.detail.isStarred ? prev + 1 : Math.max(0, prev - 1))
    }

    window.addEventListener('email-starred-changed', handleStarredChange as EventListener)
    return () => {
      window.removeEventListener('email-starred-changed', handleStarredChange as EventListener)
    }
  }, [])

  // Listen for read changes to update inbox unread count in real-time
  useEffect(() => {
    const handleReadChange = (e: CustomEvent<{ threadId: string; isRead: boolean }>) => {
      setFolderCounts(prev => {
        const inbox = prev.inbox || { total: 0, unread: 0 }
        return {
          ...prev,
          inbox: {
            ...inbox,
            unread: e.detail.isRead ? Math.max(0, inbox.unread - 1) : inbox.unread + 1
          }
        }
      })
    }

    window.addEventListener('email-read-changed', handleReadChange as EventListener)
    return () => {
      window.removeEventListener('email-read-changed', handleReadChange as EventListener)
    }
  }, [])

  const loadAccounts = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('email_accounts')
      .select('*, email_domains(*)')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('is_primary', { ascending: false })

    if (data && data.length > 0) {
      setAccounts(data)
      // Select primary account or first one
      const primary = data.find(a => a.is_primary) || data[0]
      setSelectedAccount(primary)
      // Check for Microsoft and Gmail accounts
      setHasMicrosoftAccount(data.some((a: any) => a.provider === 'microsoft'))
      setHasGmailAccount(data.some((a: any) => a.provider === 'gmail'))
    }
    setLoading(false)
  }

  // Auto sync for polling (silent, doesn't show loading state)
  // Optimized: Run syncs in parallel
  const handleAutoSync = useCallback(async () => {
    const syncPromises: Promise<boolean>[] = []

    // Microsoft sync
    if (hasMicrosoftAccount) {
      syncPromises.push(
        fetch('/api/email/microsoft/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSync: false }),
        })
          .then(async (res) => {
            if (res.ok) {
              const result = await res.json()
              return result.results?.some((r: any) => r.created > 0) ?? false
            }
            return false
          })
          .catch((error) => {
            console.error('[Email Sidebar] Microsoft auto-sync error:', error)
            return false
          })
      )
    }

    // Gmail sync
    if (hasGmailAccount) {
      syncPromises.push(
        fetch('/api/email/gmail/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSync: false }),
        })
          .then(async (res) => {
            if (res.ok) {
              const result = await res.json()
              return result.results?.some((r: any) => r.created > 0) ?? false
            }
            return false
          })
          .catch((error) => {
            console.error('[Email Sidebar] Gmail auto-sync error:', error)
            return false
          })
      )
    }

    // Run in parallel
    if (syncPromises.length > 0) {
      const results = await Promise.all(syncPromises)
      if (results.some(Boolean)) {
        console.log('[Email Sidebar] New emails found, updating counts...')
        // Only reload accounts and counts - don't trigger full page refresh
        // The email notification toast will handle showing new emails
        loadAccounts()
      }
    }
  }, [hasMicrosoftAccount, hasGmailAccount])

  // Manual sync for Microsoft and Gmail accounts
  const handleManualSync = async () => {
    if (syncing) return
    setSyncing(true)

    const syncPromises = []

    // Microsoft sync
    if (hasMicrosoftAccount) {
      syncPromises.push(
        fetch('/api/email/microsoft/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSync: true }),
        }).catch(err => console.error('[Email Sidebar] Microsoft sync error:', err))
      )
    }

    // Gmail sync
    if (hasGmailAccount) {
      syncPromises.push(
        fetch('/api/email/gmail/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSync: true }),
        }).catch(err => console.error('[Email Sidebar] Gmail sync error:', err))
      )
    }

    await Promise.all(syncPromises)
    loadAccounts()
    router.refresh()
    setSyncing(false)
  }

  const loadFolderCounts = async (accountIds: string[]) => {
    if (accountIds.length === 0) {
      setFolderCounts({})
      return
    }

    const supabase = createClient()

    // Double-check that we only query accounts belonging to this user
    const { data: verifiedAccounts } = await supabase
      .from('email_accounts')
      .select('id')
      .in('id', accountIds)
      .eq('user_id', userId)
      .eq('is_deleted', false)

    const verifiedAccountIds = verifiedAccounts?.map(a => a.id) || []

    if (verifiedAccountIds.length === 0) {
      setFolderCounts({})
      return
    }

    const { data } = await supabase
      .from('email_threads')
      .select('folder, is_read, is_starred')
      .in('email_account_id', verifiedAccountIds)
      .eq('is_deleted', false)

    if (data) {
      const counts: Record<string, { total: number; unread: number }> = {}
      let starred = 0
      for (const thread of data) {
        if (!counts[thread.folder]) {
          counts[thread.folder] = { total: 0, unread: 0 }
        }
        counts[thread.folder].total++
        if (!thread.is_read) {
          counts[thread.folder].unread++
        }
        if (thread.is_starred) {
          starred++
        }
      }
      setFolderCounts(counts)
      setStarredCount(starred)
    }
  }

  const isActive = (href: string) => {
    if (href === '/dashboard/email') {
      return pathname === href && !pathname.includes('starred')
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Theme-aware styling - parent layout provides glassmorphic container
  const sidebarStyle = {
    background: 'transparent',
  }

  const borderColor = 'border-white/10'
  const textColor = 'text-gray-300'
  const textColorMuted = 'text-gray-400'
  const hoverBg = 'hover:bg-white/10 hover:text-white'

  const getActiveClasses = (active: boolean) => {
    if (!active) return `${textColor} ${hoverBg}`
    if (isVoiceAlchemy) return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-white/10'
  }

  const getActiveStyle = (active: boolean) => {
    if (!active) return undefined
    if (isVoiceAlchemy) return undefined
    return {
      color: accentColor,
      borderColor: `${accentColor}40`,
      border: '1px solid',
    }
  }

  return (
    <div
      className="w-full h-full flex flex-col"
      style={sidebarStyle}
    >
      {/* Compose Button - Premium CTA */}
      <div className="p-4">
        {onCompose ? (
          <button
            onClick={onCompose}
            className={`group relative w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 overflow-hidden ${
              isVoiceAlchemy ? '' : ''
            }`}
            style={isVoiceAlchemy ? {
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(217, 119, 6, 0.1) 100%)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              color: '#fbbf24',
              boxShadow: '0 4px 12px rgba(234, 179, 8, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            } : {
              background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 100%)`,
              border: `1px solid ${accentColor}25`,
              color: accentColor,
              boxShadow: `0 4px 12px ${accentColor}10, inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
            }}
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
            Compose
          </button>
        ) : (
          <Link
            href="/dashboard/email/compose"
            className={`group relative w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 overflow-hidden`}
            style={isVoiceAlchemy ? {
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(217, 119, 6, 0.1) 100%)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              color: '#fbbf24',
              boxShadow: '0 4px 12px rgba(234, 179, 8, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            } : {
              background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 100%)`,
              border: `1px solid ${accentColor}25`,
              color: accentColor,
              boxShadow: `0 4px 12px ${accentColor}10, inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
            }}
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
            Compose
          </Link>
        )}
      </div>

      {/* Folders - Premium navigation */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {folders.map((item) => {
          const active = isActive(item.href)
          const count = folderCounts[item.folder]
          const unreadCount = count?.unread || 0

          // Determine badge count based on folder type
          const isStarredFolder = item.name === 'Starred'
          const isInboxFolder = item.name === 'Inbox'
          const badgeCount = isStarredFolder ? starredCount : (isInboxFolder ? unreadCount : 0)
          const showBadge = badgeCount > 0

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? isVoiceAlchemy
                    ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                    : 'bg-white/[0.08] text-white border border-white/[0.08]'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
              }`}
              style={active && !isVoiceAlchemy ? {
                color: accentColor,
                borderColor: `${accentColor}30`,
                background: `${accentColor}10`,
              } : undefined}
            >
              <item.icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`} />
              <span className="flex-1 truncate">{item.name}</span>
              {showBadge && (
                <span
                  className="px-2 py-0.5 text-[10px] font-semibold rounded-md flex-shrink-0 tabular-nums"
                  style={{
                    background: isVoiceAlchemy
                      ? 'linear-gradient(135deg, #eab308 0%, #d97706 100%)'
                      : `linear-gradient(135deg, ${accentColor} 0%, ${accentColorLight} 100%)`,
                    color: isVoiceAlchemy ? '#000' : '#fff',
                    boxShadow: isVoiceAlchemy
                      ? '0 2px 8px rgba(234, 179, 8, 0.3)'
                      : `0 2px 8px ${accentColor}40`,
                  }}
                >
                  {badgeCount}
                </span>
              )}
            </Link>
          )
        })}

        {/* AI Drafts - Special Section with premium divider */}
        <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-1">
          <Link
            href="/dashboard/email/ai-drafts"
            className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              pathname === '/dashboard/email/ai-drafts'
                ? isVoiceAlchemy
                  ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                  : 'bg-white/[0.08] text-white border border-white/[0.08]'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
            }`}
            style={pathname === '/dashboard/email/ai-drafts' && !isVoiceAlchemy ? {
              color: accentColor,
              borderColor: `${accentColor}30`,
              background: `${accentColor}10`,
            } : undefined}
          >
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 truncate">AI Drafts</span>
            {aiDraftsCount > 0 && (
              <span
                className="px-2 py-0.5 text-[10px] font-semibold rounded-md flex-shrink-0 tabular-nums"
                style={{
                  background: isVoiceAlchemy
                    ? 'linear-gradient(135deg, #eab308 0%, #d97706 100%)'
                    : `linear-gradient(135deg, ${accentColor} 0%, ${accentColorLight} 100%)`,
                  color: isVoiceAlchemy ? '#000' : '#fff',
                  boxShadow: isVoiceAlchemy
                    ? '0 2px 8px rgba(234, 179, 8, 0.3)'
                    : `0 2px 8px ${accentColor}40`,
                }}
              >
                {aiDraftsCount}
              </span>
            )}
          </Link>

          {/* Snoozed Emails */}
          <Link
            href="/dashboard/email/snoozed"
            className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              pathname === '/dashboard/email/snoozed'
                ? isVoiceAlchemy
                  ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                  : 'bg-white/[0.08] text-white border border-white/[0.08]'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
            }`}
            style={pathname === '/dashboard/email/snoozed' && !isVoiceAlchemy ? {
              color: accentColor,
              borderColor: `${accentColor}30`,
              background: `${accentColor}10`,
            } : undefined}
          >
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 truncate">Snoozed</span>
          </Link>
        </div>

        {/* Saved Views / Smart Folders */}
        <SavedViewsList userId={userId} />
      </nav>

      {/* Accounts Section - Premium collapsible */}
      <div className="px-3 py-3 border-t border-white/[0.06]">
        <button
          onClick={() => setAccountsExpanded(!accountsExpanded)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/[0.03]"
        >
          {accountsExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200" />
          )}
          <span className="uppercase tracking-wider text-[10px]">Accounts</span>
        </button>

        {accountsExpanded && (
          <div className="space-y-1 mt-2">
            {loading ? (
              <div className="px-3 py-2 text-xs text-gray-500">Loading...</div>
            ) : accounts.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-600">No accounts</div>
            ) : (
              accounts.map((account) => {
                const isSelected = selectedAccount?.id === account.id
                return (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccount(account)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-200 ${
                      isSelected
                        ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate flex-1 text-left font-medium">{account.email_address}</span>
                    {account.is_primary && (
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wider flex-shrink-0 px-1.5 py-0.5 rounded"
                        style={{
                          color: isVoiceAlchemy ? '#fbbf24' : accentColor,
                          background: isVoiceAlchemy ? 'rgba(251, 191, 36, 0.1)' : `${accentColor}15`,
                        }}
                      >
                        Primary
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Settings & Add Domain - Premium footer */}
      <div className="p-3 border-t border-white/[0.06] space-y-1">
        {hasSyncableAccounts && (
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-white hover:bg-white/[0.05] transition-all duration-200 disabled:opacity-50 border border-transparent hover:border-white/[0.06]"
          >
            <RefreshCw className={`w-4 h-4 flex-shrink-0 ${syncing ? 'animate-spin' : ''}`} />
            <span className="truncate font-medium">{syncing ? 'Syncing...' : 'Sync Emails'}</span>
          </button>
        )}
        <Link
          href="/dashboard/email/settings/domains"
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-white hover:bg-white/[0.05] transition-all duration-200 border border-transparent hover:border-white/[0.06]"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span className="truncate font-medium">Add Domain</span>
        </Link>
        <Link
          href="/dashboard/email/settings"
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-white hover:bg-white/[0.05] transition-all duration-200 border border-transparent hover:border-white/[0.06]"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <span className="truncate font-medium">Settings</span>
        </Link>
      </div>
    </div>
  )
}
