'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X,
  ArrowLeft,
  Minimize2,
  Maximize2,
  Paperclip,
  Send,
  Trash2,
  ChevronDown,
  Clock,
  FolderOpen,
  Sparkles,
  Loader2,
  FileText,
  Table2,
  Presentation as PresentationIcon,
  Check,
  HardDrive,
  Upload,
} from 'lucide-react'
import { RichTextEditor, RichTextEditorRef } from '@/components/email/rich-text-editor'
import { EmailAccount, EmailAttachment } from '@/types/email.types'
import { loadForwardAttachments } from '@/lib/email/forward-attachments'
import { useRouter } from 'next/navigation'
import { useDocuments } from '@/lib/document-context'
import { useNimbus } from '@/components/nimbus'
import { useDraftAutosave } from '@/lib/hooks/use-draft-autosave'
import { createClient } from '@/lib/supabase'
import { generateSignatureHtml } from '@/lib/email-signature'

interface EmailComposeProps {
  accounts: EmailAccount[]
  defaultAccountId?: string
  replyTo?: {
    email_id: string
    thread_id: string
    to: string | string[]
    cc?: string[]
    subject: string
    body?: string
  }
  forward?: {
    email_id: string
    subject: string
    body?: string
    attachments?: EmailAttachment[]
  }
  draftId?: string // Load from AI-generated draft (`email_drafts`)
  resumeDraftId?: string // Reopen a saved composer draft (`user_email_drafts`)
  onClose: () => void
  onMinimize?: () => void
  onBack?: () => void // Render a "Back to Inbox" link inside the header row
  isMinimized?: boolean
  isFullscreen?: boolean
  isInline?: boolean // Render inline within parent container (not as modal)
  maxWidthClassName?: string // Override the default max width (non-inline/non-fullscreen)
  fillHeight?: boolean // Stretch to fill the parent's height so the editor grows
  onToggleFullscreen?: () => void
}

interface ByeTalkListItem {
  kind: 'document' | 'sheet' | 'presentation' | 'project_file'
  id: string
  name: string
  updated_at: string
}

interface DriveLink {
  fileId: string
  filename: string
  fileSize: string
  shareToken: string
  shareUrl: string
}

interface PendingLargeFile {
  file: File
  isUploading: boolean
}

// The compose editor (TipTap) emits bare `<p>` tags and relies on the app's
// own stylesheet for paragraph spacing. That CSS never travels with the sent
// email, so recipient clients (Gmail/Outlook) apply their own `<p>` margins —
// often zero — and paragraphs collapse into one hard-to-read block. Inline the
// spacing directly on each paragraph so it ships with the message and renders
// the same for the recipient as it does in our composer/preview.
function inlineEmailBodySpacing(html: string): string {
  if (!html) return html
  let out = html.replace(/<p(\s[^>]*)?>/gi, (match, attrs = '') => {
    // Merge our margin into an existing style attribute so we don't clobber
    // things like text-align that TipTap may have set.
    if (/\bstyle\s*=/i.test(attrs)) {
      return match.replace(/style\s*=\s*"([^"]*)"/i, (_m, s) => `style="margin:0 0 1em 0;${s}"`)
    }
    return `<p${attrs} style="margin:0 0 1em 0">`
  })
  // Empty paragraphs (blank lines the user typed) have no content, so a styled
  // `<p></p>` still collapses to zero height in most clients. Give them a <br>
  // so the intended blank line survives.
  out = out.replace(/(<p[^>]*>)\s*<\/p>/gi, '$1<br></p>')
  return out
}

// The shared info@voicealchemyacademy.com mailbox signature options
const INFO_ACCOUNT_EMAIL = 'info@voicealchemyacademy.com'
const INFO_SIGNATURE_EMAIL = 'info@voicealchemyacademy.com'
const INFO_SIGNATURE_OPTIONS: { label: string; name: string; title: string; phone: string }[] = [
  { label: 'Academy Support', name: 'Voice Alchemy Support', title: 'Student Support', phone: '818.209.2305' },
  { label: 'Admissions', name: 'Voice Alchemy Admissions', title: 'Admissions Team', phone: '818.209.2305' },
  { label: 'Julia', name: 'Julia', title: 'Master Vocal Coach', phone: '' },
]

