'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { EmailThread } from '@/types/email.types'
import { EmailList } from '../../components/email-list'
import {
  Folder,
  Mail,
  Reply,
  Clock,
  Paperclip,
  Star,
  AlertCircle,
} from 'lucide-react'

interface SavedView {
  id: string
  name: string
  icon: string
  color: string
  filters: Record<string, any>
  is_system: boolean
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  folder: Folder,
  mail: Mail,
  reply: Reply,
  clock: Clock,
  paperclip: Paperclip,
  star: Star,
}

export default function SavedViewPage() {
  const params = useParams()
  const viewId = params.viewId as string

  const [view, setView] = useState<SavedView | null>(null)
  const [threads, setThreads] = useState<EmailThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadViewAndThreads()
  }, [viewId])

  const loadViewAndThreads = async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Not authenticated')
      setLoading(false)
      return
    }

    // Load the view
    const viewResponse = await fetch(`/api/email/views/${viewId}`)
    if (!viewResponse.ok) {
      setError('View not found')
      setLoading(false)
      return
    }

    const viewData = await viewResponse.json()
    setView(viewData)

    // Load threads based on view filters
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
    const filters = viewData.filters || {}

    // Build query based on filters
    let query = supabase
      .from('email_threads')
      .select(`
        *,
        emails (
          id,
          subject,
          from_name,
          from_address,
          to_addresses,
          cc_addresses,
          sent_at,
          created_at,
          snippet,
          is_read
        )
      `)
      .in('email_account_id', accountIds)
      .eq('is_deleted', false)

    // Apply filters based on the filter schema
    // Handle is_read filter (for Unread view: is_read = false)
    if (filters.is_read === false) {
      query = query.eq('is_read', false)
    } else if (filters.is_read === true) {
      query = query.eq('is_read', true)
    }

    // Handle starred filter
    if (filters.is_starred === true) {
      query = query.eq('is_starred', true)
    }

    // Handle attachments filter
    if (filters.has_attachments === true) {
      query = query.eq('has_attachments', true)
    }

    // Handle workflow state filter
    if (filters.workflow_state) {
      query = query.eq('workflow_state', filters.workflow_state)
    }

    // Handle folder filter
    if (filters.folder) {
      query = query.eq('folder', filters.folder)
    }

    // Handle label filter
    if (filters.labels && Array.isArray(filters.labels) && filters.labels.length > 0) {
      query = query.contains('labels', filters.labels)
    }

    // Handle from filter
    if (filters.from) {
      query = query.ilike('participant_emails', `%${filters.from}%`)
    }

    // Handle date filters
    if (filters.date_after) {
      query = query.gte('last_message_at', filters.date_after)
    }
    if (filters.date_before) {
      query = query.lte('last_message_at', filters.date_before)
    }

    query = query.order('last_message_at', { ascending: false }).limit(100)

    const { data, error: queryError } = await query

    if (queryError) {
      console.error('Error loading threads:', queryError)
      setError('Failed to load threads')
    } else {
      setThreads(data || [])
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">{error}</h3>
      </div>
    )
  }

  if (!view) {
    return null
  }

  const IconComponent = ICON_MAP[view.icon] || Folder

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <IconComponent className="w-5 h-5" style={{ color: view.color }} />
          {view.name}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {threads.length} {threads.length === 1 ? 'thread' : 'threads'}
        </p>
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <IconComponent className="w-12 h-12 text-gray-500 mb-4" style={{ color: view.color }} />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No emails match this view</h3>
          <p className="text-gray-500 max-w-sm">
            When emails match the criteria for this view, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <EmailList
            threads={threads}
            folder="inbox"
          />
        </div>
      )}
    </div>
  )
}
