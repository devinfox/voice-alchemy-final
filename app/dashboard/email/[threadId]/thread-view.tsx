'use client'

import { useState, memo, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
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
  CheckSquare,
  RefreshCw,
  Video,
  MapPin,
  CalendarClock,
  ExternalLink,
} from 'lucide-react'
import { meetingProviderLabel } from '@/lib/calendar/meeting-links'
import type { EmailInvite } from '@/lib/calendar/sync-email-invites'
import { LabelPicker } from '../components/label-picker'
import { ThreadStatePicker } from '../components/thread-state-picker'
import { SnoozePicker } from '../components/snooze-picker'
import { CrmLinkPicker } from '../components/crm-link-picker'
import { AiSummaryCard } from '../components/ai-summary-card'
import { CreateTaskModal } from '../components/create-task-modal'
import { EmailThread, Email, EmailAccount, EmailAttachment } from '@/types/email.types'
import { formatEmailDate, formatEmailDateFull, stripQuotedContent, stripQuotedContentText, stripHtml, getQuotableMessageBody } from '@/lib/email-utils'
import { EmailBodyFrame } from '../components/email-body-frame'
import { maybeDecodeQuotedPrintable } from '@/lib/quoted-printable'
import { repairUtf8Mojibake } from '@/lib/mojibake'
import { EmailCompose } from '../components/email-compose'
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

// Compact label for a busy recipient list: "alice@x.com and 3 others".
// Returns overflow > 0 when the list was condensed so callers can offer a toggle.
function compactRecipients(recipients: any): { text: string; overflow: number } {
  if (!recipients) return { text: '', overflow: 0 }
  const arr = Array.isArray(recipients) ? recipients : [recipients]
  if (arr.length <= 2) return { text: arr.map(formatRecipient).join(', '), overflow: 0 }
  return { text: `${formatRecipient(arr[0])} and ${arr.length - 1} others`, overflow: arr.length - 1 }
}

// Extract the bare email address (lowercased) from a recipient (string or {email})
function extractEmail(recipient: any): string {
  if (!recipient) return ''
  if (typeof recipient === 'string') {
    const match = recipient.match(/<([^>]+)>/)
    return (match ? match[1] : recipient).trim().toLowerCase()
  }
  if (recipient.email) return String(recipient.email).trim().toLowerCase()
  return ''
}

// Build the To/Cc lists for a "Reply All" to the given email, excluding our own
// account address and any duplicates.
function buildReplyAllRecipients(
  email: Email,
  ownAddress: string | null | undefined
): { to: string[]; cc: string[] } {
  const own = (ownAddress || '').trim().toLowerCase()
  const seen = new Set<string>()
  if (own) seen.add(own)

  const to: string[] = []
  const cc: string[] = []

  const addTo = (recipient: any) => {
    const addr = extractEmail(recipient)
    if (!addr || seen.has(addr)) return
    seen.add(addr)
    to.push(formatRecipient(recipient))
  }
  const addCc = (recipient: any) => {
    const addr = extractEmail(recipient)
    if (!addr || seen.has(addr)) return
    seen.add(addr)
    cc.push(formatRecipient(recipient))
  }

  if (email.is_inbound) {
    // Reply to the original sender; everyone else (other To + Cc) goes to Cc.
    addTo(email.from_address)
    ;(email.to_addresses || []).forEach(addCc)
  } else {
    // We sent it — reply to the original recipients.
    ;(email.to_addresses || []).forEach(addTo)
  }
  ;(email.cc_addresses || []).forEach(addCc)

  return { to, cc }
}

interface ThreadViewProps {
  thread: EmailThread & { email_account: Pick<EmailAccount, 'id' | 'email_address' | 'display_name' | 'user_id'> | null }
  emails: (Email & { attachments: EmailAttachment[] })[]
  accounts: EmailAccount[]
  // Calendar invites parsed from this thread's emails, keyed by source email id.
  invitesByEmail?: Record<string, EmailInvite>
}

