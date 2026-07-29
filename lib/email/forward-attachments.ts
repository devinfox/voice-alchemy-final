import { EmailAttachment } from '@/types/email.types'

function isCalendarAttachment(att: EmailAttachment): boolean {
  const type = (att.content_type || '').toLowerCase()
  const name = (att.filename || '').toLowerCase()
  if (type.includes('text/calendar') || type.includes('application/ics')) return true
  return /\.(ics|ical|ifb|vcs|calendar)$/i.test(name)
}

/** File attachments to include when forwarding (excludes inline images and calendar invites). */
export function isForwardableAttachment(att: EmailAttachment): boolean {
  if (att.is_inline) return false
  if ((att.size_bytes ?? 0) <= 0) return false
  if (isCalendarAttachment(att)) return false
  return true
}

export function getForwardableAttachments(attachments?: EmailAttachment[]): EmailAttachment[] {
  if (!attachments?.length) return []
  return attachments.filter(isForwardableAttachment)
}

export async function fetchEmailAttachmentAsFile(att: EmailAttachment): Promise<File | null> {
  try {
    const url = att.public_url || `/api/email/attachments/${att.id}`
    const response = await fetch(url)
    if (!response.ok) {
      console.error('[Forward] Failed to fetch attachment:', att.filename, response.status)
      return null
    }
    const blob = await response.blob()
    return new File([blob], att.filename, {
      type: att.content_type || blob.type || 'application/octet-stream',
    })
  } catch (err) {
    console.error('[Forward] Failed to load attachment:', att.filename, err)
    return null
  }
}

export async function loadForwardAttachments(attachments?: EmailAttachment[]): Promise<File[]> {
  const forwardable = getForwardableAttachments(attachments)
  if (!forwardable.length) return []

  const results = await Promise.all(forwardable.map(fetchEmailAttachmentAsFile))
  return results.filter((f): f is File => f !== null)
}