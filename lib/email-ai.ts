import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { findMatchingFunnelForEmail } from './funnel-matcher'
import { detectPresentationRequest, hasEnoughInfoForPresentation } from './presentation-detector'
import { extractMemoriesFromEmail } from './nimbus-contact-analyzer'
import { isNimbusAnalysisEnabled } from './nimbus/config'
import { ByeTalkAttachmentRef, listByeTalkFilesForEmail } from './email/byetalk-file-utils'
import { shouldProcessEmailForAI, isKnownCRMContact } from './email-filters'

// Lazy initialization to avoid errors when API key is missing
let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface EmailAIAnalysis {
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
  sentiment_score: number // -1 to 1
  intent: string // inquiry, follow_up, complaint, urgent, informational, commitment, request
  urgency_score: number // 0-100
  action_items: string[]
  key_topics: string[]
  commitments: Array<{
    who: 'sender' | 'recipient'
    what: string
    when: string | null
    parsed_due_at: string | null
  }>
  requests: Array<{
    from: 'sender' | 'recipient'
    to: 'sender' | 'recipient'
    what: string
    urgency: 'low' | 'medium' | 'high' | 'urgent'
    parsed_due_at: string | null
  }>
  // Extracted sender info (for inbound emails)
  extracted_sender_info?: {
    first_name: string | null
    last_name: string | null
    phone: string | null
    company: string | null
    job_title: string | null
    city: string | null
    state: string | null
  }
}

export interface TaskFromEmail {
  title: string
  description: string
  due_at: string | null
  priority: number // 1-5
  task_type: string
}

interface InboundDraftContext {
  requestText: string
  hints: string[]
}

function normalizeRecipientEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry) return null
      if (typeof entry === 'string') return entry
      if (typeof entry === 'object' && 'email' in entry) {
        const email = (entry as { email?: unknown }).email
        return typeof email === 'string' ? email : null
      }
      return null
    })
    .filter((value): value is string => typeof value === 'string' && value.length > 3)
}

function extractInboundFileRequest(
  analysis: EmailAIAnalysis | null,
  subject: string | null,
  bodyText: string | null,
  bodyHtml: string | null
): InboundDraftContext | null {
  if (!analysis) return null

  const content = `${subject || ''}\n${bodyText || stripHtmlBasic(bodyHtml || '')}`.toLowerCase()
  const requestTexts = (analysis.requests || [])
    .filter((request) => request.to === 'recipient' && typeof request.what === 'string')
    .map((request) => request.what.trim())
    .filter(Boolean)

  const combinedRequest = requestTexts.join(' ').toLowerCase()
  const combined = `${content}\n${combinedRequest}`

  const asksToSend = /(send|email|share|forward|attach|provide)\b/.test(combined)
  const asksForAsset = /(brand guide|style guide|pricing|proposal|agreement|document|deck|slides|pdf|file|brochure|one[- ]pager|sheet)\b/.test(combined)
  if (!asksToSend || !asksForAsset) return null

  const hints = new Set<string>()
  if (combined.includes('brand guide')) hints.add('brand guide')
  if (combined.includes('style guide')) hints.add('style guide')
  if (combined.includes('pricing')) hints.add('pricing')
  if (combined.includes('proposal')) hints.add('proposal')
  if (combined.includes('agreement')) hints.add('agreement')
  if (combined.includes('deck') || combined.includes('slides') || combined.includes('presentation')) hints.add('presentation')
  if (combined.includes('brochure')) hints.add('brochure')
  if (combined.includes('one-pager') || combined.includes('one pager')) hints.add('one pager')
  if (combined.includes('sheet')) hints.add('sheet')
  if (hints.size === 0) hints.add('document')

  return {
    requestText: requestTexts[0] || `Please send requested file from email subject: ${subject || '(no subject)'}`,
    hints: Array.from(hints),
  }
}

function scoreFileNameAgainstHints(name: string, hints: string[]): number {
  const lower = name.toLowerCase()
  let score = 0
  for (const hint of hints) {
    const hintWords = hint.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
    for (const word of hintWords) {
      if (lower.includes(word)) score += 2
    }
  }
  if (/(brand|style|guide)/.test(lower)) score += 1
  if (/(pricing|rate|budget|cost|quote)/.test(lower)) score += 1
  if (/(proposal|agreement|contract)/.test(lower)) score += 1
  return score
}

/**
 * Parse time references like "EOD", "tomorrow", "by Friday" into actual dates
 */
function parseTimeReference(timeRef: string | null, userTimezone: string = 'America/Los_Angeles'): string | null {
  if (!timeRef) return null

  const now = new Date()
  const lowerRef = timeRef.toLowerCase().trim()

  // End of day (5pm local time)
  if (lowerRef.includes('eod') || lowerRef.includes('end of day') || lowerRef.includes('end of the day') || lowerRef.includes('today')) {
    const eod = new Date(now)
    eod.setHours(17, 0, 0, 0) // 5pm
    return eod.toISOString()
  }

  // Tomorrow
  if (lowerRef.includes('tomorrow')) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (lowerRef.includes('morning')) {
      tomorrow.setHours(9, 0, 0, 0)
    } else if (lowerRef.includes('eod') || lowerRef.includes('end of day')) {
      tomorrow.setHours(17, 0, 0, 0)
    } else {
      tomorrow.setHours(17, 0, 0, 0) // Default to EOD tomorrow
    }
    return tomorrow.toISOString()
  }

  // End of week
  if (lowerRef.includes('end of week') || lowerRef.includes('eow')) {
    const friday = new Date(now)
    const daysUntilFriday = (5 - friday.getDay() + 7) % 7 || 7
    friday.setDate(friday.getDate() + daysUntilFriday)
    friday.setHours(17, 0, 0, 0)
    return friday.toISOString()
  }

  // Day of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (let i = 0; i < days.length; i++) {
    if (lowerRef.includes(days[i])) {
      const targetDay = new Date(now)
      const currentDay = targetDay.getDay()
      const daysUntil = (i - currentDay + 7) % 7 || 7
      targetDay.setDate(targetDay.getDate() + daysUntil)
      targetDay.setHours(17, 0, 0, 0)
      return targetDay.toISOString()
    }
  }

  // ASAP / urgent
  if (lowerRef.includes('asap') || lowerRef.includes('urgent') || lowerRef.includes('immediately')) {
    const urgent = new Date(now)
    urgent.setHours(urgent.getHours() + 2) // 2 hours from now
    return urgent.toISOString()
  }

  // Try to parse as a date
  try {
    const parsed = new Date(timeRef)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  } catch {
    // Not a valid date
  }

  return null
}

