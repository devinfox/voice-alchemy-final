/** Stub: calendar invite sync from email is optional in VAAA. */

export interface EmailInvite {
  id?: string
  title?: string
  summary?: string | null
  start?: string | null
  end?: string | null
  startUtc?: string | null
  endUtc?: string | null
  isAllDay?: boolean
  location?: string | null
  meetingUrl?: string | null
  meetingProvider?: string | null
  organizer?: string | null
  organizerName?: string | null
  organizerEmail?: string | null
  attendeeCount?: number
  method?: string | null
  status?: string | null
}

export async function syncCalendarInvitesForEmail(..._args: unknown[]): Promise<EmailInvite[]> {
  return []
}

export async function getEmailInvites(..._args: unknown[]): Promise<EmailInvite[]> {
  return []
}
