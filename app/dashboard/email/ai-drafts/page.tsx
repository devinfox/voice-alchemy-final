'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Sparkles, Mail, Paperclip, Clock, Trash2, Send } from 'lucide-react'
import Link from 'next/link'

interface AiDraft {
  id: string
  to_email: string
  to_name: string | null
  subject: string | null
  body_html: string | null
  attachment_ids: string[]
  due_at: string | null
  status: string
  commitment_quote: string | null
  created_at: string
}

interface Document {
  id: string
  file_name: string
}

export default function AiDraftsPage() {
  const [drafts, setDrafts] = useState<AiDraft[]>([])
  const [documents, setDocuments] = useState<Record<string, Document>>({})
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    loadDrafts()
  }, [])

  const loadDrafts = async () => {
    const supabase = createClient()

    // Run draft expiration cleanup in background
    fetch('/api/email/draft?expire=true').catch(err =>
      console.error('Failed to run draft expiration:', err)
    )

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) {
      // Try direct ID match
      const { data: profileDirect } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single()

      if (profileDirect) {
        setUserId(profileDirect.id)
      }
    } else {
      setUserId(profile.id)
    }

    const effectiveUserId = profile?.id || user.id

    // Fetch AI drafts
    const { data: draftsData, error } = await supabase
      .from('email_drafts')
      .select('*')
      .eq('user_id', effectiveUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load AI drafts:', error)
    } else {
      setDrafts(draftsData || [])

      // Fetch document names for attachments
      const allAttachmentIds = (draftsData || [])
        .flatMap(d => d.attachment_ids || [])
        .filter((id, index, self) => self.indexOf(id) === index)

      if (allAttachmentIds.length > 0) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, file_name')
          .in('id', allAttachmentIds)

        if (docs) {
          const docsMap: Record<string, Document> = {}
          docs.forEach(d => { docsMap[d.id] = d })
          setDocuments(docsMap)
        }
      }
    }

    setLoading(false)
  }

  const deleteDraft = async (draftId: string) => {
    try {
      const response = await fetch(`/api/email/draft?id=${draftId}&deleteTask=true`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        console.error('Failed to delete draft')
        return
      }

      setDrafts(prev => prev.filter(d => d.id !== draftId))
    } catch (error) {
      console.error('Error deleting draft:', error)
    }
  }

  const formatTimeAgo = (isoString: string): string => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const formatDueTime = (isoString: string | null): string | null => {
    if (!isoString) return null
    const dueDate = new Date(isoString)
    const now = new Date()
    const diffMs = dueDate.getTime() - now.getTime()

    if (diffMs < 0) return 'Overdue'

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins}m left`
    }
    if (diffHours < 24) return `${diffHours}h left`

    return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-white/10">
          <h1 className="text-xl font-light text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            AI Drafts
          </h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h1 className="text-xl font-light text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-yellow-400" />
          AI Drafts
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Emails drafted by Nimbus based on your conversations
        </p>
      </div>

      {/* Drafts List */}
      <div className="flex-1 overflow-y-auto">
        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Sparkles className="w-12 h-12 mb-4 opacity-50" />
            <p>No AI drafts yet</p>
            <p className="text-sm mt-1">Nimbus will draft emails when you make commitments during calls or chats</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {drafts.map((draft) => {
              const attachmentNames = (draft.attachment_ids || [])
                .map(id => documents[id]?.file_name)
                .filter(Boolean)
              const dueTime = formatDueTime(draft.due_at)

              return (
                <div
                  key={draft.id}
                  className="p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-yellow-400" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">
                          To: {draft.to_name || draft.to_email}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(draft.created_at)}
                        </span>
                        {dueTime && (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                            dueTime === 'Overdue'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {dueTime}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-300 font-medium">
                        {draft.subject || '(no subject)'}
                      </p>

                      {draft.commitment_quote && (
                        <p className="text-xs text-gray-500 mt-1 italic">
                          &ldquo;{draft.commitment_quote.substring(0, 100)}{draft.commitment_quote.length > 100 ? '...' : ''}&rdquo;
                        </p>
                      )}

                      {attachmentNames.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <Paperclip className="w-4 h-4 text-gray-500" />
                          <div className="flex flex-wrap gap-1">
                            {attachmentNames.map((name, i) => (
                              <span
                                key={i}
                                className="text-xs px-2 py-0.5 bg-green-500/10 border border-green-500/30 rounded text-green-400"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => deleteDraft(draft.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete draft and task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <Link
                        href={`/dashboard/email/compose?draftId=${draft.id}`}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-black rounded-lg transition-all hover:scale-105"
                        style={{
                          background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
                        }}
                      >
                        <Send className="w-4 h-4" />
                        Review
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
