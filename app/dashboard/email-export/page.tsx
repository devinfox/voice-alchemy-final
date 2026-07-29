'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Mail,
  Loader2,
  Search,
  AlertCircle,
  CheckCircle,
  User,
  Calendar,
  FileJson,
  ArrowLeft,
  FileText,
  Paperclip,
  Download,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react'
import Link from 'next/link'
import jsPDF from 'jspdf'

interface EmailAttachment {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  storage_path: string
  public_url: string | null
  is_inline: boolean
  content_id: string | null
}

interface ExportedEmail {
  id: string
  from_address: string
  from_name: string | null
  to_addresses: Array<{ email: string; name?: string }>
  cc_addresses: Array<{ email: string; name?: string }>
  subject: string | null
  body_html: string | null
  body_text: string | null
  sent_at: string | null
  created_at: string
  is_inbound: boolean
  attachments: EmailAttachment[]
  user_name: string
  user_email: string
}

interface EmailUser {
  id: string
  first_name: string
  last_name: string
  email: string
}

export default function EmailExportPage() {
  const [searchEmail, setSearchEmail] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [users, setUsers] = useState<EmailUser[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [emails, setEmails] = useState<ExportedEmail[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    totalEmails: number
    totalAttachments: number
    usersSearched: number
    byDate: Record<string, number>
  } | null>(null)

  const supabase = createClient()

  // Fetch users with email accounts
  useEffect(() => {
    async function fetchUsers() {
      const { data } = await supabase
        .from('users')
        .select(`
          id,
          first_name,
          last_name,
          email,
          email_accounts!inner (id)
        `)
        .eq('is_active', true)
        .order('first_name')

      const usersWithEmail = (data || []).map((u) => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
      }))

      setUsers(usersWithEmail)
      setLoading(false)
    }

    fetchUsers()
  }, [])

  const handleExport = async () => {
    if (!searchEmail.trim()) {
      setError('Please enter an email address to search')
      return
    }

    setExporting(true)
    setError(null)
    setEmails(null)
    setSummary(null)

    try {
      const response = await fetch('/api/email/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchEmail: searchEmail.trim(),
          userIds: selectedUsers.length > 0 ? selectedUsers : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Export failed')
      }

      setEmails(data.emails)
      setSummary(data.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }

    setExporting(false)
  }

  const downloadJSON = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const stripHtml = (html: string): string => {
    // Remove style tags and their content
    let cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove script tags
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove HTML comments (including CSS in comments like <!--...-->)
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')

    // Convert block-level elements to newlines BEFORE removing tags
    cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n')
    cleaned = cleaned.replace(/<\/p>/gi, '\n\n')
    cleaned = cleaned.replace(/<\/div>/gi, '\n')
    cleaned = cleaned.replace(/<\/tr>/gi, '\n')
    cleaned = cleaned.replace(/<\/li>/gi, '\n')
    cleaned = cleaned.replace(/<hr[^>]*>/gi, '\n---\n')

    // Remove all remaining HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, ' ')

    // Decode HTML entities
    cleaned = cleaned.replace(/&nbsp;/g, ' ')
    cleaned = cleaned.replace(/&amp;/g, '&')
    cleaned = cleaned.replace(/&lt;/g, '<')
    cleaned = cleaned.replace(/&gt;/g, '>')
    cleaned = cleaned.replace(/&quot;/g, '"')
    cleaned = cleaned.replace(/&#39;/g, "'")
    cleaned = cleaned.replace(/&apos;/g, "'")

    // Remove any remaining CSS-like content (font-face declarations, etc.)
    cleaned = cleaned.replace(/@font-face\s*\{[^}]*\}/gi, '')
    cleaned = cleaned.replace(/\{[^}]*\}/g, '')

    // Clean up whitespace while preserving line breaks
    cleaned = cleaned.replace(/[ \t]+/g, ' ') // Collapse spaces/tabs (not newlines)
    cleaned = cleaned.replace(/ ?\n ?/g, '\n') // Clean spaces around newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines

    // Trim each line
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n')

    return cleaned.trim()
  }

  // Remove quoted reply content from email body (for cleaner PDF export)
  const stripQuotedReplies = (text: string): string => {
    const lines = text.split('\n')
    const resultLines: string[] = []
    let foundQuoteMarker = false

    for (const line of lines) {
      const trimmedLine = line.trim()

      // Stop if we hit a quote marker
      if (
        // "On [date] [name] wrote:" pattern
        /^On .+wrote:$/i.test(trimmedLine) ||
        // "From:" header (start of forwarded/quoted email)
        /^From:\s*\S+@\S+/.test(trimmedLine) ||
        // Outlook "From: Name <email>" pattern in body
        /^From:\s*.+<.+@.+>/.test(trimmedLine) ||
        // "-----Original Message-----"
        /^-{3,}\s*Original Message\s*-{3,}$/i.test(trimmedLine) ||
        // Outlook divider
        /^_{10,}$/.test(trimmedLine) ||
        // Gmail "> " quoted lines (3+ consecutive)
        (trimmedLine.startsWith('>') && resultLines.length > 0 &&
          resultLines.slice(-2).every(l => l.trim().startsWith('>'))) ||
        // "Date:" followed by "From:" or "To:" (email header block in body)
        (/^Date:\s*.+\d{4}/.test(trimmedLine) && lines.indexOf(line) < lines.length - 1)
      ) {
        // Check if this looks like the start of a quoted section
        const nextLines = lines.slice(lines.indexOf(line) + 1, lines.indexOf(line) + 4).join(' ')
        if (
          /From:|To:|Subject:|Date:|wrote:/i.test(nextLines) ||
          /^>/.test(nextLines) ||
          trimmedLine.includes('wrote:')
        ) {
          foundQuoteMarker = true
          break
        }
      }

      resultLines.push(line)
    }

    // If we found a quote and have meaningful content before it, use that
    const result = resultLines.join('\n').trim()
    if (foundQuoteMarker && result.length > 20) {
      return result
    }

    // If no quote found or result too short, return original (cleaned up)
    return text
  }

  // Process email HTML to replace CID references with actual URLs
  const processEmailHtml = (html: string, attachments: EmailAttachment[]): string => {
    let processed = html

    // Replace cid: references with actual public URLs from attachments
    attachments.forEach((att) => {
      if (att.public_url) {
        if (att.content_id) {
          // Clean up the content_id (remove < > if present)
          const cidClean = att.content_id.replace(/[<>]/g, '')

          // Try multiple CID formats
          // Format 1: cid:xxx
          processed = processed.replace(
            new RegExp(`cid:${cidClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
            att.public_url
          )

          // Format 2: src="cid:xxx" or src='cid:xxx'
          processed = processed.replace(
            new RegExp(`src=["']cid:${cidClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'),
            `src="${att.public_url}"`
          )

          // Format 3: Sometimes content_id includes the angle brackets in the reference
          processed = processed.replace(
            new RegExp(`cid:${att.content_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
            att.public_url
          )
        }

        // Also try matching by filename for inline images
        if (att.is_inline && att.filename) {
          const safeFilename = att.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          processed = processed.replace(
            new RegExp(`src=["'][^"']*${safeFilename}[^"']*["']`, 'gi'),
            `src="${att.public_url}"`
          )
        }
      }
    })

    // Replace any remaining broken cid: references with a placeholder or remove them
    processed = processed.replace(/src=["']cid:[^"']+["']/gi, 'src=""')

    return processed
  }

  // Get all inline images from attachments (for displaying separately if not in HTML)
  const getInlineImagesFromAttachments = (attachments: EmailAttachment[]): EmailAttachment[] => {
    return attachments.filter(
      (att) => att.is_inline && att.content_type?.startsWith('image/') && att.public_url
    )
  }

  // Create HTML template for an email
  const createEmailHtml = (email: ExportedEmail): string => {
    const isInbound = email.is_inbound
    const bgColor = isInbound ? '#eff6ff' : '#f0fdf4'
    const borderColor = isInbound ? '#93c5fd' : '#86efac'
    const directionColor = isInbound ? '#3b82f6' : '#22c55e'
    const directionText = isInbound ? '← RECEIVED' : '→ SENT'

    const time = new Date(email.sent_at || email.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    const date = new Date(email.sent_at || email.created_at).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const fromText = email.from_name
      ? `${email.from_name} &lt;${email.from_address}&gt;`
      : email.from_address
    const toText = email.to_addresses.map((t) => t.email).join(', ')

    // Process the email body HTML to replace cid references
    let bodyContent = email.body_html || ''
    if (bodyContent) {
      bodyContent = processEmailHtml(bodyContent, email.attachments)
    } else if (email.body_text) {
      bodyContent = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${email.body_text}</pre>`
    } else {
      bodyContent = '<p style="color: #999;">[No content]</p>'
    }

    // Get file attachments (non-inline)
    const fileAttachments = email.attachments.filter((a) => !a.is_inline)

    let attachmentsHtml = ''
    if (fileAttachments.length > 0) {
      attachmentsHtml = `
        <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-weight: 600; color: #475569; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">📎</span>
            <span>ATTACHMENTS (${fileAttachments.length})</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${fileAttachments
              .map(
                (att) => `
              <a href="${att.public_url || '#'}" target="_blank" rel="noopener noreferrer"
                 style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: white; border-radius: 6px; border: 1px solid #e2e8f0; text-decoration: none; color: inherit; transition: all 0.2s;">
                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; flex-shrink: 0;">
                  ${getFileIcon(att.content_type, att.filename)}
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${att.filename}</div>
                  <div style="font-size: 12px; color: #64748b;">${formatBytes(att.size_bytes)} • ${att.content_type || 'Unknown type'}</div>
                </div>
                <div style="color: #3b82f6; font-weight: 500; display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                  <span>Download</span>
                  <span style="font-size: 16px;">↓</span>
                </div>
              </a>
            `
              )
              .join('')}
          </div>
        </div>
      `
    }

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin-bottom: 24px; page-break-inside: avoid;">
        <!-- Date Header -->
        <div style="background: #374151; color: white; padding: 8px 16px; border-radius: 8px 8px 0 0; font-size: 12px; font-weight: 600;">
          ${date}
        </div>

        <!-- Email Container -->
        <div style="background: ${bgColor}; border: 2px solid ${borderColor}; border-top: none; border-radius: 0 0 8px 8px; padding: 16px;">
          <!-- Header Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="color: ${directionColor}; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
              ${directionText}
            </span>
            <span style="color: #6b7280; font-size: 12px;">${time}</span>
          </div>

          <!-- Email Meta -->
          <div style="background: white; border-radius: 6px; padding: 12px; margin-bottom: 16px; border: 1px solid ${borderColor};">
            <div style="margin-bottom: 6px;">
              <span style="font-weight: 600; color: #374151; font-size: 12px;">From:</span>
              <span style="color: #1f2937; font-size: 13px; margin-left: 8px;">${fromText}</span>
            </div>
            <div style="margin-bottom: 6px;">
              <span style="font-weight: 600; color: #374151; font-size: 12px;">To:</span>
              <span style="color: #1f2937; font-size: 13px; margin-left: 8px;">${toText}</span>
            </div>
            <div>
              <span style="font-weight: 600; color: #374151; font-size: 12px;">Subject:</span>
              <span style="color: #1f2937; font-size: 13px; font-weight: 500; margin-left: 8px;">${email.subject || '(No subject)'}</span>
            </div>
          </div>

          <!-- Email Body with Original Styling -->
          <div style="background: white; border-radius: 6px; padding: 16px; border: 1px solid #e5e7eb; font-size: 14px; line-height: 1.6; color: #1f2937; overflow: hidden;">
            ${bodyContent}
          </div>

          <!-- Attachments Section -->
          ${attachmentsHtml}

          <!-- Via Footer -->
          <div style="text-align: right; margin-top: 12px; font-size: 11px; color: #9ca3af;">
            via ${email.user_name}
          </div>
        </div>
      </div>
    `
  }

  // Get appropriate icon for file type
  const getFileIcon = (contentType: string | undefined, filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (contentType?.startsWith('image/')) return '🖼️'
    if (contentType?.includes('pdf') || ext === 'pdf') return '📕'
    if (contentType?.includes('word') || ext === 'doc' || ext === 'docx') return '📘'
    if (contentType?.includes('excel') || contentType?.includes('spreadsheet') || ext === 'xls' || ext === 'xlsx') return '📗'
    if (contentType?.includes('powerpoint') || contentType?.includes('presentation') || ext === 'ppt' || ext === 'pptx') return '📙'
    if (contentType?.includes('zip') || contentType?.includes('compressed') || ext === 'zip' || ext === 'rar') return '📦'
    if (contentType?.includes('video') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) return '🎬'
    if (contentType?.includes('audio') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return '🎵'
    return '📄'
  }

  // Helper to load image as base64 for PDF embedding
  const loadImageAsBase64 = (url: string): Promise<{ data: string; width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          // Limit max dimensions for PDF
          const maxDim = 800
          let width = img.width
          let height = img.height
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = (height / width) * maxDim
              width = maxDim
            } else {
              width = (width / height) * maxDim
              height = maxDim
            }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            const data = canvas.toDataURL('image/jpeg', 0.85)
            resolve({ data, width, height })
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = url
    })
  }

  const downloadPDF = async () => {
    if (!emails || emails.length === 0) return

    setGeneratingPdf(true)

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15
      const maxWidth = pageWidth - margin * 2
      let yPos = margin

      const checkNewPage = (neededHeight: number): boolean => {
        if (yPos + neededHeight > pageHeight - margin) {
          pdf.addPage()
          yPos = margin
          return true
        }
        return false
      }

      // Title
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(30, 41, 59)
      pdf.text('Email Conversation Export', pageWidth / 2, yPos, { align: 'center' })
      yPos += 10

      // Search info
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(100, 116, 139)
      pdf.text(`Emails involving: ${searchEmail}`, pageWidth / 2, yPos, { align: 'center' })
      yPos += 6
      pdf.setFontSize(10)
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: 'center' })
      yPos += 5
      pdf.text(`Total: ${emails.length} emails`, pageWidth / 2, yPos, { align: 'center' })
      yPos += 15

      // Process each email
      for (const email of emails) {
        const isInbound = email.is_inbound

        // Date header
        const emailDate = new Date(email.sent_at || email.created_at).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        const emailTime = new Date(email.sent_at || email.created_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })

        // Separate inline images from file attachments
        const inlineImages = email.attachments.filter(
          (a) => a.is_inline && a.content_type?.startsWith('image/') && a.public_url
        )
        const fileAttachments = email.attachments.filter(
          (a) => !a.is_inline || !a.content_type?.startsWith('image/')
        ).filter((a) => a.public_url)

        // Get body text and preserve paragraph structure
        // Get body text - strip HTML and remove quoted replies for cleaner output
        const rawBodyText = email.body_text || stripHtml(email.body_html || '') || '[No content]'
        const bodyText = stripQuotedReplies(rawBodyText)
        pdf.setFontSize(9)

        // Split by newlines first to preserve paragraph structure
        const paragraphs = bodyText.substring(0, 4000).split('\n').filter(p => p.trim())
        const bodyLines: { text: string; isNewParagraph: boolean }[] = []

        for (let i = 0; i < paragraphs.length; i++) {
          const para = paragraphs[i].trim()
          if (!para) continue

          // Wrap each paragraph
          const wrappedLines = pdf.splitTextToSize(para, maxWidth - 10) as string[]
          wrappedLines.forEach((line, idx) => {
            bodyLines.push({
              text: line,
              isNewParagraph: idx === 0 && i > 0, // First line of non-first paragraph
            })
          })
        }

        // Calculate base email height (without images - we'll add those dynamically)
        const paragraphBreaks = bodyLines.filter(l => l.isNewParagraph).length
        const baseHeight = 45 + bodyLines.length * 4 + paragraphBreaks * 2
        const attachmentSectionHeight = fileAttachments.length > 0 ? 10 + fileAttachments.length * 7 : 0

        checkNewPage(baseHeight + 15)

        // Date bar
        pdf.setFillColor(55, 65, 81)
        pdf.roundedRect(margin, yPos, maxWidth, 8, 2, 2, 'F')
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(255, 255, 255)
        pdf.text(emailDate, pageWidth / 2, yPos + 5.5, { align: 'center' })
        yPos += 10

        let contentY = yPos + 2

        // Direction + Time
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(isInbound ? 59 : 34, isInbound ? 130 : 197, isInbound ? 246 : 94)
        pdf.text(isInbound ? '← RECEIVED' : '→ SENT', margin + 4, contentY)
        pdf.setTextColor(100, 100, 100)
        pdf.text(emailTime, margin + maxWidth - 4, contentY, { align: 'right' })
        contentY += 7

        // From
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(55, 65, 81)
        pdf.text('From:', margin + 4, contentY)
        pdf.setFont('helvetica', 'normal')
        const fromText = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address
        pdf.text(fromText.substring(0, 70), margin + 18, contentY)
        contentY += 5

        // To
        pdf.setFont('helvetica', 'bold')
        pdf.text('To:', margin + 4, contentY)
        pdf.setFont('helvetica', 'normal')
        const toText = email.to_addresses.map((t) => t.email).join(', ')
        pdf.text(toText.substring(0, 80), margin + 18, contentY)
        contentY += 5

        // Subject
        pdf.setFont('helvetica', 'bold')
        pdf.text('Subject:', margin + 4, contentY)
        pdf.setFont('helvetica', 'normal')
        pdf.text((email.subject || '(No subject)').substring(0, 65), margin + 22, contentY)
        contentY += 8

        // Body
        pdf.setFontSize(9)
        pdf.setTextColor(30, 30, 30)
        for (const line of bodyLines) {
          // Add extra space before new paragraphs
          if (line.isNewParagraph) {
            contentY += 3
          }
          // Check if we need a new page
          if (contentY > pageHeight - margin - 10) {
            pdf.addPage()
            contentY = margin + 5
          }
          pdf.text(line.text, margin + 4, contentY)
          contentY += 4
        }

        // Embed inline images directly in the PDF
        if (inlineImages.length > 0) {
          contentY += 4
          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(71, 85, 105)
          pdf.text(`IMAGES (${inlineImages.length}):`, margin + 4, contentY)
          contentY += 5

          for (const img of inlineImages) {
            if (!img.public_url) continue

            // Check if we need a new page for the image
            checkNewPage(60)

            try {
              const imgData = await loadImageAsBase64(img.public_url)
              if (imgData) {
                // Calculate dimensions to fit in PDF (max width ~160mm, maintain aspect ratio)
                const maxImgWidth = maxWidth - 10
                const maxImgHeight = 80 // mm
                let imgWidth = imgData.width * 0.264583 // px to mm
                let imgHeight = imgData.height * 0.264583

                if (imgWidth > maxImgWidth) {
                  const ratio = maxImgWidth / imgWidth
                  imgWidth = maxImgWidth
                  imgHeight *= ratio
                }
                if (imgHeight > maxImgHeight) {
                  const ratio = maxImgHeight / imgHeight
                  imgHeight = maxImgHeight
                  imgWidth *= ratio
                }

                // Check if image fits on current page
                if (contentY + imgHeight + 8 > pageHeight - margin) {
                  pdf.addPage()
                  contentY = margin + 5
                }

                // Add image to PDF
                pdf.addImage(imgData.data, 'JPEG', margin + 4, contentY, imgWidth, imgHeight)
                contentY += imgHeight + 3

                // Add filename caption
                pdf.setFontSize(7)
                pdf.setTextColor(120, 120, 120)
                pdf.text(img.filename, margin + 4, contentY)
                contentY += 5
              }
            } catch (imgErr) {
              console.error('Failed to embed image:', imgErr)
              // Fallback: show as download link
              pdf.setFontSize(8)
              pdf.setTextColor(37, 99, 235)
              pdf.text(`🖼️ ${img.filename} (click to view)`, margin + 6, contentY)
              if (img.public_url) {
                const textWidth = pdf.getTextWidth(`🖼️ ${img.filename} (click to view)`)
                pdf.link(margin + 6, contentY - 3, textWidth, 5, { url: img.public_url })
              }
              contentY += 6
            }
          }
        }

        // File attachments with clickable download links
        if (fileAttachments.length > 0) {
          contentY += 4

          // Check if we need new page for attachments section
          const attSectionHeight = 8 + fileAttachments.length * 7
          if (contentY + attSectionHeight > pageHeight - margin) {
            pdf.addPage()
            contentY = margin + 5
          }

          pdf.setFillColor(248, 250, 252)
          pdf.roundedRect(margin + 2, contentY - 3, maxWidth - 4, 6 + fileAttachments.length * 7, 2, 2, 'F')

          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(71, 85, 105)
          pdf.text(`ATTACHMENTS (${fileAttachments.length}) - Click to download:`, margin + 5, contentY + 2)
          contentY += 7

          pdf.setFont('helvetica', 'normal')
          for (const att of fileAttachments) {
            pdf.setTextColor(37, 99, 235)
            const attText = `↓ ${att.filename} (${formatBytes(att.size_bytes)})`
            pdf.text(attText.substring(0, 70), margin + 6, contentY)

            if (att.public_url) {
              const textWidth = pdf.getTextWidth(attText.substring(0, 70))
              pdf.link(margin + 6, contentY - 3, textWidth, 5, { url: att.public_url })
            }
            contentY += 6
          }
        }

        contentY += 3

        // Via user
        pdf.setFontSize(7)
        pdf.setTextColor(156, 163, 175)
        pdf.text(`via ${email.user_name}`, margin + maxWidth - 4, contentY, { align: 'right' })
        contentY += 5

        // Draw separator line between emails
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.3)
        pdf.line(margin, contentY, margin + maxWidth, contentY)

        yPos = contentY + 8
      }

      // Add page numbers
      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(8)
        pdf.setTextColor(150, 150, 150)
        pdf.text(
          `Page ${i} of ${totalPages} | Generated by ByeTalk CRM`,
          pageWidth / 2,
          pageHeight - 5,
          { align: 'center' }
        )
      }

      pdf.save(`email-export-${searchEmail.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`)
    } catch (err) {
      console.error('PDF generation error:', err)
      setError('Failed to generate PDF')
    }

    setGeneratingPdf(false)
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Mail className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Email Export</h1>
            <p className="text-gray-400">Export email conversations by email address</p>
          </div>
        </div>
      </div>

      {/* Search Controls */}
      <div className="glass-card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Email Address */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Address to Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="person@example.com"
                className="w-full pl-10 pr-4 py-3 glass-input"
              />
            </div>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">From Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full pl-10 pr-4 py-3 glass-input"
              />
            </div>
          </div>

          {/* Date To */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">To Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full pl-10 pr-4 py-3 glass-input"
              />
            </div>
          </div>
        </div>

        {/* User Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-300">
              Search in accounts ({users.length} users with email)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedUsers(users.map((u) => u.id))}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select All
              </button>
              <span className="text-gray-500">|</span>
              <button
                onClick={() => setSelectedUsers([])}
                className="text-xs text-gray-400 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto glass-input p-3 rounded-xl">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => toggleUser(user.id)}
                className={`flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
                  selectedUsers.includes(user.id)
                    ? 'bg-blue-500/20 border border-blue-500/50'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {user.first_name?.[0]}
                  {user.last_name?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              </button>
            ))}
          </div>
          {selectedUsers.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">
              No users selected - will search all users&apos; email accounts
            </p>
          )}
        </div>

        {/* Export Button */}
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl disabled:opacity-50 transition-colors"
          >
            {exporting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Mail className="w-5 h-5" />
            )}
            Search Emails
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500/50 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300">{error}</p>
          </div>
        )}
      </div>

      {/* Results */}
      {emails && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Mail className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold text-white">Email Results</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadPDF}
                disabled={generatingPdf || emails.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {generatingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Download PDF
              </button>
              <button
                onClick={() =>
                  downloadJSON(emails, `email-export-${searchEmail}-${Date.now()}.json`)
                }
                className="flex items-center gap-2 px-4 py-2 glass-button rounded-lg text-sm"
              >
                <FileJson className="w-4 h-4" />
                Download JSON
              </button>
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-input p-4 rounded-xl">
                <p className="text-2xl font-bold text-blue-400">{summary.totalEmails}</p>
                <p className="text-sm text-gray-400">Total Emails</p>
              </div>
              <div className="glass-input p-4 rounded-xl">
                <p className="text-2xl font-bold text-yellow-400">{summary.totalAttachments}</p>
                <p className="text-sm text-gray-400">Attachments</p>
              </div>
              <div className="glass-input p-4 rounded-xl">
                <p className="text-2xl font-bold text-white">{summary.usersSearched}</p>
                <p className="text-sm text-gray-400">Accounts Searched</p>
              </div>
              <div className="glass-input p-4 rounded-xl">
                <p className="text-2xl font-bold text-green-400">
                  {Object.keys(summary.byDate).length}
                </p>
                <p className="text-sm text-gray-400">Days with Emails</p>
              </div>
            </div>
          )}

          <div className="space-y-4 max-h-[800px] overflow-y-auto">
            {emails.map((email) => {
              // Get ALL image attachments (both inline and regular)
              const allImages = email.attachments.filter(
                (a) => a.content_type?.startsWith('image/') && a.public_url
              )
              // Non-image attachments for download section
              const nonImageAttachments = email.attachments.filter(
                (a) => !a.content_type?.startsWith('image/')
              )

              return (
                <div
                  key={email.id}
                  className={`rounded-xl border overflow-hidden ${
                    email.is_inbound
                      ? 'bg-blue-500/5 border-blue-500/30'
                      : 'bg-green-500/5 border-green-500/30'
                  }`}
                >
                  {/* Header */}
                  <div className="p-4 border-b border-white/5">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        {email.is_inbound ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded text-xs text-blue-400 font-medium">
                            <ArrowDownToLine className="w-3 h-3" />
                            RECEIVED
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 rounded text-xs text-green-400 font-medium">
                            <ArrowUpFromLine className="w-3 h-3" />
                            SENT
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(email.sent_at || email.created_at)}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm">
                      <div>
                        <span className="text-gray-500">From:</span>{' '}
                        <span className="text-white">{email.from_name || email.from_address}</span>
                        {email.from_name && (
                          <span className="text-gray-500 ml-1">&lt;{email.from_address}&gt;</span>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-500">To:</span>{' '}
                        <span className="text-gray-300">
                          {email.to_addresses.map((t) => t.email).join(', ')}
                        </span>
                      </div>
                    </div>

                    <p className="text-white font-medium mt-3">{email.subject || '(No subject)'}</p>
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    {email.body_html ? (
                      <div
                        className="text-sm text-gray-300 prose prose-invert prose-sm max-w-none [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_a]:text-blue-400"
                        dangerouslySetInnerHTML={{
                          __html: processEmailHtml(email.body_html, email.attachments),
                        }}
                      />
                    ) : (
                      <p className="text-sm text-gray-400 whitespace-pre-wrap">
                        {email.body_text || '[No content]'}
                      </p>
                    )}

                    {/* Always show all image attachments */}
                    {allImages.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 uppercase font-medium mb-2">
                          📷 Images in this email ({allImages.length}):
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {allImages.map((img) => (
                            <a
                              key={img.id}
                              href={img.public_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg overflow-hidden border border-white/10 hover:border-white/20 transition-colors bg-black/20"
                            >
                              <img
                                src={img.public_url!}
                                alt={img.filename}
                                className="w-full h-auto"
                                onError={(e) => {
                                  // Hide broken images
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                              <div className="p-2 text-xs text-gray-400 truncate">
                                {img.filename}
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Attachments Section - Show files (non-images) */}
                  {nonImageAttachments.length > 0 && (
                    <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-t border-white/10">
                      <div className="flex items-center gap-2 mb-3">
                        <Download className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-bold text-white uppercase tracking-wide">
                          Download Files ({nonImageAttachments.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {nonImageAttachments
                          .filter((att) => att.public_url)
                          .map((att) => (
                            <a
                              key={att.id}
                              href={att.public_url!}
                              download={att.filename}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-all group border border-white/10 hover:border-blue-400/50"
                            >
                              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl flex-shrink-0 shadow-lg">
                                {att.content_type?.startsWith('image/') ? (
                                  '🖼️'
                                ) : att.content_type?.includes('pdf') ? (
                                  '📕'
                                ) : att.content_type?.includes('word') ? (
                                  '📘'
                                ) : att.content_type?.includes('excel') ||
                                  att.content_type?.includes('spreadsheet') ? (
                                  '📗'
                                ) : att.content_type?.includes('video') ? (
                                  '🎬'
                                ) : att.content_type?.includes('audio') ? (
                                  '🎵'
                                ) : att.content_type?.includes('zip') ||
                                  att.content_type?.includes('compressed') ? (
                                  '📦'
                                ) : (
                                  '📄'
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white font-medium truncate">
                                  {att.filename}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {formatBytes(att.size_bytes)} • {att.content_type || 'Unknown type'}
                                  {att.is_inline && ' • Inline'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 text-blue-400 group-hover:text-blue-300 flex-shrink-0">
                                <span className="text-sm font-medium hidden sm:block">Download</span>
                                <Download className="w-5 h-5" />
                              </div>
                            </a>
                          ))}
                        {email.attachments.filter((att) => !att.public_url).length > 0 && (
                          <p className="text-xs text-gray-500 italic">
                            {email.attachments.filter((att) => !att.public_url).length} attachment(s) not available for download
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-4 py-2 border-t border-white/5">
                    <span className="text-xs text-gray-500">via {email.user_name}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Info Notice */}
      <div className="glass-card p-4 border-l-4 border-blue-400">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-medium text-white mb-1">About Email Export:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Searches all synced emails from ByeTalk email accounts</li>
              <li>Finds emails where the searched address is in From, To, or CC</li>
              <li>Attachments are included in the JSON export with download links</li>
              <li>PDF export includes email content and attachment info</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