/**
 * Analyze an email using OpenAI to extract actionable items, commitments, and requests
 */
export async function analyzeEmail(
  emailId: string,
  fromAddress: string,
  fromName: string | null,
  toAddresses: string[],
  subject: string | null,
  bodyText: string | null,
  bodyHtml: string | null,
  isInbound: boolean,
  userTimezone: string = 'America/Los_Angeles'
): Promise<EmailAIAnalysis | null> {
  if (!isNimbusAnalysisEnabled()) {
    console.log('[email-ai] Skipped email analysis — Nimbus analysis is disabled')
    return null
  }
  // Use plain text or strip HTML
  const content = bodyText || stripHtmlBasic(bodyHtml || '')
  if (!content || content.trim().length < 10) {
    return null
  }

  const prompt = `Analyze this email and extract actionable information.

EMAIL METADATA:
- From: ${fromName ? `${fromName} <${fromAddress}>` : fromAddress}
- To: ${toAddresses.join(', ')}
- Subject: ${subject || '(no subject)'}
- Direction: ${isInbound ? 'INBOUND (received by CRM user)' : 'OUTBOUND (sent by CRM user)'}

EMAIL CONTENT:
${content.substring(0, 4000)}

Analyze this email and respond with a JSON object containing:

1. "summary": A 1-2 sentence summary of the email's main point
2. "sentiment": One of "positive", "neutral", or "negative"
3. "sentiment_score": A number from -1 (very negative) to 1 (very positive)
4. "intent": The primary intent - one of: "inquiry", "follow_up", "complaint", "urgent", "informational", "commitment", "request", "greeting", "scheduling", "negotiation"
5. "urgency_score": 0-100 score indicating how urgent this email is (100 = extremely urgent)
6. "action_items": Array of specific action items mentioned in the email
7. "key_topics": Array of main topics discussed (max 5)
8. "commitments": Array of commitments/promises made, each with:
   - "who": "sender" or "recipient" (who made the commitment)
   - "what": What they committed to
   - "when": The timeframe mentioned (e.g., "EOD today", "by Friday", "tomorrow", null if not specified)
   - "parsed_due_at": null (will be filled in by system)
9. "requests": Array of requests made, each with:
   - "from": "sender" or "recipient" (who is making the request)
   - "to": "sender" or "recipient" (who should fulfill it)
   - "what": What is being requested
   - "urgency": "low", "medium", "high", or "urgent"
   - "parsed_due_at": null (will be filled in by system)
${isInbound ? `
10. "extracted_sender_info": Extract the SENDER's contact information from the email body and signature:
   - "first_name": Sender's first name (from signature, sign-off like "Best, John", or email intro)
   - "last_name": Sender's last name (from signature block)
   - "phone": Phone number if mentioned in signature or body (format as digits only, e.g., "5551234567")
   - "company": Company/organization name from signature
   - "job_title": Job title/position from signature
   - "city": City if mentioned in signature or address
   - "state": State if mentioned in signature or address

   SIGNATURE PARSING TIPS:
   - Look for signature blocks at the end of the email (after "Best,", "Thanks,", "Regards,", etc.)
   - Common signature format: Name, Title, Company, Phone, Address
   - Phone formats to recognize: (555) 123-4567, 555-123-4567, 555.123.4567, +1 555 123 4567
   - Extract the SENDER's info, not the recipient's
   - If the "From" header has a name, use that as fallback for first/last name
   - Leave fields as null if not found - don't guess` : ''}

Focus on identifying actionable items that should become tasks. Pay special attention to:
- Deadlines mentioned (EOD, by Friday, tomorrow, etc.)
- Promises to send documents, information, or follow up
- Requests for the recipient to do something
- Meeting requests or scheduling needs

Respond ONLY with the JSON object, no markdown formatting.`

  try {
    const openai = getOpenAI()
    if (!openai) {
      console.log('OpenAI API key not configured, skipping email analysis')
      return null
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert email analyzer for a CRM system. Your job is to extract actionable information, commitments, and requests from emails. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    })

    const responseText = response.choices[0]?.message?.content?.trim()
    if (!responseText) {
      console.error('Empty response from OpenAI for email analysis')
      return null
    }

    // Parse JSON (handle potential markdown code blocks)
    let jsonStr = responseText
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const analysis = JSON.parse(jsonStr) as EmailAIAnalysis

    // Parse time references in commitments
    if (analysis.commitments) {
      analysis.commitments = analysis.commitments.map(c => ({
        ...c,
        parsed_due_at: parseTimeReference(c.when, userTimezone)
      }))
    }

    // Parse time references in requests
    if (analysis.requests) {
      analysis.requests = analysis.requests.map(r => ({
        ...r,
        parsed_due_at: parseTimeReference(
          r.urgency === 'urgent' ? 'ASAP' : null,
          userTimezone
        )
      }))
    }

    return analysis
  } catch (error) {
    console.error('Error analyzing email with OpenAI:', error)
    return null
  }
}

/**
 * Generate tasks from email analysis
 */
export function generateTasksFromAnalysis(
  analysis: EmailAIAnalysis,
  isInbound: boolean,
  fromAddress: string,
  subject: string | null
): TaskFromEmail[] {
  const tasks: TaskFromEmail[] = []

  // Create tasks from commitments (what we promised to do)
  for (const commitment of analysis.commitments || []) {
    // For inbound emails, "recipient" commitments are things WE need to do
    // For outbound emails, "sender" commitments are things WE need to do
    const isOurCommitment = isInbound
      ? commitment.who === 'recipient'
      : commitment.who === 'sender'

    if (isOurCommitment && commitment.what) {
      tasks.push({
        title: commitment.what.length > 100
          ? commitment.what.substring(0, 97) + '...'
          : commitment.what,
        description: `Commitment from email: "${subject || '(no subject)'}"\n\nOriginal commitment: ${commitment.what}\nTimeframe: ${commitment.when || 'Not specified'}`,
        due_at: commitment.parsed_due_at,
        priority: commitment.parsed_due_at ? 4 : 3, // Higher priority if there's a deadline
        task_type: 'follow_up'
      })
    }
  }

  // Create tasks from requests (things others asked us to do)
  for (const request of analysis.requests || []) {
    // For inbound emails, requests TO "recipient" are for US
    // For outbound emails, requests TO "sender" are for US
    const isRequestForUs = isInbound
      ? request.to === 'recipient'
      : request.to === 'sender'

    if (isRequestForUs && request.what) {
      const priorityMap: Record<string, number> = {
        'urgent': 5,
        'high': 4,
        'medium': 3,
        'low': 2
      }

      tasks.push({
        title: request.what.length > 100
          ? request.what.substring(0, 97) + '...'
          : request.what,
        description: `Request from ${fromAddress} in email: "${subject || '(no subject)'}"\n\nRequest: ${request.what}\nUrgency: ${request.urgency}`,
        due_at: request.parsed_due_at,
        priority: priorityMap[request.urgency] || 3,
        task_type: 'follow_up'
      })
    }
  }

  // If high urgency but no specific tasks, create a general follow-up task
  if (tasks.length === 0 && analysis.urgency_score >= 70) {
    tasks.push({
      title: `Urgent: Respond to "${subject || 'email'}"`,
      description: `High urgency email from ${fromAddress}\n\nSummary: ${analysis.summary}\n\nKey topics: ${analysis.key_topics?.join(', ') || 'N/A'}`,
      due_at: parseTimeReference('today'),
      priority: 4,
      task_type: 'follow_up'
    })
  }

  return tasks
}

/**
 * Basic HTML stripping (for when email-utils isn't available)
 */
function stripHtmlBasic(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Find lead/contact by email address
 */
export async function findLeadOrContactByEmail(email: string, organizationId: string | null): Promise<{
  lead_id: string | null
  contact_id: string | null
  lead_name: string | null
  contact_name: string | null
}> {
  const normalizedEmail = email.toLowerCase().trim()

  // Org isolation: matching runs with the service-role client (RLS bypassed),
  // so we MUST scope every lookup to the caller's organization. With no org we
  // refuse to match rather than risk linking across organizations.
  if (!organizationId) {
    return { lead_id: null, contact_id: null, lead_name: null, contact_name: null }
  }

  // Prefer contacts (client-side entity) so converted leads stay archived/frozen.
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, first_name, last_name')
    .ilike('email', normalizedEmail)
    .eq('organization_id', organizationId)
    .eq('is_deleted', false)
    .limit(1)
    .single()

  if (contact) {
    return {
      lead_id: null,
      contact_id: contact.id,
      lead_name: null,
      contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || null
    }
  }

  // Search leads second, but do not attach to converted leads.
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, first_name, last_name, status, converted_contact_id')
    .ilike('email', normalizedEmail)
    .eq('organization_id', organizationId)
    .eq('is_deleted', false)
    .limit(1)
    .single()

  if (lead) {
    if (lead.status === 'converted') {
      if (lead.converted_contact_id) {
        const { data: convertedContact } = await supabaseAdmin
          .from('contacts')
          .select('id, first_name, last_name')
          .eq('id', lead.converted_contact_id)
          .eq('organization_id', organizationId)
          .eq('is_deleted', false)
          .single()

        if (convertedContact) {
          return {
            lead_id: null,
            contact_id: convertedContact.id,
            lead_name: null,
            contact_name: `${convertedContact.first_name || ''} ${convertedContact.last_name || ''}`.trim() || null
          }
        }
      }

      return {
        lead_id: null,
        contact_id: null,
        lead_name: null,
        contact_name: null
      }
    }

    return {
      lead_id: lead.id,
      contact_id: null,
      lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null,
      contact_name: null
    }
  }

  return {
    lead_id: null,
    contact_id: null,
    lead_name: null,
    contact_name: null
  }
}

async function resolveConvertedLeadToContact(leadId: string | null, organizationId: string | null): Promise<{
  leadId: string | null
  contactId: string | null
}> {
  if (!leadId || !organizationId) {
    return { leadId, contactId: null }
  }

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, status, converted_contact_id')
    .eq('id', leadId)
    .eq('organization_id', organizationId)
    .eq('is_deleted', false)
    .single()

  if (!lead) {
    return { leadId, contactId: null }
  }

  if (lead.status === 'converted' && lead.converted_contact_id) {
    return { leadId: null, contactId: lead.converted_contact_id }
  }

  return { leadId: lead.id, contactId: null }
}

/**
 * Normalize phone number by removing all non-digit characters
 */
function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Find lead by phone number
 * Searches both phone and phone_secondary fields
 */
export async function findLeadByPhone(phoneNumber: string, organizationId: string | null): Promise<{
  lead_id: string | null
  lead_name: string | null
  lead_email: string | null
}> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber)

  if (!normalizedPhone || normalizedPhone.length < 10) {
    return { lead_id: null, lead_name: null, lead_email: null }
  }

  // Org isolation: phone numbers are not globally unique, so an unscoped match
  // would link across organizations. No org → no match.
  if (!organizationId) {
    return { lead_id: null, lead_name: null, lead_email: null }
  }

  // Try exact match first (with or without country code)
  const phoneVariants = [
    normalizedPhone,
    normalizedPhone.slice(-10), // Last 10 digits (without country code)
    `1${normalizedPhone.slice(-10)}`, // With US country code
  ]

  // Search leads by phone or phone_secondary
  for (const variant of phoneVariants) {
    // Check primary phone
    const { data: leadByPhone } = await supabaseAdmin
      .from('leads')
      .select('id, first_name, last_name, email')
      .or(`phone.ilike.%${variant}%,phone_secondary.ilike.%${variant}%`)
      .eq('organization_id', organizationId)
      .eq('is_deleted', false)
      .limit(1)
      .single()

    if (leadByPhone) {
      return {
        lead_id: leadByPhone.id,
        lead_name: `${leadByPhone.first_name || ''} ${leadByPhone.last_name || ''}`.trim() || null,
        lead_email: leadByPhone.email || null
      }
    }
  }

  return { lead_id: null, lead_name: null, lead_email: null }
}

/**
 * Create activity log entry for email
 */
export async function createEmailActivityLog(
  emailId: string,
  isInbound: boolean,
  userId: string | null,
  leadId: string | null,
  contactId: string | null,
  dealId: string | null,
  subject: string | null,
  fromAddress: string
): Promise<void> {
  const eventType = isInbound ? 'email_received' : 'email_sent'
  const description = isInbound
    ? `Email received from ${fromAddress}: "${subject || '(no subject)'}"`
    : `Email sent: "${subject || '(no subject)'}"`

  await supabaseAdmin.from('activity_log').insert({
    event_type: eventType,
    event_description: description,
    user_id: userId,
    entity_type: 'email',
    entity_id: emailId,
    email_id: emailId,
    lead_id: leadId,
    contact_id: contactId,
    deal_id: dealId,
    metadata: {
      subject,
      from_address: fromAddress,
      is_inbound: isInbound
    }
  })
}

/**
 * Create tasks from email analysis
 */
export async function createTasksFromEmail(
  tasks: TaskFromEmail[],
  emailId: string,
  assignedTo: string,
  leadId: string | null,
  contactId: string | null,
  dealId: string | null
): Promise<string[]> {
  const createdTaskIds: string[] = []
  const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

  const { data: existingTasks } = await supabaseAdmin
    .from('tasks')
    .select('id, title')
    .eq('assigned_to', assignedTo)
    .eq('email_id', emailId)
    .eq('is_deleted', false)
    .in('status', ['pending', 'in_progress', 'completed'])

  const existingTitles = new Set((existingTasks || []).map((task) => normalized(task.title || '')))

  for (const task of tasks) {
    const normalizedTitle = normalized(task.title || '')
    if (normalizedTitle && existingTitles.has(normalizedTitle)) {
      continue
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        title: task.title,
        description: task.description,
        assigned_to: assignedTo,
        email_id: emailId,
        lead_id: leadId,
        contact_id: contactId,
        deal_id: dealId,
        due_at: task.due_at,
        priority: task.priority,
        task_type: task.task_type,
        source: 'ai_email_analysis',
        status: 'pending'
      })
      .select('id')
      .single()

    if (data && !error) {
      createdTaskIds.push(data.id)
      if (normalizedTitle) {
        existingTitles.add(normalizedTitle)
      }

      // Log task creation
      await supabaseAdmin.from('activity_log').insert({
        event_type: 'task_created',
        event_description: `AI-generated task from email: ${task.title}`,
        user_id: assignedTo,
        entity_type: 'task',
        entity_id: data.id,
        email_id: emailId,
        lead_id: leadId,
        contact_id: contactId,
        deal_id: dealId,
        metadata: {
          source: 'ai_email_analysis',
          task_title: task.title,
          due_at: task.due_at
        }
      })
    } else if (error) {
      console.error('Error creating task from email:', error)
    }
  }

  return createdTaskIds
}

/**
 * Update email with AI analysis results
 */
export async function updateEmailWithAnalysis(
  emailId: string,
  analysis: EmailAIAnalysis,
  tasksGenerated: boolean
): Promise<void> {
  await supabaseAdmin
    .from('emails')
    .update({
      ai_analysis_status: 'completed',
      ai_analyzed_at: new Date().toISOString(),
      ai_tasks_generated: tasksGenerated,
      ai_processed_at: new Date().toISOString(),
      ai_summary: analysis.summary,
      ai_sentiment: analysis.sentiment,
      ai_sentiment_score: analysis.sentiment_score,
      ai_intent: analysis.intent,
      ai_urgency_score: analysis.urgency_score,
      ai_action_items: analysis.action_items,
      ai_key_topics: analysis.key_topics,
      ai_commitments: analysis.commitments,
      ai_requests: analysis.requests,
      ai_raw_response: analysis
    })
    .eq('id', emailId)
}

/**
 * Link email to lead/contact
 */
export async function linkEmailToLeadOrContact(
  emailId: string,
  leadId: string | null,
  contactId: string | null,
  linkType: 'from' | 'to' | 'cc' | 'bcc' = 'from'
): Promise<void> {
  if (!leadId && !contactId) return

  // Update the email record
  await supabaseAdmin
    .from('emails')
    .update({
      lead_id: leadId,
      contact_id: contactId
    })
    .eq('id', emailId)

  // Also update the thread
  const { data: email } = await supabaseAdmin
    .from('emails')
    .select('thread_id')
    .eq('id', emailId)
    .single()

  if (email?.thread_id) {
    await supabaseAdmin
      .from('email_threads')
      .update({
        lead_id: leadId,
        contact_id: contactId
      })
      .eq('id', email.thread_id)
  }

  // Create link record for many-to-many tracking
  await supabaseAdmin
    .from('email_lead_links')
    .upsert({
      email_id: emailId,
      lead_id: leadId,
      contact_id: contactId,
      link_type: linkType,
      auto_linked: true
    }, {
      onConflict: leadId ? 'email_id,lead_id,link_type' : 'email_id,contact_id,link_type'
    })
}

async function createInboundClientReplyDraft(input: {
  emailId: string
  accountUserId: string
  fromAddress: string
  fromName: string | null
  subject: string | null
  linkedLead: string | null
  linkedContact: string | null
  request: InboundDraftContext
}): Promise<boolean> {
  const draftFingerprint = `inbound_email_request:${input.emailId}`
  const { data: existingDraft } = await supabaseAdmin
    .from('email_drafts')
    .select('id')
    .eq('user_id', input.accountUserId)
    .eq('commitment_quote', draftFingerprint)
    .limit(1)
    .single()

  if (existingDraft?.id) return false

  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, organization_id')
    .eq('id', input.accountUserId)
    .single()

  let contactCompanyId: string | null = null
  let pmCompanyId: string | null = null
  let contactName = input.fromName || null
  let effectiveLeadId = input.linkedLead
  let effectiveContactId = input.linkedContact

  if (effectiveLeadId && !effectiveContactId) {
    const resolved = await resolveConvertedLeadToContact(effectiveLeadId, userProfile?.organization_id || null)
    effectiveLeadId = resolved.leadId
    effectiveContactId = resolved.contactId
  }

  if (effectiveContactId) {
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, first_name, last_name, company_id, email')
      .eq('id', effectiveContactId)
      .single()
    if (contact) {
      contactCompanyId = contact.company_id || null
      contactName =
        `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
        input.fromName ||
        null
    }
  }

  if (!pmCompanyId) {
    const { data: pmContact } = await supabaseAdmin
      .from('pm_contacts')
      .select('id, company_id, first_name, last_name')
      .ilike('email', input.fromAddress.toLowerCase().trim())
      .eq('is_deleted', false)
      .limit(1)
      .single()

    if (pmContact) {
      pmCompanyId = pmContact.company_id || null
      if (!contactName) {
        contactName = `${pmContact.first_name || ''} ${pmContact.last_name || ''}`.trim() || null
      }
    }
  }

  let companyName: string | null = null
  if (contactCompanyId) {
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .eq('id', contactCompanyId)
      .single()
    companyName = company?.name || null
  }
  if (!companyName && pmCompanyId) {
    const { data: pmCompany } = await supabaseAdmin
      .from('pm_companies')
      .select('id, name')
      .eq('id', pmCompanyId)
      .single()
    companyName = pmCompany?.name || null
  }

  let matchedAttachments: ByeTalkAttachmentRef[] = []

  if (contactCompanyId || pmCompanyId) {
    const { data: projects } = await supabaseAdmin
      .from('pm_projects')
      .select('id')
      .in('company_id', [contactCompanyId, pmCompanyId].filter(Boolean) as string[])
      .eq('is_deleted', false)

    const projectIds = (projects || []).map((project) => project.id)
    if (projectIds.length > 0) {
      const { data: projectFiles } = await supabaseAdmin
        .from('pm_project_files')
        .select('id, name, reference_type, reference_id')
        .in('project_id', projectIds)
        .eq('is_deleted', false)
        .limit(120)

      const scored = (projectFiles || [])
        .map((file) => {
          let kind: ByeTalkAttachmentRef['kind'] = 'project_file'
          let id = file.id
          if (
            (file.reference_type === 'document' ||
              file.reference_type === 'sheet' ||
              file.reference_type === 'presentation') &&
            file.reference_id
          ) {
            kind = file.reference_type
            id = file.reference_id
          }
          return {
            score: scoreFileNameAgainstHints(file.name || '', input.request.hints),
            ref: {
              kind,
              id,
              name: file.name || 'Client file',
              format: kind === 'sheet' ? 'xlsx' : undefined,
            } satisfies ByeTalkAttachmentRef,
          }
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)

      const dedup = new Map<string, ByeTalkAttachmentRef>()
      for (const entry of scored) {
        const key = `${entry.ref.kind}:${entry.ref.id}`
        if (!dedup.has(key)) dedup.set(key, entry.ref)
        if (dedup.size >= 3) break
      }
      matchedAttachments = Array.from(dedup.values())
    }
  }

  if (matchedAttachments.length === 0) {
    const pool = await listByeTalkFilesForEmail({
      organizationId: userProfile?.organization_id || null,
      limit: 120,
    })

    matchedAttachments = pool
      .map((item) => ({
        score: scoreFileNameAgainstHints(item.name, input.request.hints),
        ref: {
          kind: item.kind,
          id: item.id,
          name: item.name,
          format: item.kind === 'sheet' ? 'xlsx' : undefined,
        } satisfies ByeTalkAttachmentRef,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.ref)
  }

  const requestedFileLabel = matchedAttachments[0]?.name || input.request.hints[0] || 'requested file'
  const senderName = userProfile?.first_name || 'there'
  const clientName = contactName || input.fromAddress
  const subjectPrefix = companyName ? `${companyName} ` : ''
  const draftSubject = `Re: ${subjectPrefix}${requestedFileLabel}`
  const bodyHtml = `<p>Hi ${clientName},</p><p>I went ahead and attached ${companyName ? `${companyName}'s ` : ''}${requestedFileLabel} for you.</p><p>Let me know if you want me to send over anything else.</p><p>Best,<br>${senderName}</p>`
  const bodyText = `Hi ${clientName},\n\nI went ahead and attached ${companyName ? `${companyName}'s ` : ''}${requestedFileLabel} for you.\n\nLet me know if you want me to send over anything else.\n\nBest,\n${senderName}`

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('assigned_to', input.accountUserId)
    .eq('email_id', input.emailId)
    .eq('is_deleted', false)
    .ilike('title', `Reply to ${clientName}: send ${requestedFileLabel}`)
    .limit(1)
    .single()

  let taskId: string | null = task?.id || null
  if (!taskId) {
    const { data: createdTask } = await supabaseAdmin
      .from('tasks')
      .insert({
        title: `Reply to ${clientName}: send ${requestedFileLabel}`,
        description: `Inbound email request from ${input.fromAddress}.\n\nRequest: ${input.request.requestText}\n\n[email_id:${input.emailId}]`,
        assigned_to: input.accountUserId,
        due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        priority: 3,
        task_type: 'follow_up',
        source: 'ai_email_analysis',
        status: 'pending',
        email_id: input.emailId,
        lead_id: effectiveLeadId,
        contact_id: effectiveContactId,
      })
      .select('id')
      .single()

    taskId = createdTask?.id || null
  }

  const { error: draftError } = await supabaseAdmin
    .from('email_drafts')
    .insert({
      user_id: input.accountUserId,
      lead_id: effectiveLeadId,
      contact_id: effectiveContactId,
      from_account_id: null,
      to_email: input.fromAddress,
      to_name: clientName,
      subject: draftSubject,
      body_html: bodyHtml,
      body_text: bodyText,
      attachment_ids: [],
      byetalk_attachment_refs: matchedAttachments,
      due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      ai_generated: true,
      commitment_quote: draftFingerprint,
      task_id: taskId,
    })

  if (draftError) {
    console.error('[Email AI] Failed to create inbound request draft:', draftError)
    return false
  }

  const { data: existingNimbusAction } = await supabaseAdmin
    .from('nimbus_pending_actions')
    .select('id')
    .eq('user_id', input.accountUserId)
    .eq('action_type', 'send_email')
    .eq('source_type', 'email')
    .eq('source_id', input.emailId)
    .eq('status', 'pending')
    .limit(1)
    .single()

  if (!existingNimbusAction) {
    await supabaseAdmin
      .from('nimbus_pending_actions')
      .insert({
        user_id: input.accountUserId,
        lead_id: effectiveLeadId,
        contact_id: effectiveContactId,
        action_type: 'send_email',
        action_data: {
          draft_subject: draftSubject,
          draft_to: input.fromAddress,
          requested_file: requestedFileLabel,
          company_name: companyName,
        },
        reason: `Client requested ${requestedFileLabel}. Draft reply is ready with file attachment suggestions.`,
        confidence: 0.95,
        source_type: 'email',
        source_id: input.emailId,
        status: 'pending',
        priority: 'high',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
  }

  return true
}

/**
 * Process an email for AI analysis and task generation
 * This is the main entry point called from webhooks/API routes
 */
export async function processEmailForAI(
  emailId: string,
  fromAddress: string,
  fromName: string | null,
  toAddresses: string[],
  subject: string | null,
  bodyText: string | null,
  bodyHtml: string | null,
  isInbound: boolean,
  accountUserId: string
): Promise<{
  analysis: EmailAIAnalysis | null
  tasksCreated: string[]
  linkedLead: string | null
  linkedContact: string | null
  funnelEnrollment: {
    enrolled: boolean
    pending_approval?: boolean
    enrollment_id?: string
    funnel_id?: string
    funnel_name?: string
    match_reason?: string
  } | null
  leadCreated: boolean
  newLeadId: string | null
  presentationRequestCreated: boolean
  nimbusMemoriesCreated?: number
}> {
  if (!isNimbusAnalysisEnabled()) {
    console.log('[email-ai] Skipped email AI pipeline — Nimbus analysis is disabled')
    await supabaseAdmin
      .from('emails')
      .update({
        ai_processed_at: new Date().toISOString(),
        ai_analysis_status: 'skipped',
      })
      .eq('id', emailId)
    return {
      analysis: null,
      tasksCreated: [],
      linkedLead: null,
      linkedContact: null,
      funnelEnrollment: null,
      leadCreated: false,
      newLeadId: null,
      presentationRequestCreated: false,
      nimbusMemoriesCreated: 0,
    }
  }

  const { data: existingEmailState } = await supabaseAdmin
    .from('emails')
    .select('id, ai_processed_at')
    .eq('id', emailId)
    .single()

  if (existingEmailState?.ai_processed_at) {
    return {
      analysis: null,
      tasksCreated: [],
      linkedLead: null,
      linkedContact: null,
      funnelEnrollment: null,
      leadCreated: false,
      newLeadId: null,
      presentationRequestCreated: false,
      nimbusMemoriesCreated: 0,
    }
  }

  // Resolve the processing organization up front. Every lead/contact match and
  // link below runs through the service-role client (RLS bypassed), so this org
  // is the ONLY thing keeping inbound mail from linking across organizations.
  const { data: processingUser } = await supabaseAdmin
    .from('users')
    .select('organization_id')
    .eq('id', accountUserId)
    .single()
  const processingOrgId = processingUser?.organization_id || null

  // 1. Find lead/contact by email
  const senderMatch = await findLeadOrContactByEmail(fromAddress, processingOrgId)
  let linkedLead = senderMatch.lead_id
  let linkedContact = senderMatch.contact_id

  if (linkedLead && !linkedContact) {
    const resolved = await resolveConvertedLeadToContact(linkedLead, processingOrgId)
    linkedLead = resolved.leadId
    linkedContact = resolved.contactId
  }

  // Also check recipients for inbound emails
  if (!linkedLead && !linkedContact && !isInbound) {
    for (const toAddr of toAddresses) {
      const recipientMatch = await findLeadOrContactByEmail(toAddr, processingOrgId)
      if (recipientMatch.lead_id || recipientMatch.contact_id) {
        linkedLead = recipientMatch.lead_id
        linkedContact = recipientMatch.contact_id
        break
      }
    }
  }

  // 2. Link email to lead/contact
  if (linkedLead || linkedContact) {
    await linkEmailToLeadOrContact(emailId, linkedLead, linkedContact, isInbound ? 'from' : 'to')
  }

  // 2.5 Filter out spam, promotional, and non-work-related emails
  // Skip filtering for known CRM contacts (leads/contacts) - we always want to process those
  if (!isKnownCRMContact(linkedLead, linkedContact)) {
    const filterResult = shouldProcessEmailForAI(fromAddress, subject, bodyText, isInbound)
    if (!filterResult.shouldProcess) {
      console.log(`[Email AI] Skipping email analysis - ${filterResult.reason} (category: ${filterResult.category})`)
      // Mark as processed to prevent re-processing, but don't run AI
      await supabaseAdmin
        .from('emails')
        .update({
          ai_processed_at: new Date().toISOString(),
          ai_analysis_status: 'skipped',
        })
        .eq('id', emailId)

      return {
        analysis: null,
        tasksCreated: [],
        linkedLead,
        linkedContact,
        funnelEnrollment: null,
        leadCreated: false,
        newLeadId: null,
        presentationRequestCreated: false,
        nimbusMemoriesCreated: 0,
      }
    }
  }

  // 3. Create activity log entry
  await createEmailActivityLog(
    emailId,
    isInbound,
    accountUserId,
    linkedLead,
    linkedContact,
    null, // dealId - could be enhanced to find related deals
    subject,
    fromAddress
  )

  // 4. Run AI analysis
  const analysis = await analyzeEmail(
    emailId,
    fromAddress,
    fromName,
    toAddresses,
    subject,
    bodyText,
    bodyHtml,
    isInbound
  )

  let tasksCreated: string[] = []
  let funnelEnrollmentResult: {
    enrolled: boolean
    pending_approval?: boolean
    enrollment_id?: string
    funnel_id?: string
    funnel_name?: string
    match_reason?: string
  } = { enrolled: false }
  let newLeadId: string | null = null

  // 5. Auto-create lead for inbound emails if no existing lead/contact found
  if (isInbound && !linkedLead && !linkedContact && analysis) {
    try {
      console.log('No existing lead/contact found for inbound email, attempting to create lead...')

      const extractedInfo = analysis.extracted_sender_info

      // Parse name from fromName if not extracted from signature
      let firstName = extractedInfo?.first_name || null
      let lastName = extractedInfo?.last_name || null

      if (!firstName && fromName) {
        const nameParts = fromName.trim().split(/\s+/)
        firstName = nameParts[0] || null
        lastName = nameParts.slice(1).join(' ') || null
      }

      // We can create a lead if we have at least an email (which we always have for inbound).
      // Reuse the organization resolved at the top of processEmailForAI.
      const organizationId = processingOrgId

      // Get or create the AI Generated system import group
      let aiGroupId: string | null = null
      if (organizationId) {
        const { data: existingGroup } = await supabaseAdmin
          .from('lead_import_jobs')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('is_system', true)
          .eq('file_name', 'ai-generated')
          .single()

        if (existingGroup) {
          aiGroupId = existingGroup.id
        } else {
          const { data: newGroup } = await supabaseAdmin
            .from('lead_import_jobs')
            .insert({
              file_name: 'ai-generated',
              display_name: 'AI Generated',
              organization_id: organizationId,
              is_system: true,
              status: 'completed',
              field_mapping: {},
            })
            .select('id')
            .single()

          aiGroupId = newGroup?.id || null
        }
      }

      // Build notes from extracted info
      let notesContent = `Created from inbound email: "${subject || '(no subject)'}"`
      if (extractedInfo?.job_title) {
        notesContent += `\nJob Title: ${extractedInfo.job_title}`
      }
      if (extractedInfo?.company) {
        notesContent += `\nCompany: ${extractedInfo.company}`
      }

      const leadData = {
        first_name: firstName || 'Unknown',
        last_name: lastName || '',
        email: fromAddress.toLowerCase().trim(),
        phone: extractedInfo?.phone || null,
        status: 'new',
        source_type: 'inbound_email',
        owner_id: accountUserId,
        notes: notesContent,
        city: extractedInfo?.city || null,
        state: extractedInfo?.state || null,
        organization_id: organizationId,
        import_job_id: aiGroupId,
      }

      console.log('Creating new lead from inbound email:', {
        name: `${leadData.first_name} ${leadData.last_name}`.trim(),
        email: leadData.email,
        phone: leadData.phone,
        company: extractedInfo?.company,
      })

      const { data: newLead, error: leadError } = await supabaseAdmin
        .from('leads')
        .insert(leadData)
        .select('id, first_name, last_name')
        .single()

      if (leadError) {
        console.error('Error creating lead from email:', leadError)
      } else if (newLead) {
        newLeadId = newLead.id
        linkedLead = newLead.id
        console.log('✅ Created new lead from inbound email:', newLead.first_name, newLead.last_name, newLeadId)

        // Link the email to the new lead
        await linkEmailToLeadOrContact(emailId, linkedLead, null, 'from')

        // Log the lead creation
        await supabaseAdmin.from('activity_log').insert({
          event_type: 'lead_created',
          event_description: `Lead auto-created from inbound email: ${newLead.first_name} ${newLead.last_name}`,
          user_id: accountUserId,
          entity_type: 'lead',
          entity_id: newLead.id,
          email_id: emailId,
          lead_id: newLead.id,
          metadata: {
            source: 'inbound_email',
            from_address: fromAddress,
            subject: subject,
            extracted_info: extractedInfo,
          }
        })
      }
    } catch (leadCreateError) {
      console.error('Error auto-creating lead from email:', leadCreateError)
      // Don't fail the whole process if lead creation fails
    }
  }

  if (analysis) {
    if (isInbound) {
      try {
        const inboundRequest = extractInboundFileRequest(analysis, subject, bodyText, bodyHtml)
        if (inboundRequest) {
          await createInboundClientReplyDraft({
            emailId,
            accountUserId,
            fromAddress,
            fromName,
            subject,
            linkedLead,
            linkedContact,
            request: inboundRequest,
          })
        }
      } catch (draftError) {
        console.error('[Email AI] Failed to create inbound client reply draft:', draftError)
      }
    }

    // 6. Generate and create tasks
    const tasks = generateTasksFromAnalysis(analysis, isInbound, fromAddress, subject).slice(0, 1)

    if (tasks.length > 0) {
      tasksCreated = await createTasksFromEmail(
        tasks,
        emailId,
        accountUserId,
        linkedLead,
        linkedContact,
        null // dealId
      )
    }

    // 7. Update email with analysis results
    await updateEmailWithAnalysis(emailId, analysis, tasksCreated.length > 0)

    // 8. Auto-enroll in funnel for inbound emails (if we have a lead)
    if (isInbound && linkedLead) {
      try {
        // Check if this is a first contact (no previous emails from this sender)
        const { data: previousEmails, error: emailCheckError } = await supabaseAdmin
          .from('emails')
          .select('id')
          .eq('from_address', fromAddress.toLowerCase().trim())
          .neq('id', emailId)
          .limit(1)

        const isFirstContact = !emailCheckError && (!previousEmails || previousEmails.length === 0)

        console.log('Email funnel check:', {
          emailId,
          fromAddress,
          isFirstContact,
          linkedLead,
          intent: analysis.intent,
          urgencyScore: analysis.urgency_score
        })

        // Try to match to a funnel
        const matchedFunnel = await findMatchingFunnelForEmail(
          analysis.summary || '',
          {
            intent: analysis.intent,
            sentiment: analysis.sentiment,
            keyTopics: analysis.key_topics || [],
            isFirstContact,
            isInbound: true,
            urgencyScore: analysis.urgency_score,
            senderEmail: fromAddress,
            subject: subject || ''
          },
          supabaseAdmin
        )

        if (matchedFunnel) {
          console.log('Matched email to funnel:', matchedFunnel.funnel_name)

          // Check if lead is already enrolled in this funnel
          const { data: existingEnrollment } = await supabaseAdmin
            .from('email_funnel_enrollments')
            .select('id')
            .eq('funnel_id', matchedFunnel.funnel_id)
            .eq('lead_id', linkedLead)
            .in('status', ['active', 'paused', 'pending_approval'])
            .single()

          if (!existingEnrollment) {
            // Get first phase delay for scheduling
            const { data: phases } = await supabaseAdmin
              .from('email_funnel_phases')
              .select('delay_days, delay_hours')
              .eq('funnel_id', matchedFunnel.funnel_id)
              .order('phase_order', { ascending: true })
              .limit(1)

            const firstPhase = phases?.[0]
            let delayMs = ((firstPhase?.delay_days || 0) * 24 * 60 + (firstPhase?.delay_hours || 0) * 60) * 60 * 1000

            // Adjust delay based on urgency score
            if (analysis.urgency_score >= 80) {
              delayMs = Math.min(delayMs, 5 * 60 * 1000) // Max 5 min for high urgency
            } else if (analysis.urgency_score >= 60) {
              delayMs = Math.round(delayMs * 0.5) // Half delay for medium-high urgency
            }

            // Minimum delay of 5 minutes
            if (delayMs < 5 * 60 * 1000) {
              delayMs = 5 * 60 * 1000
            }

            const nextEmailAt = new Date(Date.now() + delayMs).toISOString()

            // Create enrollment as pending approval (requires user to approve)
            const { data: enrollmentData, error: enrollError } = await supabaseAdmin
              .from('email_funnel_enrollments')
              .insert({
                funnel_id: matchedFunnel.funnel_id,
                lead_id: linkedLead,
                status: 'pending_approval',
                current_phase: 1,
                enrolled_at: new Date().toISOString(),
                enrolled_by: accountUserId,
                next_email_scheduled_at: nextEmailAt,
                match_reason: `Email: ${matchedFunnel.match_reason}`,
              })
              .select('id')
              .single()

            if (!enrollError && enrollmentData) {
              funnelEnrollmentResult = {
                enrolled: true,
                pending_approval: true,
                enrollment_id: enrollmentData.id,
                funnel_id: matchedFunnel.funnel_id,
                funnel_name: matchedFunnel.funnel_name,
                match_reason: matchedFunnel.match_reason
              }

              // Log the enrollment
              await supabaseAdmin.from('activity_log').insert({
                event_type: 'funnel_enrollment_draft',
                event_description: `AI suggested funnel enrollment from email: ${matchedFunnel.funnel_name}`,
                user_id: accountUserId,
                entity_type: 'email_funnel_enrollment',
                entity_id: enrollmentData.id,
                email_id: emailId,
                lead_id: linkedLead,
                metadata: {
                  funnel_id: matchedFunnel.funnel_id,
                  funnel_name: matchedFunnel.funnel_name,
                  match_reason: matchedFunnel.match_reason,
                  confidence: matchedFunnel.confidence,
                  source: 'inbound_email',
                  is_first_contact: isFirstContact
                }
              })

              console.log('Lead enrollment draft created from email for funnel:', matchedFunnel.funnel_name)
            } else if (enrollError) {
              console.error('Error enrolling lead in funnel from email:', enrollError)
            }
          } else {
            console.log('Lead already enrolled in this funnel:', matchedFunnel.funnel_name)
          }
        }
      } catch (funnelError) {
        console.error('Error with email funnel enrollment:', funnelError)
        // Don't fail the whole process if funnel enrollment fails
      }
    }
  }

  // 9. Detect presentation/deck requests and create pending request for Nimbus
  let presentationRequestCreated = false
  const emailContent = bodyText || bodyHtml || ''

  if (analysis && emailContent && accountUserId) {
    try {
      console.log('Checking for presentation requests in email...')

      // Get lead info for context
      let leadName: string | null = null
      let leadCompany: string | null = null

      if (linkedLead) {
        const { data: leadData } = await supabaseAdmin
          .from('leads')
          .select('first_name, last_name, company')
          .eq('id', linkedLead)
          .single()

        if (leadData) {
          leadName = `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() || null
          leadCompany = leadData.company || null
        }
      }

      const presentationReq = await detectPresentationRequest({
        contentType: 'email',
        content: `Subject: ${subject || '(no subject)'}\n\n${emailContent}`,
        contactName: leadName || fromName || undefined,
        contactCompany: leadCompany || undefined,
        direction: isInbound ? 'inbound' : 'outbound',
      })

      if (presentationReq && hasEnoughInfoForPresentation(presentationReq)) {
        console.log('Presentation request detected in email with confidence:', presentationReq.confidence)

        // Check if we already have a pending request for this email
        const { data: existingRequest } = await supabaseAdmin
          .from('pending_presentation_requests')
          .select('id')
          .eq('source_type', 'email')
          .eq('source_id', emailId)
          .single()

        if (!existingRequest) {
          // Create pending presentation request
          const { data: newRequest, error: reqError } = await supabaseAdmin
            .from('pending_presentation_requests')
            .insert({
              user_id: accountUserId,
              lead_id: linkedLead || null,
              client_name: presentationReq.clientName,
              client_company: presentationReq.clientCompany,
              presentation_type: presentationReq.presentationType,
              topics: presentationReq.topics,
              key_points: presentationReq.keyPoints,
              context: presentationReq.context,
              extracted_requirements: presentationReq.extractedRequirements,
              suggested_slide_count: presentationReq.suggestedSlideCount,
              tone: presentationReq.tone,
              deadline: presentationReq.deadline,
              source_type: 'email',
              source_id: emailId,
              confidence: presentationReq.confidence,
              status: 'pending',
            })
            .select('id')
            .single()

          if (!reqError && newRequest) {
            presentationRequestCreated = true
            console.log('✅ Created pending presentation request from email:', newRequest.id)
          } else {
            console.error('Error creating presentation request from email:', reqError)
          }
        } else {
          console.log('Presentation request already exists for this email')
        }
      } else {
        console.log('No presentation request detected in email')
      }
    } catch (presError) {
      console.error('Error detecting presentation request in email:', presError)
      // Don't fail the whole process if presentation detection fails
    }
  }

  // 10. Extract Nimbus memories from email
  let nimbusMemoriesCreated = 0
  const leadIdForNimbus = linkedLead || newLeadId
  const emailContentForAnalysis = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ').trim() : '')

  if (leadIdForNimbus && emailContentForAnalysis && emailContentForAnalysis.length > 50) {
    try {
      console.log('[Nimbus] Extracting memories from email...')

      const memories = await extractMemoriesFromEmail(
        emailContentForAnalysis,
        subject || '',
        isInbound
      )

      // Store extracted memories
      for (const memory of memories) {
        const { error: memError } = await supabaseAdmin
          .from('nimbus_memories')
          .insert({
            lead_id: leadIdForNimbus,
            memory_type: memory.memoryType,
            category: memory.category,
            content: memory.content,
            confidence: memory.confidence,
            source_type: 'email',
            source_id: emailId,
            extracted_quote: memory.extractedQuote || null,
            created_by: accountUserId,
            is_active: true,
          })

        if (!memError) {
          nimbusMemoriesCreated++
        }
      }

      if (nimbusMemoriesCreated > 0) {
        console.log(`[Nimbus] Created ${nimbusMemoriesCreated} memories from email`)
      }
    } catch (nimbusError) {
      console.error('[Nimbus] Error extracting memories from email:', nimbusError)
      // Don't fail the whole process if Nimbus extraction fails
    }
  }

  return {
    analysis,
    tasksCreated,
    linkedLead,
    linkedContact,
    funnelEnrollment: funnelEnrollmentResult.enrolled ? funnelEnrollmentResult : null,
    leadCreated: !!newLeadId,
    newLeadId,
    presentationRequestCreated,
    nimbusMemoriesCreated,
  }
}
