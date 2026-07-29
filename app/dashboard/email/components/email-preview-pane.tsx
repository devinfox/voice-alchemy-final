'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  Star,
  Trash2,
  Archive,
  ArchiveRestore,
  Mail,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react'
import { LabelPicker } from './label-picker'
import { ThreadStatePicker } from './thread-state-picker'
import { SnoozePicker } from './snooze-picker'
import { EmailThread, Email, EmailAccount, EmailAttachment } from '@/types/email.types'
import { formatEmailDateFull, stripQuotedContent, stripQuotedContentText } from '@/lib/email-utils'
import { EmailBodyFrame } from './email-body-frame'
import { maybeDecodeQuotedPrintable } from '@/lib/quoted-printable'
import { repairUtf8Mojibake } from '@/lib/mojibake'
import { useEmailUI } from '@/lib/contexts/email-ui-context'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Helper to format a single recipient (handles both string and object formats)
function formatRecipient(recipient: any): string {
  if (!recipient) return ''
  if (typeof recipient === 'string') return recipient
  if (recipient.email) {
    return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email
  }
  return String(recipient)
}

// Helper to format multiple recipients
function formatRecipients(recipients: any): string {
  if (!recipients) return ''
  if (!Array.isArray(recipients)) return formatRecipient(recipients)
  return recipients.map(formatRecipient).join(', ')
}

interface EmailPreviewPaneProps {
  threadId: string | null
  accounts: EmailAccount[]
  onReply?: (emailId: string, threadId: string) => void
  onReplyAll?: (emailId: string, threadId: string) => void
  onForward?: (emailId: string) => void
}

// The intermediate "reading surface" behind an OPEN message — a light neutral
// mat that sits between the dark app chrome and the pure-white email card. Only
// applied to expanded messages; the app shell and collapsed rows stay dark.
const READING_MAT_BG = '#f1f1f2'

// An elevated white "sheet of paper" for the email body. The iframe already
// renders sender HTML on pure white (untouched); this wrapper only adds depth
// (radius/shadow/hairline) so the white area reads as a raised card on the mat
// rather than a flat block glued to the chrome. NOTE: no padding here — the
// iframe supplies its own interior padding, and a full-bleed email should reach
// the card edge like it does in Gmail.
const EMAIL_SHEET_STYLE: CSSProperties = {
  background: '#ffffff',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)',
  border: '1px solid rgba(0,0,0,0.06)',
  overflow: 'hidden',
}