// Calendar-invite files are machine payloads, not documents — once parsed onto
// the calendar they shouldn't appear as raw download chips. Empty parts (e.g. a
// 0-byte ".bin" alongside the real ".calendar") are noise and hidden too.
function isCalendarAttachment(att: EmailAttachment): boolean {
  const type = (att.content_type || '').toLowerCase()
  const name = (att.filename || '').toLowerCase()
  if (type.includes('text/calendar') || type.includes('application/ics')) return true
  return /\.(ics|ical|ifb|vcs|calendar)$/i.test(name)
}

// Inline images (cid:) are embedded and rendered inside the message body by
// EmailBodyFrame, so they should not also appear as redundant download chips.
function isInlineEmbeddedImage(att: EmailAttachment): boolean {
  const type = (att.content_type || '').toLowerCase()
  return !!att.is_inline && !!att.content_id && type.startsWith('image/')
}

function isDisplayableAttachment(att: EmailAttachment): boolean {
  if ((att.size_bytes ?? 0) <= 0) return false
  if (isCalendarAttachment(att)) return false
  if (isInlineEmbeddedImage(att)) return false
  return true
}

// Format an invite's date and time range in the viewer's local timezone.
function formatInviteWhen(invite: EmailInvite): { dateLine: string; timeLine: string } {
  if (!invite.startUtc) return { dateLine: '', timeLine: '' }
  const start = new Date(invite.startUtc)
  if (isNaN(start.getTime())) return { dateLine: '', timeLine: '' }

  const dateLine = start.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  if (invite.isAllDay) return { dateLine, timeLine: 'All day' }

  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  let timeLine = startTime
  if (invite.endUtc) {
    const end = new Date(invite.endUtc)
    if (!isNaN(end.getTime())) {
      const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      timeLine = `${startTime} – ${endTime}`
    }
  }
  // Append the local timezone abbreviation so the time is unambiguous.
  const tzAbbr = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(start)
    .find((p) => p.type === 'timeZoneName')?.value
  return { dateLine, timeLine: tzAbbr ? `${timeLine} ${tzAbbr}` : timeLine }
}

// Memoized email item component to prevent unnecessary re-renders
interface EmailItemProps {
  email: Email & { attachments: EmailAttachment[] }
  isExpanded: boolean
  isOutbound: boolean
  hasOtherRecipients: boolean
  invite?: EmailInvite | null
  onToggle: () => void
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
}

