'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  Search,
  Plus,
  X,
  Inbox,
  Send,
  FileEdit,
  Trash2,
  AlertOctagon,
  Archive,
  Star,
  Settings,
  Mail,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { EmailAccount, EmailFolder } from '@/types/email.types'
import { useTenant } from '@/lib/tenant'

interface EmailMobileWrapperProps {
  userId: string
  userEmail?: string | null
  children: React.ReactNode
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

export function EmailMobileWrapper({ userId, userEmail, children }: EmailMobileWrapperProps) {
  const pathname = usePathname()
  const { isCitadelGold, gradientConfig } = useTenant()
  const useCitadelBrand = isCitadelGold && (userEmail || '').toLowerCase().endsWith('@voicealchemyacademy.com')
  const { accentColor, accentColorLight } = gradientConfig
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [folderCounts, setFolderCounts] = useState<Record<string, { total: number; unread: number }>>({})
  const [aiDraftsCount, setAiDraftsCount] = useState(0)
  const [accountsExpanded, setAccountsExpanded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [hasMicrosoftAccount, setHasMicrosoftAccount] = useState(false)

  useEffect(() => {
    loadAccounts()
    loadAiDraftsCount()
  }, [userId])

  useEffect(() => {
    if (accounts.length > 0) {
      loadFolderCounts(accounts.map(a => a.id))
    }
  }, [accounts])

  // Close sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const loadAiDraftsCount = async () => {
    const supabase = createClient()
    const { count } = await supabase
      .from('email_drafts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')

    setAiDraftsCount(count || 0)
  }

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
      setHasMicrosoftAccount(data.some((a: any) => a.provider === 'microsoft'))
    }
  }

  const loadFolderCounts = async (accountIds: string[]) => {
    if (accountIds.length === 0) return

    const supabase = createClient()
    const { data: verifiedAccounts } = await supabase
      .from('email_accounts')
      .select('id')
      .in('id', accountIds)
      .eq('user_id', userId)
      .eq('is_deleted', false)

    const verifiedAccountIds = verifiedAccounts?.map(a => a.id) || []
    if (verifiedAccountIds.length === 0) return

    const { data } = await supabase
      .from('email_threads')
      .select('folder, is_read')
      .in('email_account_id', verifiedAccountIds)
      .eq('is_deleted', false)

    if (data) {
      const counts: Record<string, { total: number; unread: number }> = {}
      for (const thread of data) {
        if (!counts[thread.folder]) {
          counts[thread.folder] = { total: 0, unread: 0 }
        }
        counts[thread.folder].total++
        if (!thread.is_read) {
          counts[thread.folder].unread++
        }
      }
      setFolderCounts(counts)
    }
  }

  const handleManualSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      await fetch('/api/email/microsoft/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: true }),
      })
      loadAccounts()
    } catch (error) {
      console.error('[Email Mobile] Sync error:', error)
    }
    setSyncing(false)
  }

  const isActive = (href: string) => {
    if (href === '/dashboard/email') {
      return pathname === href && !pathname.includes('starred')
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  const getCurrentFolderName = () => {
    if (pathname.includes('starred')) return 'Starred'
    if (pathname.includes('/sent')) return 'Sent'
    if (pathname.includes('/drafts')) return 'Drafts'
    if (pathname.includes('/spam')) return 'Spam'
    if (pathname.includes('/trash')) return 'Trash'
    if (pathname.includes('/archive')) return 'Archive'
    if (pathname.includes('/ai-drafts')) return 'AI Drafts'
    if (pathname.includes('/compose')) return 'Compose'
    return 'Inbox'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mobile Header - Glassmorphic */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-white/10 glass-card-subtle">
        <div className="flex items-center gap-2">
          {/* Hamburger Menu */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search Bar */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-full text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* Compose Button */}
          <Link
            href="/dashboard/email/compose"
            className="p-2 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 text-black"
          >
            <Plus className="w-5 h-5" />
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Slide-out Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 w-72 border-r z-50 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={useCitadelBrand ? {
          background: '#1a1f1a',
          borderColor: 'rgba(255,255,255,0.1)',
        } : {
          background: 'rgba(30, 41, 59, 0.88)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderColor: 'rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Email</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Folders */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {folders.map((item) => {
            const active = isActive(item.href)
            const count = folderCounts[item.folder]
            const unreadCount = count?.unread || 0
            const showBadge = item.folder === 'inbox' && unreadCount > 0

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? useCitadelBrand
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : ''
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
                style={active && !useCitadelBrand ? {
                  background: 'rgba(255,255,255,0.1)',
                  color: accentColorLight,
                  border: `1px solid ${accentColor}40`,
                } : undefined}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.name}</span>
                {showBadge && (
                  <span
                    className="px-2 py-0.5 text-xs font-medium text-black rounded-full"
                    style={useCitadelBrand ? { background: '#eab308' } : { background: accentColorLight }}
                  >
                    {unreadCount}
                  </span>
                )}
              </Link>
            )
          })}

          {/* AI Drafts */}
          <div className="pt-2 mt-2 border-t border-white/10">
            <Link
              href="/dashboard/email/ai-drafts"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                pathname === '/dashboard/email/ai-drafts'
                  ? useCitadelBrand
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : ''
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
              style={pathname === '/dashboard/email/ai-drafts' && !useCitadelBrand ? {
                background: 'rgba(255,255,255,0.1)',
                color: accentColorLight,
                border: `1px solid ${accentColor}40`,
              } : undefined}
            >
              <Sparkles className="w-5 h-5" />
              <span className="flex-1">AI Drafts</span>
              {aiDraftsCount > 0 && (
                <span
                  className="px-2 py-0.5 text-xs font-medium text-black rounded-full"
                  style={useCitadelBrand
                    ? { background: 'linear-gradient(90deg, #eab308, #f59e0b)' }
                    : { background: `linear-gradient(90deg, ${accentColorLight}, ${accentColor})` }}
                >
                  {aiDraftsCount}
                </span>
              )}
            </Link>
          </div>
        </nav>

        {/* Accounts Section */}
        <div className="px-3 py-2 border-t border-white/10">
          <button
            onClick={() => setAccountsExpanded(!accountsExpanded)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            {accountsExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <span>Accounts</span>
          </button>

          {accountsExpanded && (
            <div className="space-y-1 mt-1">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400"
                >
                  <Mail className="w-4 h-4" />
                  <span className="truncate flex-1">{account.email_address}</span>
                  {account.is_primary && (
                    <span
                      className="text-xs"
                      style={useCitadelBrand ? { color: '#facc15' } : { color: accentColorLight }}
                    >
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-white/10 space-y-1">
          {hasMicrosoftAccount && (
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Emails'}
            </button>
          )}
          <Link
            href="/dashboard/email/settings"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-all"
          >
            <Settings className="w-4 h-4" />
            Email Settings
          </Link>
        </div>
      </div>
    </div>
  )
}