export function EmailPreviewPane({ threadId, accounts, onReply, onReplyAll, onForward }: EmailPreviewPaneProps) {
  const router = useRouter()
  const { setSelectedThreadId, navigateToNextThread } = useEmailUI()
  const [thread, setThread] = useState<(EmailThread & { email_account?: { id: string; email_address: string; display_name: string | null } | null }) | null>(null)
  const [emails, setEmails] = useState<(Email & { attachments: EmailAttachment[] })[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set())
  // Per-message: reveal the trimmed quoted/previous-conversation content. Each
  // bubble shows only its own message by default; older messages live in their
  // own (collapsed) bubbles above.
  const [showQuotedIds, setShowQuotedIds] = useState<Set<string>>(new Set())
  const toggleQuoted = (id: string) => setShowQuotedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  // Fetch thread data when threadId changes
  useEffect(() => {
    if (!threadId) {
      setThread(null)
      setEmails([])
      return
    }

    const fetchThread = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/email/threads/${threadId}`)
        if (response.ok) {
          const data = await response.json()
          setThread(data.thread)
          setEmails(data.emails || [])
          // Expand the last email by default
          if (data.emails && data.emails.length > 0) {
            setExpandedEmails(new Set([data.emails[data.emails.length - 1].id]))
          }
          // Dispatch event to update sidebar unread count if thread was unread
          if (data.wasUnread) {
            window.dispatchEvent(new CustomEvent('email-read-changed', {
              detail: { threadId, isRead: true }
            }))
          }
        } else {
          console.error('Failed to fetch thread')
          setThread(null)
          setEmails([])
        }
      } catch (error) {
        console.error('Error fetching thread:', error)
        setThread(null)
        setEmails([])
      } finally {
        setLoading(false)
      }
    }

    fetchThread()
  }, [threadId])

  const toggleExpanded = (emailId: string) => {
    const newExpanded = new Set(expandedEmails)
    if (newExpanded.has(emailId)) {
      newExpanded.delete(emailId)
    } else {
      newExpanded.add(emailId)
    }
    setExpandedEmails(newExpanded)
  }

  const toggleStar = async () => {
    if (!thread) return
    setActionLoading(true)
    const supabase = createClient()
    const newStarredState = !thread.is_starred
    await supabase
      .from('email_threads')
      .update({ is_starred: newStarredState })
      .eq('id', thread.id)
    setThread({ ...thread, is_starred: newStarredState })
    // Dispatch event to update sidebar counts
    window.dispatchEvent(new CustomEvent('email-starred-changed', {
      detail: { threadId: thread.id, isStarred: newStarredState }
    }))
    router.refresh()
    setActionLoading(false)
  }

  const archiveThread = async () => {
    if (!thread) return
    setActionLoading(true)
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'archive', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    navigateToNextThread()
    router.refresh()
    setActionLoading(false)
  }

  const unarchiveThread = async () => {
    if (!thread) return
    setActionLoading(true)
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'inbox', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    navigateToNextThread()
    router.refresh()
    setActionLoading(false)
  }

  const markUnread = async () => {
    if (!thread) return
    setActionLoading(true)
    const supabase = createClient()
    setThread({ ...thread, is_read: false })
    window.dispatchEvent(new CustomEvent('email-read-changed', {
      detail: { threadId: thread.id, isRead: false }
    }))
    await Promise.all([
      supabase
        .from('email_threads')
        .update({ is_read: false })
        .eq('id', thread.id),
      supabase
        .from('emails')
        .update({ is_read: false, read_at: null })
        .eq('thread_id', thread.id)
        .eq('is_inbound', true)
    ])
    router.refresh()
    setActionLoading(false)
  }

  const moveToTrash = async () => {
    if (!thread) return
    if (!confirm('Move this conversation to trash?')) return
    setActionLoading(true)
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'trash', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    navigateToNextThread()
    router.refresh()
    setActionLoading(false)
  }

  const permanentlyDelete = async () => {
    if (!thread) return
    if (!confirm('Permanently delete this conversation? This cannot be undone.')) return
    setActionLoading(true)
    try {
      const response = await fetch(`/api/email/threads/${thread.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        navigateToNextThread()
        router.refresh()
      }
    } catch (error) {
      console.error('Error deleting thread:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReply = (email: Email) => {
    if (onReply && thread) {
      onReply(email.id, thread.id)
    }
  }

  const handleReplyAll = (email: Email) => {
    if (onReplyAll && thread) {
      onReplyAll(email.id, thread.id)
    }
  }

  // Reply All is only meaningful when more than one party is involved
  // (the sender plus other To/Cc recipients beyond just us).
  const hasMultipleRecipients = (email: Email) =>
    (email.to_addresses?.length || 0) + (email.cc_addresses?.length || 0) > 1

  const handleForward = (email: Email) => {
    if (onForward) {
      onForward(email.id)
    }
  }

  const getDisplayName = (email: Email, isOutbound: boolean) => {
    if (isOutbound) {
      return email.from_name || email.from_address
    }
    return email.from_name || email.from_address?.split('@')[0] || 'Unknown'
  }

  // Empty state
  if (!threadId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Reply className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a conversation to view</p>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // Thread not found
  if (!thread) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p>Thread not found</p>
        </div>
      </div>
    )
  }

  const isTrash = thread.folder === 'trash'
  const isArchive = thread.folder === 'archive'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10 flex-shrink-0">
        <h2 className="flex-1 text-lg font-medium text-white truncate">
          {thread.subject || '(no subject)'}
        </h2>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Workflow State */}
          <ThreadStatePicker
            threadId={thread.id}
            currentState={(thread as any).workflow_state || null}
          />

          {/* Snooze */}
          <SnoozePicker
            threadId={thread.id}
            snoozedUntil={(thread as any).snoozed_until}
          />

          {/* Labels */}
          <LabelPicker threadId={thread.id} />

          <div className="w-px h-5 bg-white/10 mx-1" />

          <button
            onClick={toggleStar}
            disabled={actionLoading}
            className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${
              thread.is_starred ? 'text-yellow-400' : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Star className={`w-4 h-4 ${thread.is_starred ? 'fill-yellow-400' : ''}`} />
          </button>
          <button
            onClick={markUnread}
            disabled={actionLoading}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Mark as unread"
          >
            <Mail className="w-4 h-4" />
          </button>
          {isArchive ? (
            <button
              onClick={unarchiveThread}
              disabled={actionLoading}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Unarchive"
            >
              <ArchiveRestore className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={archiveThread}
              disabled={actionLoading}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Archive"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
          {isTrash ? (
            <button
              onClick={permanentlyDelete}
              disabled={actionLoading}
              className="p-2 rounded-lg hover:bg-white/10 text-red-400 transition-colors"
              title="Permanently Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={moveToTrash}
              disabled={actionLoading}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Emails */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {emails.map((email, index) => {
            const isExpanded = expandedEmails.has(email.id)
            const isOutbound = !email.is_inbound
            const isLast = index === emails.length - 1

            return (
              <div
                key={email.id}
                className={`overflow-hidden ${isExpanded ? 'rounded-xl' : 'bg-white/5 rounded-lg'}`}
                // When open, the whole panel becomes the light reading mat.
                style={isExpanded ? { backgroundColor: READING_MAT_BG } : undefined}
              >
                {/* Email Header */}
                <div
                  className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                    isExpanded ? 'hover:bg-black/[0.03]' : 'hover:bg-white/5'
                  }`}
                  onClick={() => toggleExpanded(email.id)}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isOutbound ? 'bg-yellow-500/20' : 'bg-blue-500/20'
                  }`}>
                    <span className={`text-xs font-medium ${isOutbound ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {(getDisplayName(email, isOutbound) || 'U')[0].toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`font-medium text-sm truncate block ${isExpanded ? 'text-gray-900' : 'text-white'}`}>
                          {getDisplayName(email, isOutbound)}
                        </span>
                        {email.from_address && (
                          <span className="text-xs text-gray-500 truncate block">
                            {email.from_address}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatEmailDateFull(email.sent_at || email.created_at)}
                      </span>
                    </div>

                    {!isExpanded && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {email.snippet || '(no content)'}
                      </p>
                    )}
                  </div>

                  <button className={`flex-shrink-0 ${isExpanded ? 'text-gray-500' : 'text-gray-400'}`}>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Email Body */}
                {isExpanded && (
                  <div className="px-3 pb-5">
                    {/* Email details */}
                    <div className="text-xs text-gray-600 mb-3 pl-11">
                      <div>To: {formatRecipients(email.to_addresses)}</div>
                      {email.cc_addresses && email.cc_addresses.length > 0 && (
                        <div>Cc: {formatRecipients(email.cc_addresses)}</div>
                      )}
                    </div>

                    {/* Body */}
                    {/* Safety net for emails stored before quoted-printable was
                        decoded at sync time (server normalizes new/re-synced ones).
                        maybeDecodeQuotedPrintable is a no-op on clean content. */}
                    {/* pl-11 keeps the left edge aligned under the sender info;
                        pr-14 pulls the right edge inward (~56px) so the white
                        canvas has balanced grey breathing room, per design. */}
                    <div className="pl-11 pr-14">
                      {(() => {
                        // Show ONLY this message's own content — strip the quoted
                        // previous conversation. The thread history is available in
                        // the other (collapsed) bubbles above. A "• • •" toggle
                        // reveals the trimmed quote inline if needed.
                        const rawHtml = email.body_html ? repairUtf8Mojibake(maybeDecodeQuotedPrintable(email.body_html)) : email.body_html
                        const rawText = email.body_text ? repairUtf8Mojibake(maybeDecodeQuotedPrintable(email.body_text)) : email.body_text
                        const stripped = rawHtml
                          ? stripQuotedContent(rawHtml)
                          : (rawText ? stripQuotedContentText(rawText) : '')
                        const hasRealContent = !!stripped && stripped.trim().length > 5
                        const showQuoted = showQuotedIds.has(email.id)

                        const quoteToggle = (trimmed: boolean) => trimmed ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleQuoted(email.id) }}
                            className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/[0.04] hover:bg-black/[0.07] border border-black/[0.08] text-gray-600 hover:text-gray-900 text-xs transition-colors"
                            title={showQuoted ? 'Hide trimmed content' : 'Show trimmed content'}
                          >
                            {showQuoted ? 'Hide trimmed content' : '• • •'}
                          </button>
                        ) : null

                        if (hasRealContent && rawHtml) {
                          const trimmed = rawHtml.trim().length - stripped.trim().length > 20
                          return (
                            <>
                              <div style={EMAIL_SHEET_STYLE}>
                                <EmailBodyFrame
                                  html={showQuoted ? (rawHtml || '') : stripped}
                                  attachments={email.attachments}
                                />
                              </div>
                              {quoteToggle(trimmed)}
                            </>
                          )
                        }
                        if (hasRealContent) {
                          const trimmed = (rawText || '').trim().length - stripped.trim().length > 20
                          return (
                            <>
                              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans p-4 m-0" style={EMAIL_SHEET_STYLE}>
                                {showQuoted ? rawText : stripped}
                              </pre>
                              {quoteToggle(trimmed)}
                            </>
                          )
                        }
                        // Fallback (e.g. reply with no new text): show the original.
                        return rawHtml ? (
                          <div style={EMAIL_SHEET_STYLE}>
                            <EmailBodyFrame
                              html={rawHtml || ''}
                              attachments={email.attachments}
                            />
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans p-4 m-0" style={EMAIL_SHEET_STYLE}>
                            {rawText}
                          </pre>
                        )
                      })()}

                      {/* Attachments */}
                      {(() => {
                        // Inline (cid:) images are rendered in the body by
                        // EmailBodyFrame, so hide them from the download chips.
                        const visibleAtts = (email.attachments || []).filter(
                          (a) => !(a.is_inline && a.content_id && (a.content_type || '').toLowerCase().startsWith('image/'))
                        )
                        return visibleAtts.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-black/10">
                          <div className="flex flex-wrap gap-2">
                            {visibleAtts.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.public_url || attachment.storage_path || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-2 py-1.5 bg-black/[0.04] border border-black/[0.06] rounded hover:bg-black/[0.07] transition-colors"
                              >
                                <Paperclip className="w-3 h-3 text-gray-500" />
                                <span className="text-xs text-gray-800 truncate max-w-[100px]">
                                  {attachment.filename}
                                </span>
                                <Download className="w-3 h-3 text-gray-500" />
                              </a>
                            ))}
                          </div>
                        </div>
                        )
                      })()}

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReply(email) }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.05] hover:bg-black/[0.1] border border-black/[0.08] rounded text-xs text-gray-700 hover:text-gray-900 transition-colors"
                        >
                          <Reply className="w-3 h-3" />
                          Reply
                        </button>
                        {hasMultipleRecipients(email) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReplyAll(email) }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.05] hover:bg-black/[0.1] border border-black/[0.08] rounded text-xs text-gray-700 hover:text-gray-900 transition-colors"
                          >
                            <ReplyAll className="w-3 h-3" />
                            Reply All
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleForward(email) }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.05] hover:bg-black/[0.1] border border-black/[0.08] rounded text-xs text-gray-700 hover:text-gray-900 transition-colors"
                        >
                          <Forward className="w-3 h-3" />
                          Forward
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