const EmailItem = memo(function EmailItem({
  email,
  isExpanded,
  isOutbound,
  hasOtherRecipients,
  invite,
  onToggle,
  onReply,
  onReplyAll,
  onForward,
}: EmailItemProps) {
  const displayName = isOutbound
    ? email.from_name || email.from_address
    : email.from_name || email.from_address.split('@')[0]

  // Unread inbound mail gets a clear visual emphasis so it stands out at a glance.
  const isUnread = email.is_inbound && email.is_read === false
  // Toggles for revealing trimmed quoted history and the full recipient list.
  const [showQuoted, setShowQuoted] = useState(false)
  const [showAllRecipients, setShowAllRecipients] = useState(false)

  // Hide calendar-invite files and empty parts from the download list; the
  // invite itself is surfaced as a meeting card below.
  const displayAttachments = (email.attachments || []).filter(isDisplayableAttachment)

  return (
    <div
      className={`relative group rounded-2xl overflow-hidden transition-colors duration-150 ${
        isExpanded
          ? 'bg-white/[0.04] border border-white/[0.08] shadow-2xl shadow-black/20'
          : isUnread
            ? 'bg-white/[0.055] border border-white/[0.12] hover:bg-white/[0.08]'
            : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]'
      }`}
      style={{
        boxShadow: isExpanded
          ? '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : undefined
      }}
    >
      {/* Subtle gold accent glow for expanded emails */}
      {isExpanded && (
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-yellow-500/5 via-transparent to-transparent pointer-events-none" />
      )}

      {/* Direction accent bar: gold = sent by us, blue = received. Lets the eye
          track who-said-what without reading every header. */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none ${
          isOutbound
            ? 'bg-gradient-to-b from-yellow-500/60 to-yellow-600/30'
            : 'bg-gradient-to-b from-blue-500/60 to-blue-600/30'
        }`}
      />

      {/* Email Header */}
      <div
        className={`relative flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors duration-150 ${
          isExpanded ? 'border-b border-white/[0.06]' : ''
        }`}
        onClick={onToggle}
      >
        {/* Avatar with premium styling */}
        <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isOutbound
            ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/20'
            : 'bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20'
        }`}>
          <span className={`text-sm font-semibold ${isOutbound ? 'text-yellow-400' : 'text-blue-400'}`}>
            {(displayName || 'U')[0].toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Unread indicator */}
              {isUnread && (
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]" title="Unread" />
              )}
              <span className={`tracking-tight truncate ${isUnread ? 'font-bold text-white' : 'font-semibold text-white'}`}>
                {displayName}
              </span>
              {/* "You" pill on messages we sent, so the conversation direction reads instantly */}
              {isOutbound && (
                <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-400/90 text-[10px] font-semibold uppercase tracking-wider">
                  You
                </span>
              )}
              {isOutbound && (
                <span className="text-xs text-gray-500 flex-shrink-0 truncate">
                  <span className="text-gray-600">→</span> {formatRecipient(email.to_addresses?.[0])}
                </span>
              )}
            </div>
            <span
              className={`text-xs tabular-nums flex-shrink-0 font-medium ${isUnread ? 'text-gray-300' : 'text-gray-500'}`}
              title={formatEmailDateFull(email.sent_at || email.created_at)}
            >
              {formatEmailDate(email.sent_at || email.created_at)}
            </span>
          </div>

          {!isExpanded && (
            <p className={`text-sm truncate mt-1 leading-relaxed ${isUnread ? 'text-gray-300' : 'text-gray-400/80'}`}>
              {email.snippet ? stripHtml(email.snippet) : '(no content)'}
            </p>
          )}
        </div>

        <button className="text-gray-500 hover:text-gray-300 transition-colors p-1">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Email Body */}
      {isExpanded && (
        <div className="relative px-5 pb-5 pt-2">
          {/* Email metadata - editorial style. Long recipient lists collapse to
              "X and N others" with a toggle to keep the header scannable. */}
          {(() => {
            const toCompact = compactRecipients(email.to_addresses)
            const hasCc = !!(email.cc_addresses && email.cc_addresses.length > 0)
            const ccCompact = hasCc ? compactRecipients(email.cc_addresses) : { text: '', overflow: 0 }
            const hasOverflow = toCompact.overflow > 0 || ccCompact.overflow > 0
            return (
              <div className="mb-5 pl-[60px]">
                <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-600 uppercase tracking-wider text-[10px] font-medium">From</span>
                    <span className="text-gray-400">{email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}</span>
                  </span>
                  <span className="text-gray-700">•</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-600 uppercase tracking-wider text-[10px] font-medium">To</span>
                    <span className="text-gray-400">{showAllRecipients ? formatRecipients(email.to_addresses) : toCompact.text}</span>
                  </span>
                  {hasCc && (
                    <>
                      <span className="text-gray-700">•</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-gray-600 uppercase tracking-wider text-[10px] font-medium">Cc</span>
                        <span className="text-gray-400">{showAllRecipients ? formatRecipients(email.cc_addresses) : ccCompact.text}</span>
                      </span>
                    </>
                  )}
                  {hasOverflow && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAllRecipients(v => !v) }}
                      className="text-yellow-500/70 hover:text-yellow-400 text-[11px] font-medium transition-colors"
                    >
                      {showAllRecipients ? 'Show less' : 'Show all'}
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Body - Premium floating document style */}
          <div className="pl-[60px]">
            <div className="relative">
              {/* Email content container - dark mode */}
              <div className="relative rounded-xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
                {/* Top accent line */}
                <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />

                {(() => {
                  // Decode quoted-printable for emails stored before it was
                  // decoded at sync time. No-op on already-clean content.
                  const rawHtml = email.body_html ? repairUtf8Mojibake(maybeDecodeQuotedPrintable(email.body_html)) : email.body_html
                  const rawText = email.body_text ? repairUtf8Mojibake(maybeDecodeQuotedPrintable(email.body_text)) : email.body_text
                  const stripped = rawHtml
                    ? stripQuotedContent(rawHtml)
                    : (rawText ? stripQuotedContentText(rawText) : '')
                  const hasRealContent = stripped && stripped.trim().length > 5

                  if (hasRealContent) {
                    if (rawHtml) {
                      const wasTrimmed = rawHtml.trim().length - stripped.trim().length > 20
                      const htmlToShow = showQuoted ? rawHtml : stripped
                      return (
                        <>
                          <EmailBodyFrame
                            html={htmlToShow}
                            attachments={email.attachments}
                          />
                          {wasTrimmed && (
                            <div className="px-6 pb-4 -mt-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowQuoted(v => !v) }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-gray-400 hover:text-gray-200 text-xs transition-colors"
                                title={showQuoted ? 'Hide trimmed content' : 'Show trimmed content'}
                              >
                                {showQuoted ? 'Hide trimmed content' : '• • •'}
                              </button>
                            </div>
                          )}
                        </>
                      )
                    }
                    const wasTrimmedText = (rawText || '').trim().length - stripped.trim().length > 20
                    const textToShow = showQuoted ? rawText : stripped
                    return (
                      <>
                        <pre className="whitespace-pre-wrap text-[15px] text-gray-200 font-sans px-6 py-5 leading-7">
                          {textToShow}
                        </pre>
                        {wasTrimmedText && (
                          <div className="px-6 pb-4 -mt-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowQuoted(v => !v) }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-gray-400 hover:text-gray-200 text-xs transition-colors"
                              title={showQuoted ? 'Hide trimmed content' : 'Show trimmed content'}
                            >
                              {showQuoted ? 'Hide trimmed content' : '• • •'}
                            </button>
                          </div>
                        )}
                      </>
                    )
                  }

                  // FALLBACK for SendGrid inbound or over-stripped replies: try original first
                  const originalToTry = rawHtml || rawText
                  if (originalToTry) {
                    if (rawHtml) {
                      return (
                        <EmailBodyFrame
                          html={rawHtml}
                          attachments={email.attachments}
                        />
                      )
                    }
                    return (
                      <pre className="whitespace-pre-wrap text-[15px] text-gray-200 font-sans px-6 py-5 leading-7">
                        {rawText}
                      </pre>
                    )
                  }

                  return (
                    <div className="p-6">
                      <div className="text-sm text-gray-400 italic mb-3">
                        {email.snippet ? stripHtml(email.snippet) : 'No message body was stored for this email.'}
                      </div>
                      {(email as any).graph_message_id && ((email as any).email_provider === 'microsoft' || (email as any).email_provider === 'gmail') && (
                        <HydrateButton emailId={email.id} />
                      )}
                      <div className="mt-2 text-[10px] text-gray-500">
                        (SendGrid inbound or stripped content: showing captured snippet.)
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Calendar invite — rendered like an invite card (Gmail/Outlook style) */}
            {invite && invite.startUtc && (() => {
              const { dateLine, timeLine } = formatInviteWhen(invite)
              const isCancelled = invite.method === 'CANCEL' || invite.status === 'CANCELLED'
              const start = new Date(invite.startUtc)
              const monthAbbr = isNaN(start.getTime())
                ? ''
                : start.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
              const dayNum = isNaN(start.getTime()) ? '' : start.toLocaleDateString(undefined, { day: 'numeric' })
              return (
                <div className="mt-6 pt-5 border-t border-white/[0.06]">
                  <div className={`rounded-xl overflow-hidden border ${
                    isCancelled ? 'border-red-500/25 bg-red-500/[0.04]' : 'border-blue-500/25 bg-blue-500/[0.05]'
                  }`}>
                    {/* Header strip */}
                    <div className={`flex items-center gap-2 px-4 py-2 border-b ${
                      isCancelled ? 'border-red-500/20 bg-red-500/[0.06]' : 'border-blue-500/20 bg-blue-500/[0.08]'
                    }`}>
                      <CalendarClock className={`w-3.5 h-3.5 ${isCancelled ? 'text-red-400' : 'text-blue-400'}`} />
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                        isCancelled ? 'text-red-400' : 'text-blue-300'
                      }`}>
                        {isCancelled ? 'Meeting cancelled' : 'Calendar invite'}
                      </span>
                    </div>

                    <div className="p-4 flex items-start gap-4">
                      {/* Date tile */}
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-white/[0.04] border border-white/[0.08] flex-shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{monthAbbr}</span>
                        <span className="text-xl font-bold text-white leading-none mt-0.5">{dayNum}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`text-base font-semibold text-white truncate ${isCancelled ? 'line-through opacity-70' : ''}`}>
                          {invite.summary || 'Meeting'}
                        </p>
                        <p className="text-sm text-gray-300 mt-0.5">{dateLine}</p>
                        {timeLine && <p className="text-sm text-gray-400 tabular-nums">{timeLine}</p>}

                        {invite.location && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{invite.location}</span>
                          </div>
                        )}
                        {invite.organizerName || invite.organizerEmail ? (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1.5">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {invite.organizerName || invite.organizerEmail}
                              {(invite.attendeeCount ?? 0) > 0 && ` · ${invite.attendeeCount} guest${(invite.attendeeCount ?? 0) > 1 ? 's' : ''}`}
                            </span>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {invite.meetingUrl && !isCancelled && (
                            <a
                              href={invite.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-200 hover:bg-blue-500/30 transition-colors text-xs font-semibold"
                            >
                              <Video className="w-3.5 h-3.5" />
                              Join {meetingProviderLabel(invite.meetingProvider || '')}
                            </a>
                          )}
                          <Link
                            href="/dashboard/calendar"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.08] transition-colors text-xs font-medium"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View on calendar
                          </Link>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2.5">
                          {isCancelled ? 'Removed from your calendar.' : 'Added to your calendar.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Attachments */}
            {displayAttachments.length > 0 && (
              <div className="mt-6 pt-5 border-t border-white/[0.06]">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-medium">
                  {displayAttachments.length} attachment{displayAttachments.length > 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {displayAttachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.public_url || attachment.storage_path || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/attach flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] transition-colors duration-150"
                    >
                      <Paperclip className="w-4 h-4 text-gray-500 group-hover/attach:text-yellow-500/80 transition-colors" />
                      <span className="text-sm text-gray-300 truncate max-w-[160px] font-medium">
                        {attachment.filename}
                      </span>
                      <span className="text-xs text-gray-600 tabular-nums">
                        {((attachment.size_bytes || 0) / 1024).toFixed(0)}KB
                      </span>
                      <Download className="w-4 h-4 text-gray-600 group-hover/attach:text-gray-400 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Actions - Premium floating buttons */}
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onReply() }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500/10 to-yellow-600/5 border border-yellow-500/20 text-yellow-400 hover:from-yellow-500/15 hover:to-yellow-600/10 hover:border-yellow-500/30 transition-colors duration-150 text-sm font-medium shadow-lg shadow-yellow-500/5"
              >
                <Reply className="w-4 h-4" />
                Reply
              </button>
              {hasOtherRecipients && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReplyAll() }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-gray-400 hover:bg-white/[0.06] hover:text-gray-300 hover:border-white/[0.12] transition-colors duration-150 text-sm font-medium"
                >
                  <ReplyAll className="w-4 h-4" />
                  Reply All
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onForward() }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-gray-400 hover:bg-white/[0.06] hover:text-gray-300 hover:border-white/[0.12] transition-colors duration-150 text-sm font-medium"
              >
                <Forward className="w-4 h-4" />
                Forward
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// Local hydrate button (duplicated for the dedicated thread page; keeps diff small)
function HydrateButton({ emailId }: { emailId: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  const handleHydrate = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/email/hydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId }),
      })
      if (res.ok) {
        setDone(true)
        router.refresh()
      } else {
        const j = await res.json().catch(() => ({}))
        alert('Could not fetch full content: ' + (j.error || res.statusText))
      }
    } catch (e: any) {
      alert('Hydrate failed: ' + (e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  if (done) return <span className="text-xs text-green-400">Content loaded — refreshing…</span>

  return (
    <button
      onClick={handleHydrate}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-gray-300 hover:text-white disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Fetching full message…' : 'Fetch full content from server'}
    </button>
  )
}

export function ThreadView({ thread, emails, accounts, invitesByEmail }: ThreadViewProps) {
  const router = useRouter()
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(
    new Set(emails.length > 0 ? [emails[emails.length - 1].id] : [])
  )
  const [showReply, setShowReply] = useState(false)
  const [showForward, setShowForward] = useState(false)
  const [replyAll, setReplyAll] = useState(false)
  const [replyToEmail, setReplyToEmail] = useState<Email | null>(null)

  const ownAddress = thread.email_account?.email_address
  const [loading, setLoading] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)

  // Get the latest email for task creation context
  const latestEmail = emails[emails.length - 1]

  const toggleExpanded = useCallback((emailId: string) => {
    setExpandedEmails(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(emailId)) {
        newExpanded.delete(emailId)
      } else {
        newExpanded.add(emailId)
      }
      return newExpanded
    })
  }, [])

  const toggleStar = async () => {
    setLoading(true)
    const newStarredState = !thread.is_starred
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ is_starred: newStarredState })
      .eq('id', thread.id)
    // Dispatch event to update sidebar counts
    window.dispatchEvent(new CustomEvent('email-starred-changed', {
      detail: { threadId: thread.id, isStarred: newStarredState }
    }))
    router.refresh()
    setLoading(false)
  }

  const moveToTrash = async () => {
    if (!confirm('Move this conversation to trash?')) return
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'trash', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    router.push('/dashboard/email')
  }

  const permanentlyDelete = async () => {
    if (!confirm('Permanently delete this conversation? This cannot be undone.')) return
    setLoading(true)
    try {
      const response = await fetch(`/api/email/threads/${thread.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to delete thread')
      }
      router.push('/dashboard/email/trash')
    } catch (error) {
      console.error('Error permanently deleting thread:', error)
      alert('Failed to delete. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isTrash = thread.folder === 'trash'
  const isArchive = thread.folder === 'archive'

  const archiveThread = async () => {
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'archive', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    router.push('/dashboard/email')
  }

  const unarchiveThread = async () => {
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'inbox', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    router.push('/dashboard/email/archive')
  }

  const markUnread = async () => {
    const supabase = createClient()
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
    router.push('/dashboard/email')
  }

  const handleReply = useCallback((email: Email) => {
    setReplyToEmail(email)
    setReplyAll(false)
    setShowReply(true)
    setShowForward(false)
  }, [])

  const handleReplyAll = useCallback((email: Email) => {
    setReplyToEmail(email)
    setReplyAll(true)
    setShowReply(true)
    setShowForward(false)
  }, [])

  const handleForward = useCallback((email: Email) => {
    setReplyToEmail(email)
    setReplyAll(false)
    setShowForward(true)
    setShowReply(false)
  }, [])

  const closeCompose = () => {
    setShowReply(false)
    setShowForward(false)
    setReplyAll(false)
    setReplyToEmail(null)
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-black/20 to-transparent">
      {/* Header - Premium floating bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.06] backdrop-blur-xl">
        <Link
          href="/dashboard/email"
          className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-gray-400 hover:text-white transition-all duration-200 hover:scale-105"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <h1 className="flex-1 text-xl font-semibold text-white truncate tracking-tight">
          {thread.subject || '(no subject)'}
        </h1>

        <div className="flex items-center gap-1.5">
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

          {/* CRM Link */}
          <CrmLinkPicker
            threadId={thread.id}
            currentContactId={(thread as any).contact_id}
            currentLeadId={(thread as any).lead_id}
            currentDealId={(thread as any).deal_id}
          />

          {/* Create Task */}
          <button
            onClick={() => setShowCreateTask(true)}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-400 hover:text-white transition-colors duration-150"
            title="Create Task"
          >
            <CheckSquare className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-white/[0.08] mx-2" />

          <button
            onClick={toggleStar}
            disabled={loading}
            className={`p-2 rounded-xl transition-colors duration-150 ${
              thread.is_starred
                ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                : 'bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:border-white/[0.08] hover:text-yellow-400'
            }`}
          >
            <Star className={`w-5 h-5 ${thread.is_starred ? 'fill-yellow-400' : ''}`} />
          </button>
          <button
            onClick={markUnread}
            className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:border-white/[0.08] hover:text-white transition-colors duration-150"
            title="Mark as unread"
          >
            <Mail className="w-5 h-5" />
          </button>
          {isArchive ? (
            <button
              onClick={unarchiveThread}
              className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:border-white/[0.08] hover:text-white transition-colors duration-150"
              title="Unarchive"
            >
              <ArchiveRestore className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={archiveThread}
              className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:border-white/[0.08] hover:text-white transition-colors duration-150"
              title="Archive"
            >
              <Archive className="w-5 h-5" />
            </button>
          )}
          {isTrash ? (
            <button
              onClick={permanentlyDelete}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 text-red-400 transition-colors duration-150 disabled:opacity-50"
              title="Permanently Delete"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-medium">Delete Forever</span>
            </button>
          ) : (
            <button
              onClick={moveToTrash}
              className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-colors duration-150"
              title="Delete"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Emails - Premium content area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* AI Summary Card */}
          <AiSummaryCard
            threadId={thread.id}
            summary={(thread as any).ai_summary}
            sentiment={(thread as any).ai_sentiment}
            actionItems={(thread as any).ai_action_items}
            onRefresh={() => router.refresh()}
          />

          {emails.map((email) => (
            <EmailItem
              key={email.id}
              email={email}
              isExpanded={expandedEmails.has(email.id)}
              isOutbound={!email.is_inbound}
              invite={invitesByEmail?.[email.id] || null}
              hasOtherRecipients={(() => {
                const { to, cc } = buildReplyAllRecipients(email, ownAddress)
                return to.length + cc.length > 1
              })()}
              onToggle={() => toggleExpanded(email.id)}
              onReply={() => handleReply(email)}
              onReplyAll={() => handleReplyAll(email)}
              onForward={() => handleForward(email)}
            />
          ))}

          {/* Quick Reply - Premium CTA */}
          {!showReply && !showForward && emails.length > 0 && (
            <button
              onClick={() => handleReply(emails[emails.length - 1])}
              className="group relative w-full flex items-center justify-center gap-3 px-8 py-5 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.01]"
            >
              {/* Background layers */}
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-yellow-500/5 to-yellow-600/10 border border-yellow-500/20 rounded-2xl" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Gold glow on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-yellow-400/10 to-yellow-500/5 rounded-2xl blur-xl" />
              </div>

              <Reply className="relative w-5 h-5 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
              <span className="relative text-white font-semibold tracking-tight group-hover:text-yellow-50 transition-colors">Reply to latest message</span>
            </button>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {(showReply || showForward) && replyToEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <EmailCompose
            accounts={accounts.filter((a: any) => a.provider === 'microsoft' || a.provider === 'gmail' || a.domain?.verification_status === 'verified')}
            defaultAccountId={thread.email_account_id}
            replyTo={showReply ? {
              email_id: replyToEmail.id,
              thread_id: thread.id,
              to: replyAll
                ? buildReplyAllRecipients(replyToEmail, ownAddress).to
                : (!replyToEmail.is_inbound
                    ? formatRecipient(replyToEmail.to_addresses?.[0])
                    : replyToEmail.from_address),
              cc: replyAll
                ? buildReplyAllRecipients(replyToEmail, ownAddress).cc
                : undefined,
              subject: `Re: ${thread.subject || ''}`,
              body: `<br><br><div style="border-left: 2px solid #444; padding-left: 10px; margin-left: 0; color: #888;">On ${formatEmailDateFull(replyToEmail.sent_at || replyToEmail.created_at)}, ${replyToEmail.from_name || replyToEmail.from_address} wrote:<br><br>${getQuotableMessageBody(replyToEmail.body_html, replyToEmail.body_text)}</div>`,
            } : undefined}
            forward={showForward ? {
              email_id: replyToEmail.id,
              subject: `Fwd: ${thread.subject || ''}`,
              body: `<br><br>---------- Forwarded message ---------<br>From: ${replyToEmail.from_name || replyToEmail.from_address}<br>Date: ${formatEmailDateFull(replyToEmail.sent_at || replyToEmail.created_at)}<br>Subject: ${thread.subject || ''}<br>To: ${formatRecipients(replyToEmail.to_addresses)}<br><br>${getQuotableMessageBody(replyToEmail.body_html, replyToEmail.body_text)}`,
              attachments: emails.find(e => e.id === replyToEmail.id)?.attachments || [],
            } : undefined}
            onClose={closeCompose}
            isFullscreen
          />
        </div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        threadId={thread.id}
        emailId={latestEmail?.id}
        subject={thread.subject || undefined}
        fromEmail={latestEmail?.from_address}
        snippet={latestEmail?.snippet || undefined}
      />
    </div>
  )
}
