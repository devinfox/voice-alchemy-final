'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { EmailThread } from '@/types/email.types'
import { EmailList } from '../components/email-list'
import { Clock } from 'lucide-react'

export default function SnoozedPage() {
  const [threads, setThreads] = useState<EmailThread[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSnoozedThreads()
  }, [])

  const loadSnoozedThreads = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_deleted', false)

    if (!accounts || accounts.length === 0) {
      setThreads([])
      setLoading(false)
      return
    }

    const accountIds = accounts.map(a => a.id)

    const { data, error } = await supabase
      .from('email_threads')
      .select(`
        *,
        emails!inner (
          id,
          subject,
          from_name,
          from_address,
          to_addresses,
          cc_addresses,
          received_at,
          body_preview,
          has_attachments
        )
      `)
      .in('email_account_id', accountIds)
      .eq('workflow_state', 'snoozed')
      .not('snoozed_until', 'is', null)
      .eq('is_deleted', false)
      .order('snoozed_until', { ascending: true })
      .limit(100)

    if (error) {
      console.error('Error loading snoozed threads:', error)
    } else {
      setThreads(data || [])
    }
    setLoading(false)
  }

  const formatSnoozeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === now.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    } else {
      return date.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading snoozed emails...</div>
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Clock className="w-12 h-12 text-gray-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">No snoozed emails</h3>
        <p className="text-gray-500 max-w-sm">
          Snooze emails to temporarily hide them and have them reappear at a later time.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-400" />
          Snoozed Emails
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {threads.length} snoozed {threads.length === 1 ? 'email' : 'emails'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const snoozedUntil = (thread as any).snoozed_until
          return (
            <div key={thread.id} className="relative">
              {snoozedUntil && (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 rounded text-xs text-orange-400 z-10">
                  <Clock className="w-3 h-3" />
                  {formatSnoozeTime(snoozedUntil)}
                </div>
              )}
              <EmailList
                threads={[thread]}
                folder="archive"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