export function EmailCompose({
  accounts,
  defaultAccountId,
  replyTo,
  forward,
  draftId,
  resumeDraftId,
  onClose,
  onMinimize,
  onBack,
  isMinimized = false,
  isFullscreen = false,
  isInline = false,
  maxWidthClassName = 'max-w-2xl',
  fillHeight = false,
  onToggleFullscreen,
}: EmailComposeProps) {
  const router = useRouter()
  const { pendingAttachments, clearPendingAttachments, openPanel } = useDocuments()
  const { showNimbus } = useNimbus()
  const [fromAccountId, setFromAccountId] = useState(
    defaultAccountId || accounts.find(a => a.is_primary)?.id || accounts[0]?.id || ''
  )
  const [to, setTo] = useState<string[]>(
    replyTo ? (Array.isArray(replyTo.to) ? replyTo.to : [replyTo.to]) : []
  )
  const [toInput, setToInput] = useState('')
  const [cc, setCc] = useState<string[]>(replyTo?.cc || [])
  const [ccInput, setCcInput] = useState('')
  const [bcc, setBcc] = useState<string[]>([])
  const [bccInput, setBccInput] = useState('')
  const [showCc, setShowCc] = useState(Boolean(replyTo?.cc?.length))
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(
    replyTo?.subject || forward?.subject || ''
  )
  const [body, setBody] = useState(replyTo?.body || forward?.body || '')
  const [attachments, setAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAiDraft, setIsAiDraft] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null)
  const [recipientName, setRecipientName] = useState<string | null>(null)
  const [showByeTalkPicker, setShowByeTalkPicker] = useState(false)
  const [byeTalkFiles, setByeTalkFiles] = useState<ByeTalkListItem[]>([])
  const [byeTalkSearch, setByeTalkSearch] = useState('')
  const [byeTalkLoading, setByeTalkLoading] = useState(false)
  const [selectedByeTalk, setSelectedByeTalk] = useState<Record<string, { item: ByeTalkListItem; format: 'xlsx' | 'csv' }>>({})
  const [attachingByeTalk, setAttachingByeTalk] = useState(false)
  const [driveLinks, setDriveLinks] = useState<DriveLink[]>([])
  const [pendingLargeFile, setPendingLargeFile] = useState<PendingLargeFile | null>(null)
  // Additional oversize files waiting their turn for the "upload to Drive" prompt,
  // so multiple overflow files are never silently dropped (one prompt at a time).
  const [largeFileQueue, setLargeFileQueue] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<RichTextEditorRef>(null)

  // Contact autocomplete state
  const [contactSuggestions, setContactSuggestions] = useState<Array<{ email: string; name: string | null }>>([])
  const [showSuggestions, setShowSuggestions] = useState<'to' | 'cc' | 'bcc' | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const suggestionsDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const toInputRef = useRef<HTMLInputElement>(null)
  const ccInputRef = useRef<HTMLInputElement>(null)
  const bccInputRef = useRef<HTMLInputElement>(null)

  const selectedAccount = accounts.find(a => a.id === fromAccountId)
  // The shared info@ mailbox gets a click-to-switch signature (see INFO_SIGNATURE_OPTIONS)
  const isInfoAccount = selectedAccount?.email_address?.toLowerCase() === INFO_ACCOUNT_EMAIL

  // Logged-in user's profile, used to fill in the standard signature
  const [repProfile, setRepProfile] = useState<{ name: string; phone: string; email: string; title: string } | null>(null)

  // Signature HTML - rendered separately below the editor, not inside TipTap
  const [signatureHtml, setSignatureHtml] = useState<string>('')

  // Which info@ signature preset is active (only used when isInfoAccount)
  const [infoSigIndex, setInfoSigIndex] = useState(0)
  const cycleInfoSignature = () => setInfoSigIndex(i => (i + 1) % INFO_SIGNATURE_OPTIONS.length)

  // Load the logged-in user's profile (name, phone, email, title) for the signature.
  // Mirrors how Quick Send pulls rep info from the `users` table.
  useEffect(() => {
    const loadRepProfile = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setRepProfile({ name: 'Voice Alchemy Coach', phone: '818.209.2305', email: '', title: 'Vocal Coach & Instructor' })
          return
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, role')
          .eq('id', user.id)
          .single()
        setRepProfile({
          name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Voice Alchemy Coach',
          phone: '818.209.2305',
          email: profile?.email || '',
          title: profile?.role === 'admin' ? 'Founder & Instructor' : 'Vocal Coach & Instructor',
        })
      } catch (err) {
        console.error('Failed to load rep profile for signature:', err)
        setRepProfile({ name: 'Voice Alchemy Coach', phone: '818.209.2305', email: '', title: 'Vocal Coach & Instructor' })
      }
    }
    loadRepProfile()
  }, [])

  // Generate signature HTML when profile loads (rendered below editor, not inside TipTap)
  // Uses generateSignatureHtml with same image URLs as quicksend (no trust badges/as seen on)
  useEffect(() => {
    if (!selectedAccount) return

    // Shared info@ mailbox: use the clicked preset instead of the rep's profile
    if (isInfoAccount) {
      const opt = INFO_SIGNATURE_OPTIONS[infoSigIndex] ?? INFO_SIGNATURE_OPTIONS[0]
      setSignatureHtml(generateSignatureHtml({
        name: opt.name,
        title: opt.title,
        phone: opt.phone,
        email: INFO_SIGNATURE_EMAIL,
        includeTrustBadges: false,
        includeAsSeenOn: false,
      }))
      return
    }

    if (!repProfile) return
    const sigEmail = repProfile.email || selectedAccount.email_address
    const signature = generateSignatureHtml({
      name: repProfile.name,
      title: repProfile.title,
      phone: repProfile.phone,
      email: sigEmail,
      includeTrustBadges: false,
      includeAsSeenOn: false,
    })
    setSignatureHtml(signature)
  }, [repProfile, selectedAccount, isInfoAccount, infoSigIndex])

  // User draft autosave (only for new emails, not AI drafts)
  const {
    draftId: userDraftId,
    isSaving: isAutosaving,
    lastSavedAt,
    saveStatus,
    saveDraft,
    deleteDraft,
  } = useDraftAutosave(resumeDraftId, {
    // Seeding with resumeDraftId makes edits update the reopened row instead of
    // saving a second copy alongside it.
    enabled: !draftId && !isAiDraft, // Only autosave user-composed emails
    debounceMs: 5000,
  })

  // Autosave when content changes
  useEffect(() => {
    // Skip autosave for AI drafts or if no content
    if (draftId || isAiDraft) return
    if (!to.length && !cc.length && !bcc.length && !subject && !body) return

    const composeMode = replyTo ? 'reply' : forward ? 'forward' : 'new'

    saveDraft({
      email_account_id: fromAccountId,
      thread_id: replyTo?.thread_id || null,
      reply_to_email_id: replyTo?.email_id || null,
      to_emails: to,
      cc_emails: cc,
      bcc_emails: bcc,
      subject,
      body_html: body,
      compose_mode: composeMode,
    })
  }, [to, cc, bcc, subject, body, fromAccountId, draftId, isAiDraft, replyTo, forward, saveDraft])

  // Reopen a saved composer draft. These live in `user_email_drafts` and are
  // served by /api/email/user-draft — a different table and route than the
  // AI drafts below, which is why they can't share the `draftId` param.
  useEffect(() => {
    if (!resumeDraftId) return

    const loadUserDraft = async () => {
      setLoadingDraft(true)
      try {
        const response = await fetch(`/api/email/user-draft?id=${resumeDraftId}`)
        if (!response.ok) throw new Error('Failed to load draft')

        const draft = await response.json()

        if (draft.email_account_id) setFromAccountId(draft.email_account_id)
        if (draft.to_emails?.length) setTo(draft.to_emails)
        if (draft.cc_emails?.length) {
          setCc(draft.cc_emails)
          setShowCc(true)
        }
        if (draft.bcc_emails?.length) {
          setBcc(draft.bcc_emails)
          setShowBcc(true)
        }
        if (draft.subject) setSubject(draft.subject)
        if (draft.body_html) setBody(draft.body_html)

        // Attachments are stored as references; pull the bytes back into Files so
        // they send exactly as they would have when the draft was written.
        if (draft.attachments?.length > 0) {
          const loaded = await Promise.all(
            draft.attachments.map(async (doc: any) => {
              try {
                const res = await fetch(doc.public_url)
                const blob = await res.blob()
                return new File([blob], doc.file_name, { type: doc.mime_type || 'application/octet-stream' })
              } catch (err) {
                console.error('Failed to load attachment:', doc.file_name, err)
                return null
              }
            })
          )
          const files = loaded.filter((f): f is File => f !== null)
          if (files.length > 0) setAttachments(files)
        }
      } catch (err) {
        console.error('Error loading draft:', err)
        setError('Failed to load draft')
      }
      setLoadingDraft(false)
    }

    loadUserDraft()
  }, [resumeDraftId])

  // Load AI-generated draft if draftId provided
  useEffect(() => {
    if (!draftId) return

    const loadDraft = async () => {
      setLoadingDraft(true)
      try {
        const response = await fetch(`/api/email/draft?id=${draftId}`)
        if (!response.ok) {
          throw new Error('Failed to load draft')
        }

        const draft = await response.json()

        // Pre-populate fields from draft
        if (draft.to_email) {
          setTo([draft.to_email])
        }
        if (draft.subject) {
          setSubject(draft.subject)
        }
        if (draft.body_html) {
          setBody(draft.body_html)
        }
        if (draft.from_account_id) {
          setFromAccountId(draft.from_account_id)
        }

        // Load attachments in parallel for better performance
        if (draft.attachments?.length > 0) {
          const attachmentPromises = draft.attachments.map(async (doc: any) => {
            try {
              const fileResponse = await fetch(doc.public_url)
              const blob = await fileResponse.blob()
              return new File([blob], doc.file_name, { type: doc.mime_type || 'application/octet-stream' })
            } catch (err) {
              console.error('Failed to load attachment:', doc.file_name, err)
              return null
            }
          })
          const loadedFiles = (await Promise.all(attachmentPromises)).filter((f): f is File => f !== null)
          if (loadedFiles.length > 0) {
            setAttachments(loadedFiles)
          }
        }

        setIsAiDraft(draft.ai_generated || false)
        setCurrentDraftId(draftId)
        setLinkedTaskId(draft.task_id || null)
        setRecipientName(draft.to_name || null)
      } catch (err) {
        console.error('Error loading draft:', err)
        setError('Failed to load draft')
      }
      setLoadingDraft(false)
    }

    loadDraft()
  }, [draftId])

  // Load original file attachments when forwarding an email
  useEffect(() => {
    if (!forward?.attachments?.length) return

    let canceled = false
    const loadForwardedAttachments = async () => {
      const files = await loadForwardAttachments(forward.attachments)
      if (!canceled && files.length > 0) {
        setAttachments(files)
      }
    }

    loadForwardedAttachments()
    return () => {
      canceled = true
    }
  }, [forward?.email_id, forward?.attachments?.length])

  // Handle pending attachments from document library - optimized for parallel fetching
  useEffect(() => {
    if (pendingAttachments.length > 0) {
      const fetchAndAttach = async () => {
        const validDocs = pendingAttachments.filter(doc => doc.public_url)
        if (validDocs.length === 0) {
          clearPendingAttachments()
          return
        }

        const filePromises = validDocs.map(async (doc) => {
          try {
            const response = await fetch(doc.public_url!)
            const blob = await response.blob()
            return new File([blob], doc.file_name, { type: doc.mime_type || 'application/octet-stream' })
          } catch (err) {
            console.error('Failed to fetch document:', doc.file_name, err)
            return null
          }
        })

        const loadedFiles = (await Promise.all(filePromises)).filter((f): f is File => f !== null)
        if (loadedFiles.length > 0) {
          setAttachments(prev => [...prev, ...loadedFiles])
        }
        clearPendingAttachments()
      }
      fetchAndAttach()
    }
  }, [pendingAttachments, clearPendingAttachments])

  // External content changes (draft load, etc.) flow into the editor through the
  // RichTextEditor's `content` prop, which syncs them without disturbing the caret.
  // No separate sync needed here — doing so double-set content and bounced the cursor.

  useEffect(() => {
    if (!showByeTalkPicker) return

    let canceled = false
    const controller = new AbortController()

    const fetchByeTalkFiles = async () => {
      setByeTalkLoading(true)
      try {
        const params = new URLSearchParams()
        if (byeTalkSearch.trim()) params.set('q', byeTalkSearch.trim())
        params.set('limit', '120')
        const response = await fetch(`/api/email/byetalk-files?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = await response.json()
        if (!canceled && response.ok) {
          setByeTalkFiles(data.files || [])
        }
      } catch (err) {
        if (!canceled) {
          console.error('Failed to fetch ByeTalk files:', err)
        }
      } finally {
        if (!canceled) setByeTalkLoading(false)
      }
    }

    fetchByeTalkFiles()
    return () => {
      canceled = true
      controller.abort()
    }
  }, [showByeTalkPicker, byeTalkSearch])

  const toggleByeTalkSelection = (item: ByeTalkListItem) => {
    setSelectedByeTalk((prev) => {
      const key = `${item.kind}:${item.id}`
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return {
        ...prev,
        [key]: {
          item,
          format: 'xlsx',
        },
      }
    })
  }

  const setByeTalkSheetFormat = (key: string, format: 'xlsx' | 'csv') => {
    setSelectedByeTalk((prev) => {
      const current = prev[key]
      if (!current) return prev
      return {
        ...prev,
        [key]: { ...current, format },
      }
    })
  }

  const createFileFromBase64 = (base64: string, filename: string, contentType: string) => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new File([bytes], filename, { type: contentType || 'application/octet-stream' })
  }

  const handleAttachByeTalkFiles = async () => {
    const selectedEntries = Object.values(selectedByeTalk)
    if (selectedEntries.length === 0) return

    setAttachingByeTalk(true)
    setError(null)
    try {
      const newFiles: File[] = []
      for (const entry of selectedEntries) {
        const payload: Record<string, string> = {
          kind: entry.item.kind,
          id: entry.item.id,
        }
        if (entry.item.kind === 'sheet') {
          payload.format = entry.format
        }

        const response = await fetch('/api/email/byetalk-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || `Failed to export ${entry.item.name}`)
        }

        const file = createFileFromBase64(data.contentBase64, data.filename, data.contentType)
        newFiles.push(file)
      }

      if (newFiles.length > 0) {
        setAttachments((prev) => [...prev, ...newFiles])
      }

      setSelectedByeTalk({})
      setShowByeTalkPicker(false)
    } catch (err) {
      console.error('Failed to attach ByeTalk files:', err)
      setError(err instanceof Error ? err.message : 'Failed to attach ByeTalk files')
    } finally {
      setAttachingByeTalk(false)
    }
  }

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  // Fetch contact suggestions
  const fetchContactSuggestions = async (query: string) => {
    if (query.length < 1) {
      setContactSuggestions([])
      setShowSuggestions(null)
      return
    }

    setLoadingSuggestions(true)
    try {
      const response = await fetch(`/api/email/contacts?q=${encodeURIComponent(query)}&limit=8`)
      if (response.ok) {
        const data = await response.json()
        setContactSuggestions(data.contacts || [])
        setSelectedSuggestionIndex(0)
      }
    } catch (err) {
      console.error('Failed to fetch contact suggestions:', err)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  // Debounced input handler for autocomplete
  const handleInputChange = (
    type: 'to' | 'cc' | 'bcc',
    value: string,
    setter: (value: string) => void
  ) => {
    setter(value)
    setShowSuggestions(type)

    // Debounce the API call
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current)
    }

    suggestionsDebounceRef.current = setTimeout(() => {
      fetchContactSuggestions(value)
    }, 200)
  }

  // Select a suggestion
  const selectSuggestion = (contact: { email: string; name: string | null }, type: 'to' | 'cc' | 'bcc') => {
    addRecipient(type, contact.email)
    setShowSuggestions(null)
    setContactSuggestions([])
    setSelectedSuggestionIndex(0)
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.recipient-autocomplete')) {
        setShowSuggestions(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addRecipient = (
    type: 'to' | 'cc' | 'bcc',
    email: string
  ) => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!emailRegex.test(trimmedEmail)) return false

    switch (type) {
      case 'to':
        if (!to.includes(trimmedEmail)) {
          setTo([...to, trimmedEmail])
          setToInput('')
        }
        break
      case 'cc':
        if (!cc.includes(trimmedEmail)) {
          setCc([...cc, trimmedEmail])
          setCcInput('')
        }
        break
      case 'bcc':
        if (!bcc.includes(trimmedEmail)) {
          setBcc([...bcc, trimmedEmail])
          setBccInput('')
        }
        break
    }
    return true
  }

  const removeRecipient = (type: 'to' | 'cc' | 'bcc', email: string) => {
    switch (type) {
      case 'to':
        setTo(to.filter(e => e !== email))
        break
      case 'cc':
        setCc(cc.filter(e => e !== email))
        break
      case 'bcc':
        setBcc(bcc.filter(e => e !== email))
        break
    }
  }

  const handleKeyDown = (
    e: React.KeyboardEvent,
    type: 'to' | 'cc' | 'bcc',
    value: string
  ) => {
    // Handle suggestion navigation
    if (showSuggestions === type && contactSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < contactSuggestions.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : contactSuggestions.length - 1
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectSuggestion(contactSuggestions[selectedSuggestionIndex], type)
        return
      }
      if (e.key === 'Escape') {
        setShowSuggestions(null)
        return
      }
    }

    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      if (value) addRecipient(type, value)
      setShowSuggestions(null)
    }
    if (e.key === 'Backspace' && !value) {
      switch (type) {
        case 'to':
          if (to.length > 0) setTo(to.slice(0, -1))
          break
        case 'cc':
          if (cc.length > 0) setCc(cc.slice(0, -1))
          break
        case 'bcc':
          if (bcc.length > 0) setBcc(bcc.slice(0, -1))
          break
      }
    }
  }

  const handlePaste = (
    e: React.ClipboardEvent,
    type: 'to' | 'cc' | 'bcc'
  ) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const emails = text.split(/[,;\s]+/).filter(Boolean)
    emails.forEach(email => addRecipient(type, email))
  }

  // Max total attachment size (25MB for most email providers)
  const MAX_TOTAL_SIZE = 25 * 1024 * 1024
  const MAX_SINGLE_FILE_SIZE = 25 * 1024 * 1024

  const getTotalAttachmentSize = () => {
    return attachments.reduce((total, file) => total + file.size, 0)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newFiles = Array.from(files)
    const currentSize = getTotalAttachmentSize()
    let addedSize = 0
    const validFiles: File[] = []
    const largeFiles: File[] = []

    for (const file of newFiles) {
      // Check if file is too large for email attachment
      if (file.size > MAX_SINGLE_FILE_SIZE) {
        largeFiles.push(file)
        continue
      }
      if (currentSize + addedSize + file.size > MAX_TOTAL_SIZE) {
        largeFiles.push(file)
        continue
      }
      validFiles.push(file)
      addedSize += file.size
    }

    // Handle large files - prompt to upload to drive, one at a time. Queue ALL
    // oversize files so none are silently dropped: if no prompt is open, show the
    // first and queue the rest; if one is already open, queue everything.
    if (largeFiles.length > 0) {
      const alreadyShowing = pendingLargeFile != null
      setPendingLargeFile(current => current ?? { file: largeFiles[0], isUploading: false })
      setLargeFileQueue(prev => [...prev, ...largeFiles.slice(alreadyShowing ? 0 : 1)])
    }

    if (validFiles.length > 0) {
      setAttachments([...attachments, ...validFiles])
    }

    // Reset the input so the same file can be selected again
    e.target.value = ''
  }

  // After a file is converted to a Drive link or skipped, show the next queued
  // oversize file, or close the prompt when the queue is empty.
  const showNextLargeFileOrClear = () => {
    if (largeFileQueue.length > 0) {
      setPendingLargeFile({ file: largeFileQueue[0], isUploading: false })
      setLargeFileQueue(prev => prev.slice(1))
    } else {
      setPendingLargeFile(null)
    }
  }

  const handleUploadToDrive = async () => {
    if (!pendingLargeFile) return

    setPendingLargeFile({ ...pendingLargeFile, isUploading: true })
    setError(null)

    try {
      const file = pendingLargeFile.file

      // Step 1: Get signed upload URL
      const urlResponse = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-upload-url',
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      })

      const urlData = await urlResponse.json()

      if (!urlResponse.ok) {
        throw new Error(urlData.error || 'Failed to get upload URL')
      }

      // Step 2: Upload directly to Supabase Storage
      const uploadResponse = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage')
      }

      // Step 3: Complete upload - create database record
      const completeResponse = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete-upload',
          fileId: urlData.fileId,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      })

      const completeData = await completeResponse.json()

      if (!completeResponse.ok) {
        throw new Error(completeData.error || 'Failed to complete upload')
      }

      // Step 4: Create a public share link
      const shareResponse = await fetch('/api/drive/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: completeData.file.id,
          accessType: 'public',
        }),
      })

      const shareData = await shareResponse.json()

      if (!shareResponse.ok) {
        throw new Error(shareData.error || 'Failed to create share link')
      }

      // Add to drive links
      const newDriveLink: DriveLink = {
        fileId: completeData.file.id,
        filename: completeData.file.original_filename,
        fileSize: formatFileSize(completeData.file.size_bytes),
        shareToken: shareData.share.share_token,
        shareUrl: shareData.shareUrl,
      }

      setDriveLinks([...driveLinks, newDriveLink])
      showNextLargeFileOrClear()
    } catch (err) {
      console.error('[Email Compose] Drive upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload to drive')
      setPendingLargeFile({ ...pendingLargeFile, isUploading: false })
    }
  }

  const handleCancelLargeFile = () => {
    showNextLargeFileOrClear()
  }

  const removeDriveLink = (index: number) => {
    setDriveLinks(driveLinks.filter((_, i) => i !== index))
  }

  // Generate HTML for drive links to insert into email body
  const generateDriveLinkHtml = (link: DriveLink) => {
    return `
<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; background-color: #f9fafb;">
  <p style="margin: 0 0 8px 0; font-weight: 600; color: #374151;">Shared via ByeTalk Drive</p>
  <p style="margin: 0 0 12px 0; color: #6b7280;">${link.filename} (${link.fileSize})</p>
  <a href="${link.shareUrl}" style="display: inline-block; padding: 8px 16px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Download File</a>
</div>
`.trim()
  }

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    setError(null)

    // Validate
    if (!fromAccountId) {
      setError('Please select a sender account')
      return
    }

    if (to.length === 0) {
      setError('Please add at least one recipient')
      return
    }

    if (!subject.trim()) {
      if (!confirm('Send this email without a subject?')) {
        return
      }
    }

    const editorHtml = inlineEmailBodySpacing(editorRef.current?.getHTML() || body)
    // Use a blank line between blocks so the text/plain alternative keeps
    // paragraph breaks (TipTap defaults to a single "\n", which collapses them).
    const bodyText = editorRef.current?.getText({ blockSeparator: '\n\n' }) || ''

    if (!bodyText.trim()) {
      if (!confirm('Send this email without any content?')) {
        return
      }
    }

    // Generate drive link HTML blocks
    const driveLinksHtml = driveLinks.map(link => generateDriveLinkHtml(link)).join('')

    // Combine message body with drive links and signature for the final email HTML
    let bodyHtml = editorHtml
    if (driveLinksHtml) {
      bodyHtml = `${bodyHtml}<br><br>${driveLinksHtml}`
    }
    if (signatureHtml) {
      bodyHtml = `${bodyHtml}<br><br>${signatureHtml}`
    }

    setSending(true)

    try {
      // Upload attachments directly to storage (bypasses the ~4.5MB serverless
      // request-body limit that base64-in-JSON attachments used to hit). We send
      // only a storage reference; the send route downloads the bytes server-side.
      let attachmentData: any[] = []
      if (attachments.length > 0) {
        console.log('[Email Compose] Uploading attachments to storage:', attachments.length)
        for (const file of attachments) {
          // 1) Get a signed upload URL for this attachment
          const urlRes = await fetch('/api/email/attachment-upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromAccountId, filename: file.name }),
          })
          const urlData = await urlRes.json().catch(() => ({}))
          if (!urlRes.ok) {
            throw new Error(urlData.error || `Failed to prepare upload for "${file.name}"`)
          }

          // 2) Upload the file directly to Supabase Storage
          const putRes = await fetch(urlData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          })
          if (!putRes.ok) {
            const detail = await putRes.text().catch(() => '')
            throw new Error(
              `Failed to upload "${file.name}" (${putRes.status})${detail ? ': ' + detail.slice(0, 200) : ''}`
            )
          }

          attachmentData.push({
            storage_path: urlData.storagePath,
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            size: file.size,
          })
        }
        console.log('[Email Compose] Attachments staged in storage:', attachmentData.length)
      }

      const requestBody = {
        from_account_id: fromAccountId,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        reply_to_email_id: replyTo?.email_id,
        thread_id: replyTo?.thread_id,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
      }

      console.log('[Email Compose] Sending request with attachments:', requestBody.attachments?.length || 0)
      if (requestBody.attachments && requestBody.attachments.length > 0) {
        requestBody.attachments.forEach((att: any, idx: number) => {
          console.log(`[Email Compose] Request attachment ${idx + 1}:`, {
            filename: att.filename,
            content_type: att.content_type,
            size: att.size,
            contentLength: att.content?.length || 0,
            contentPreview: att.content?.substring(0, 50) + '...',
          })
        })
      }

      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.error ||
            (response.status === 413
              ? 'Attachment too large to send.'
              : `Failed to send email (${response.status})`)
        )
      }

      // Mark AI draft as sent if applicable
      let taskWasCompleted = false
      let contactName = recipientName
      if (currentDraftId) {
        try {
          const draftResponse = await fetch('/api/email/draft', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draft_id: currentDraftId,
              status: 'sent'
            })
          })

          const draftResult = await draftResponse.json()
          console.log('[Email Compose] Draft update result:', draftResult)
          taskWasCompleted = draftResult.taskCompleted
          if (draftResult.recipientName) {
            contactName = draftResult.recipientName
          }
        } catch (draftError) {
          console.error('Failed to update draft status:', draftError)
        }
      }

      // Delete user draft if one was created (autosave)
      if (userDraftId) {
        await deleteDraft()
      }

      // Success - close compose and refresh
      onClose()
      router.refresh()

      // Show Nimbus celebration AFTER close (so it persists)
      // Celebrate when: task completed OR AI draft sent
      if (taskWasCompleted) {
        // Small delay to ensure the page has refreshed
        setTimeout(() => {
          showNimbus({
            mood: 'happy',
            title: 'Great work!',
            message: `Email sent to ${contactName || 'your contact'} and task marked complete.`,
            subMessage: 'Keep crushing it!',
            dismissLabel: 'Thanks!',
          })
        }, 500)
      } else if (isAiDraft && currentDraftId) {
        // Celebrate sending an AI-generated draft (even without linked task)
        setTimeout(() => {
          showNimbus({
            mood: 'happy',
            title: 'Nice one!',
            message: `Email sent to ${contactName || 'your contact'}!`,
            subMessage: 'Way to follow through on your commitment!',
            dismissLabel: 'Thanks!',
          })
        }, 500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    }

    setSending(false)
  }

  const handleDiscard = async () => {
    const bodyText = editorRef.current?.getText() || ''
    if (to.length > 0 || subject || bodyText.trim()) {
      if (!confirm('Discard this draft?')) {
        return
      }
    }
    // Delete user draft if one was created
    if (userDraftId) {
      await deleteDraft()
    }
    onClose()
  }

  // Minimized view - Premium floating pill
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 w-80 rounded-2xl cursor-pointer overflow-hidden transition-all duration-300 hover:scale-[1.02]"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
        onClick={onMinimize}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/15 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
              <Send className="w-4 h-4 text-yellow-400" />
            </div>
            <span className="text-sm text-white font-semibold truncate tracking-tight">
              {subject || 'New Message'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMinimize?.() }}
              className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all duration-200"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDiscard() }}
              className="p-2 rounded-xl hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all duration-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while draft is loading - Premium styling
  if (loadingDraft) {
    return (
      <div
        className={`flex flex-col items-center justify-center ${isInline ? 'h-full' : isFullscreen ? 'fixed inset-4 z-50 rounded-2xl' : 'w-full max-w-2xl h-96 rounded-2xl'}`}
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mb-4">
          <Loader2 className="w-6 h-6 text-yellow-400 animate-spin" />
        </div>
        <p className="text-gray-400 font-medium">Loading draft...</p>
      </div>
    )
  }

  // Determine container classes based on mode - Premium glass styling
  const containerClasses = isInline
    ? 'flex flex-col h-full'
    : `flex flex-col ${isFullscreen ? 'fixed inset-4 z-50' : `w-full ${maxWidthClassName}${fillHeight ? ' h-full min-h-0' : ''}`}`

  const containerStyle = isInline ? {} : {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    borderRadius: '1rem',
    // Give the flex column a concrete height to distribute so the message body
    // (flex: 1) can claim the majority of the space. Fullscreen uses inset-4 and
    // fillHeight uses h-full from the parent, so only constrain the plain modal.
    ...(!isFullscreen && !fillHeight ? { height: 'min(92vh, 1080px)' } : {}),
  }

  return (
    <div className={containerClasses} style={containerStyle}>
      {/* Header - Premium styling. Fixed compact height (~54px), vertically centered. */}
      <div className="flex-shrink-0 flex items-center justify-between h-[54px] px-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          {onBack && (
            <>
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Inbox
              </button>
              <div className="w-px h-5 bg-white/[0.08]" />
            </>
          )}
          <span className="text-white font-semibold tracking-tight">
            {replyTo ? 'Reply' : forward ? 'Forward' : isAiDraft ? 'AI Draft' : 'New Message'}
          </span>
          {isAiDraft && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-yellow-500/15 to-yellow-600/10 border border-yellow-500/25 rounded-lg text-xs text-yellow-400 font-medium">
              <Sparkles className="w-3 h-3" />
              AI Generated
            </span>
          )}
          {!isAiDraft && saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
          {!isAiDraft && saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-green-400/80 font-medium">
              <Clock className="w-3 h-3" />
              Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="w-[38px] h-[38px] inline-flex items-center justify-center rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-400 hover:text-white transition-all duration-200"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="w-[38px] h-[38px] inline-flex items-center justify-center rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-400 hover:text-white transition-all duration-200"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleDiscard}
            className="w-[38px] h-[38px] inline-flex items-center justify-center rounded-xl bg-white/[0.03] hover:bg-red-500/10 border border-white/[0.04] hover:border-red-500/20 text-gray-400 hover:text-red-400 transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error - Premium styling */}
      {error && (
        <div className="flex-shrink-0 px-5 py-3 bg-red-500/[0.08] border-b border-red-500/20 text-red-400 text-sm font-medium flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* AI Draft Banner - Premium styling */}
      {isAiDraft && (
        <div className="flex-shrink-0 px-5 py-3 bg-gradient-to-r from-yellow-500/[0.08] via-yellow-500/[0.05] to-transparent border-b border-yellow-500/20 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-yellow-400 text-sm font-semibold tracking-tight">Generated by Nimbus</p>
            <p className="text-yellow-400/60 text-xs mt-1 leading-relaxed">
              Please review this draft carefully before sending. AI-generated content may need adjustments.
            </p>
          </div>
        </div>
      )}

      {/* From - Premium field styling. Compact single-line row (~48px). */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 min-h-[48px] border-b border-white/[0.06]">
        <label className="text-xs text-gray-500 w-[84px] flex-shrink-0 uppercase tracking-wider font-semibold">From</label>
        <select
          value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none font-medium cursor-pointer"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id} className="bg-gray-900">
              {account.display_name ? `${account.display_name} <${account.email_address}>` : account.email_address}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
      </div>

      {/* To - Premium field styling with autocomplete. Compact row; Cc/Bcc inline. */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 min-h-[48px] border-b border-white/[0.06] relative recipient-autocomplete">
        <label className="text-xs text-gray-500 w-[84px] flex-shrink-0 uppercase tracking-wider font-semibold">To</label>
        <div className="flex-1 min-w-0 relative">
          <div className="flex flex-wrap items-center gap-2">
            {to.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-white font-medium"
              >
                {email}
                <button
                  onClick={() => removeRecipient('to', email)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              ref={toInputRef}
              type="text"
              value={toInput}
              onChange={(e) => handleInputChange('to', e.target.value, setToInput)}
              onKeyDown={(e) => handleKeyDown(e, 'to', toInput)}
              onPaste={(e) => handlePaste(e, 'to')}
              onFocus={() => toInput && setShowSuggestions('to')}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => {
                  if (toInput && !showSuggestions) addRecipient('to', toInput)
                }, 200)
              }}
              className="flex-1 min-w-[150px] bg-transparent text-white text-sm outline-none placeholder-gray-600"
              placeholder={to.length === 0 ? 'Recipients' : ''}
            />
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions === 'to' && contactSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
              {contactSuggestions.map((contact, index) => (
                <button
                  key={contact.email}
                  type="button"
                  onClick={() => selectSuggestion(contact, 'to')}
                  className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
                    index === selectedSuggestionIndex
                      ? 'bg-yellow-500/10 text-white'
                      : 'hover:bg-white/5 text-gray-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-gray-400">
                      {(contact.name || contact.email)[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {contact.name && (
                      <p className="text-sm font-medium truncate">{contact.name}</p>
                    )}
                    <p className={`text-xs truncate ${contact.name ? 'text-gray-500' : 'text-sm'}`}>
                      {contact.email}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="hover:text-white transition-colors">
              Cc
            </button>
          )}
          {!showBcc && (
            <button onClick={() => setShowBcc(true)} className="hover:text-white transition-colors">
              Bcc
            </button>
          )}
        </div>
      </div>

      {/* Cc - Premium field styling with autocomplete */}
      {showCc && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 min-h-[48px] border-b border-white/[0.06] relative recipient-autocomplete">
          <label className="text-xs text-gray-500 w-[84px] flex-shrink-0 uppercase tracking-wider font-semibold">Cc</label>
          <div className="flex-1 min-w-0 relative">
            <div className="flex flex-wrap items-center gap-2">
              {cc.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-white font-medium"
                >
                  {email}
                  <button
                    onClick={() => removeRecipient('cc', email)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                ref={ccInputRef}
                type="text"
                value={ccInput}
                onChange={(e) => handleInputChange('cc', e.target.value, setCcInput)}
                onKeyDown={(e) => handleKeyDown(e, 'cc', ccInput)}
                onPaste={(e) => handlePaste(e, 'cc')}
                onFocus={() => ccInput && setShowSuggestions('cc')}
                onBlur={() => {
                  setTimeout(() => {
                    if (ccInput && !showSuggestions) addRecipient('cc', ccInput)
                  }, 200)
                }}
                className="flex-1 min-w-[150px] bg-transparent text-white text-sm outline-none"
              />
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions === 'cc' && contactSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                {contactSuggestions.map((contact, index) => (
                  <button
                    key={contact.email}
                    type="button"
                    onClick={() => selectSuggestion(contact, 'cc')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
                      index === selectedSuggestionIndex
                        ? 'bg-yellow-500/10 text-white'
                        : 'hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-gray-400">
                        {(contact.name || contact.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {contact.name && (
                        <p className="text-sm font-medium truncate">{contact.name}</p>
                      )}
                      <p className={`text-xs truncate ${contact.name ? 'text-gray-500' : 'text-sm'}`}>
                        {contact.email}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bcc - Premium field styling with autocomplete */}
      {showBcc && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 min-h-[48px] border-b border-white/[0.06] relative recipient-autocomplete">
          <label className="text-xs text-gray-500 w-[84px] flex-shrink-0 uppercase tracking-wider font-semibold">Bcc</label>
          <div className="flex-1 min-w-0 relative">
            <div className="flex flex-wrap items-center gap-2">
              {bcc.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-white font-medium"
                >
                  {email}
                  <button
                    onClick={() => removeRecipient('bcc', email)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                ref={bccInputRef}
                type="text"
                value={bccInput}
                onChange={(e) => handleInputChange('bcc', e.target.value, setBccInput)}
                onKeyDown={(e) => handleKeyDown(e, 'bcc', bccInput)}
                onPaste={(e) => handlePaste(e, 'bcc')}
                onFocus={() => bccInput && setShowSuggestions('bcc')}
                onBlur={() => {
                  setTimeout(() => {
                    if (bccInput && !showSuggestions) addRecipient('bcc', bccInput)
                  }, 200)
                }}
                className="flex-1 min-w-[150px] bg-transparent text-white text-sm outline-none"
              />
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions === 'bcc' && contactSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                {contactSuggestions.map((contact, index) => (
                  <button
                    key={contact.email}
                    type="button"
                    onClick={() => selectSuggestion(contact, 'bcc')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
                      index === selectedSuggestionIndex
                        ? 'bg-yellow-500/10 text-white'
                        : 'hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-gray-400">
                        {(contact.name || contact.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {contact.name && (
                        <p className="text-sm font-medium truncate">{contact.name}</p>
                      )}
                      <p className={`text-xs truncate ${contact.name ? 'text-gray-500' : 'text-sm'}`}>
                        {contact.email}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subject - Premium field styling. Compact single-line row (~48px). */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 min-h-[48px] border-b border-white/[0.06]">
        <label className="text-xs text-gray-500 w-[84px] flex-shrink-0 uppercase tracking-wider font-semibold">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none font-medium placeholder-gray-600"
          placeholder="Subject"
        />
      </div>

      {/* Message body + signature preview share ONE scrollable region. This keeps the
          message body the dominant, top-priority area (flex-1, floored at 220px so it's
          always taller than the metadata block) while letting the signature preview sit
          just below it and scroll into view when vertical space is tight. Because the
          scroll lives here, the footer below stays pinned and visible in every mount —
          including the height-constrained inline dashboard pane. */}
      <div className="compose-message-area flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Rich Text Editor (TipTap) - Message body only */}
        <div className="flex-1 min-h-[220px] flex flex-col">
          <RichTextEditor
            ref={editorRef}
            content={body}
            onChange={setBody}
            placeholder="Write your message..."
            className="h-full flex flex-col"
            autoFocus={!replyTo && !forward && !draftId}
          />
        </div>

        {/* Signature preview - Rendered as HTML below the editor, styled for dark mode.
            This is ONLY a preview: it is visually scaled to ~78% via `zoom` so it stays
            compact in the composer. The full-size `signatureHtml` (unchanged) is what gets
            appended to the outgoing email in handleSend. `zoom` (unlike a bare transform)
            reflows the surrounding layout, so no phantom full-height blank space remains. */}
        {signatureHtml && (
          <div className="compose-signature flex-shrink-0 border-t border-white/[0.06] px-6 py-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
                Signature preview
              </p>
              {isInfoAccount && (
                <p className="text-[10px] text-gray-500">
                  Signed as{' '}
                  <span className="text-gray-300 font-medium">{INFO_SIGNATURE_OPTIONS[infoSigIndex].label}</span>
                  {' '}· click to change
                </p>
              )}
            </div>
            {isInfoAccount && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {INFO_SIGNATURE_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setInfoSigIndex(i)}
                    className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                      i === infoSigIndex
                        ? 'bg-white/15 text-white'
                        : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <div
              className="signature-preview-shell overflow-hidden"
              onClick={isInfoAccount ? cycleInfoSignature : undefined}
              role={isInfoAccount ? 'button' : undefined}
              title={isInfoAccount ? 'Click to switch signature' : undefined}
              style={isInfoAccount ? { cursor: 'pointer' } : undefined}
            >
              <div
                className="signature-preview email-content-dark"
                style={{ zoom: 0.78 }}
                dangerouslySetInnerHTML={{ __html: signatureHtml }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Large file warning - Upload to Drive prompt */}
      {pendingLargeFile && (
        <div className="flex-shrink-0 px-5 py-4 border-t border-white/[0.06]">
          <div className="flex items-start gap-4 p-4 bg-yellow-500/[0.08] border border-yellow-500/20 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-yellow-400 font-medium">Large file detected</p>
              <p className="text-xs text-yellow-400/60 mt-1">
                <span className="font-medium">{pendingLargeFile.file.name}</span> ({formatFileSize(pendingLargeFile.file.size)}) exceeds the 25MB email attachment limit.
              </p>
              <p className="text-xs text-yellow-400/60 mt-1">
                Upload to ByeTalk Drive and share a download link instead.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleUploadToDrive}
                  disabled={pendingLargeFile.isUploading}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.8) 0%, rgba(217, 119, 6, 0.8) 100%)',
                  }}
                >
                  {pendingLargeFile.isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Upload to Drive
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancelLargeFile}
                  disabled={pendingLargeFile.isUploading}
                  className="px-3 py-1.5 text-xs text-yellow-400/60 hover:text-yellow-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
            {!pendingLargeFile.isUploading && (
              <button
                onClick={handleCancelLargeFile}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-yellow-400/60 hover:text-yellow-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Drive Links - Premium styling */}
      {driveLinks.length > 0 && (
        <div className="flex-shrink-0 px-5 py-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-yellow-400/80 font-semibold uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5" />
              {driveLinks.length} Drive Link{driveLinks.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {driveLinks.map((link, index) => (
              <div
                key={link.fileId}
                className="group flex items-center gap-3 p-3 bg-yellow-500/[0.06] border border-yellow-500/15 rounded-xl"
              >
                <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
                  <HardDrive className="w-4 h-4 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{link.filename}</p>
                  <p className="text-xs text-gray-500">{link.fileSize}</p>
                </div>
                <a
                  href={link.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-yellow-400 hover:underline"
                >
                  View
                </a>
                <button
                  onClick={() => removeDriveLink(index)}
                  className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments - Premium styling */}
      {attachments.length > 0 && (
        <div className="flex-shrink-0 max-h-[132px] overflow-y-auto px-5 py-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
              {attachments.length} attachment{attachments.length > 1 ? 's' : ''} ({formatFileSize(getTotalAttachmentSize())})
            </span>
            <span className="text-xs text-gray-600">
              Max 25MB total
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="group flex items-center gap-2.5 px-4 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.1]"
              >
                <Paperclip className="w-4 h-4 text-gray-500 group-hover:text-yellow-500/80 transition-colors" />
                <span className="text-white font-medium truncate max-w-[150px]">{file.name}</span>
                <span className="text-gray-600 text-xs tabular-nums">
                  {formatFileSize(file.size)}
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer - Premium styling */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-t border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || to.length === 0}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(217, 119, 6, 0.1) 100%)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              color: '#fbbf24',
              boxShadow: '0 4px 12px rgba(234, 179, 8, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>

          <div className="w-px h-6 bg-white/[0.08]" />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-500 hover:text-white transition-all duration-200"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            onClick={openPanel}
            className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-yellow-500/10 border border-white/[0.04] hover:border-yellow-500/20 text-gray-500 hover:text-yellow-400 transition-all duration-200"
            title="Attach from Documents"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setShowByeTalkPicker(true)
              setByeTalkSearch('')
            }}
            className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-cyan-500/10 border border-white/[0.04] hover:border-cyan-500/20 text-gray-500 hover:text-cyan-400 transition-all duration-200"
            title="Attach ByeTalk file"
          >
            <FileText className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleAttachment}
            className="hidden"
          />
        </div>

        <button
          onClick={handleDiscard}
          className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-red-500/10 border border-white/[0.04] hover:border-red-500/20 text-gray-500 hover:text-red-400 transition-all duration-200"
          title="Discard"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {showByeTalkPicker && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div
            className="w-full max-w-3xl rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
              <div>
                <h3 className="text-base font-semibold text-white tracking-tight">Attach ByeTalk Files</h3>
                <p className="text-xs text-gray-500 mt-1">Docs export as DOCX, presentations as PDF, sheets as CSV/XLSX.</p>
              </div>
              <button
                onClick={() => setShowByeTalkPicker(false)}
                className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08] text-gray-400 hover:text-white transition-all duration-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-white/[0.06] px-6 py-4">
              <input
                type="text"
                value={byeTalkSearch}
                onChange={(e) => setByeTalkSearch(e.target.value)}
                placeholder="Search docs, sheets, presentations..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.05] transition-all duration-200"
              />
            </div>

            <div className="max-h-[360px] overflow-y-auto px-6 py-4">
              {byeTalkLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mb-3" />
                  <span className="text-sm font-medium">Loading files...</span>
                </div>
              ) : byeTalkFiles.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                    <FileText className="w-6 h-6 text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No matching ByeTalk files found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {byeTalkFiles.map((item) => {
                    const key = `${item.kind}:${item.id}`
                    const selected = !!selectedByeTalk[key]
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all duration-200 ${
                          selected
                            ? 'border-cyan-500/30 bg-cyan-500/[0.08]'
                            : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]'
                        }`}
                      >
                        <button
                          onClick={() => toggleByeTalkSelection(item)}
                          className="flex min-w-0 flex-1 items-center gap-4 text-left"
                        >
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            selected
                              ? 'bg-cyan-500 border-cyan-500'
                              : 'border-white/20 bg-white/[0.05]'
                          }`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            item.kind === 'sheet'
                              ? 'bg-green-500/10 border border-green-500/20'
                              : item.kind === 'presentation'
                              ? 'bg-orange-500/10 border border-orange-500/20'
                              : item.kind === 'project_file'
                              ? 'bg-indigo-500/10 border border-indigo-500/20'
                              : 'bg-blue-500/10 border border-blue-500/20'
                          }`}>
                            {item.kind === 'sheet' ? (
                              <Table2 className="h-4 w-4 text-green-400" />
                            ) : item.kind === 'presentation' ? (
                              <PresentationIcon className="h-4 w-4 text-orange-400" />
                            ) : item.kind === 'project_file' ? (
                              <FolderOpen className="h-4 w-4 text-indigo-400" />
                            ) : (
                              <FileText className="h-4 w-4 text-blue-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-white font-medium">{item.name}</p>
                            <p className="text-xs capitalize text-gray-500">{item.kind}</p>
                          </div>
                        </button>

                        {item.kind === 'sheet' && selected && (
                          <select
                            value={selectedByeTalk[key]?.format || 'xlsx'}
                            onChange={(e) => setByeTalkSheetFormat(key, e.target.value === 'csv' ? 'csv' : 'xlsx')}
                            className="ml-3 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs text-white font-medium cursor-pointer"
                          >
                            <option value="xlsx">XLSX</option>
                            <option value="csv">CSV</option>
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
              <span className="text-xs text-gray-500 font-medium tabular-nums">
                {Object.keys(selectedByeTalk).length} selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowByeTalkPicker(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.05] transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAttachByeTalkFiles}
                  disabled={attachingByeTalk || Object.keys(selectedByeTalk).length === 0}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all duration-200"
                  style={{
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.8) 0%, rgba(59, 130, 246, 0.8) 100%)',
                    boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
                  }}
                >
                  {attachingByeTalk ? 'Attaching...' : 'Attach'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
