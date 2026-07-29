/**
 * Nimbus Contact Analyzer
 *
 * Analyzes call transcripts, emails, and messages for contact information corrections,
 * preferences, and insights that should be stored or updated.
 */

import OpenAI from 'openai'
import { isNimbusAnalysisEnabled } from './nimbus/config'

// Types
export interface ContactUpdate {
  field: 'first_name' | 'last_name' | 'phone' | 'email' | 'phone_secondary' | 'address' | 'company' | 'occupation' | 'city' | 'state'
  currentValue: string | null
  newValue: string
  confidence: number
  extractedQuote: string
  reason: string
}

export interface ExtractedMemory {
  memoryType: 'fact' | 'preference' | 'relationship' | 'note' | 'correction'
  category: 'personal' | 'business' | 'communication' | 'financial' | 'scheduling'
  content: string
  confidence: number
  extractedQuote?: string
}

export interface PendingAction {
  actionType: 'update_contact' | 'send_email' | 'create_task' | 'enroll_funnel' | 'schedule_call'
  actionData: Record<string, unknown>
  reason: string
  confidence: number
  extractedFrom?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  shouldAutoApply: boolean // True if meets auto-apply criteria
}

export interface LeadInfo {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  phone_secondary?: string | null
  company?: string | null
  occupation?: string | null
  city?: string | null
  state?: string | null
  address?: string | null
}

export interface AnalysisResult {
  contactUpdates: ContactUpdate[]
  memories: ExtractedMemory[]
  pendingActions: PendingAction[]
}

// OpenAI client - lazy initialization
let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

/**
 * Analyzes a transcript for contact information updates.
 * Looks for explicit corrections like "It's Margaret with two T's"
 */
export async function analyzeTranscriptForContactUpdates(
  transcript: string,
  currentLeadInfo: LeadInfo,
  callDirection: 'inbound' | 'outbound'
): Promise<ContactUpdate[]> {
  if (!isNimbusAnalysisEnabled()) {
    console.log('[NimbusContactAnalyzer] Skipped contact-update analysis — Nimbus analysis is paused (NIMBUS_ANALYSIS_ENABLED=false)')
    return []
  }
  const openai = getOpenAI()
  if (!openai || !transcript || transcript.length < 50) {
    return []
  }

  try {
    const prompt = `You are analyzing a sales call transcript to detect EXPLICIT contact information corrections made by the LEAD (customer).

CURRENT LEAD INFORMATION:
- First Name: ${currentLeadInfo.first_name || 'Unknown'}
- Last Name: ${currentLeadInfo.last_name || 'Unknown'}
- Email: ${currentLeadInfo.email || 'Unknown'}
- Phone: ${currentLeadInfo.phone || 'Unknown'}
- Secondary Phone: ${currentLeadInfo.phone_secondary || 'None'}
- Company: ${currentLeadInfo.company || 'Unknown'}
- City: ${currentLeadInfo.city || 'Unknown'}
- State: ${currentLeadInfo.state || 'Unknown'}

CALL DIRECTION: ${callDirection} (${callDirection === 'inbound' ? 'Lead called us' : 'We called the lead'})

TRANSCRIPT:
${transcript}

YOUR TASK:
Find EXPLICIT corrections where the LEAD corrects or clarifies their contact information. Only include:
1. Name spelling corrections (e.g., "It's Margaret with two T's", "My last name is spelled S-M-I-T-H-E")
2. Preferred name (e.g., "Call me Mike, not Michael")
3. Phone number corrections or updates
4. Email corrections or new email mentions
5. Address updates

CRITICAL RULES:
- Only extract corrections that come from the LEAD, not the employee
- Must have HIGH confidence (0.9+) with explicit verbal evidence
- For auto-apply (0.95+ confidence), there MUST be a clear, unambiguous quote
- Do NOT include inferred information - only explicit statements
- If the lead just mentions their name normally, that's NOT a correction

Respond in JSON format:
{
  "contactUpdates": [
    {
      "field": "first_name|last_name|phone|email|phone_secondary|address|company|occupation|city|state",
      "currentValue": "current value or null",
      "newValue": "the corrected/new value",
      "confidence": 0.0-1.0,
      "extractedQuote": "The EXACT quote from the transcript",
      "reason": "Why this should be updated"
    }
  ]
}

CONFIDENCE GUIDELINES:
- 0.95-1.0: Crystal clear explicit statement with exact spelling (e.g., "It's spelled M-A-R-G-A-R-E-T with two Ts")
- 0.85-0.94: Clear correction but less explicit (e.g., "It's Margaret, not Margret")
- 0.70-0.84: Likely correct but needs verification (e.g., mentioned name in passing)
- Below 0.70: Don't include - too uncertain

Return empty array if no corrections found.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a precise data extraction assistant. Only extract explicitly stated information. Never guess or infer. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for consistency
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return []
    }

    const result = JSON.parse(content)
    return result.contactUpdates || []
  } catch (error) {
    console.error('[Nimbus Contact Analyzer] Error analyzing transcript:', error)
    return []
  }
}

/**
 * Extracts memories and insights from a transcript.
 * Identifies facts, preferences, relationship insights, and notes.
 */
export async function extractMemoriesFromTranscript(
  transcript: string,
  callDirection: 'inbound' | 'outbound',
  existingMemories?: ExtractedMemory[]
): Promise<ExtractedMemory[]> {
  if (!isNimbusAnalysisEnabled()) {
    console.log('[NimbusContactAnalyzer] Skipped transcript memory extraction — Nimbus analysis is paused (NIMBUS_ANALYSIS_ENABLED=false)')
    return []
  }
  const openai = getOpenAI()
  if (!openai || !transcript || transcript.length < 100) {
    return []
  }

  try {
    const existingContext = existingMemories && existingMemories.length > 0
      ? `\nEXISTING MEMORIES (avoid duplicates):\n${existingMemories.map(m => `- [${m.memoryType}] ${m.content}`).join('\n')}`
      : ''

    const prompt = `You are analyzing a sales call transcript to extract valuable insights about the LEAD (customer) for future reference.

CALL DIRECTION: ${callDirection}
${existingContext}

TRANSCRIPT:
${transcript}

EXTRACT THE FOLLOWING TYPES OF MEMORIES:

1. FACTS (objective information):
   - Financial info: 401k amount, retirement timeline, investment capacity
   - Personal info: Spouse name, retirement date, employer
   - Location: City, state they live in or are moving to

2. PREFERENCES (communication preferences):
   - Best times to call
   - Preferred contact method (cell vs work, email vs phone)
   - Communication style preferences

3. RELATIONSHIPS (relationship insights):
   - Who is the decision maker
   - Spouse involvement in decisions
   - Family considerations

4. NOTES (general observations):
   - Objections raised
   - Concerns expressed
   - Questions asked
   - Level of interest/engagement

Respond in JSON format:
{
  "memories": [
    {
      "memoryType": "fact|preference|relationship|note",
      "category": "personal|business|communication|financial|scheduling",
      "content": "Concise, actionable insight",
      "confidence": 0.0-1.0,
      "extractedQuote": "Optional: exact quote if applicable"
    }
  ]
}

GUIDELINES:
- Keep insights CONCISE and ACTIONABLE
- Only include insights with confidence >= 0.7
- Avoid duplicating existing memories
- Focus on information useful for future calls
- Maximum 10 memories per call (prioritize most valuable)`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting actionable sales intelligence from conversations. Focus on information that will help close deals.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return []
    }

    const result = JSON.parse(content)
    return result.memories || []
  } catch (error) {
    console.error('[Nimbus Contact Analyzer] Error extracting memories:', error)
    return []
  }
}

/**
 * Analyzes content and generates pending actions for user approval.
 * Converts contact updates and insights into actionable items.
 */
export function generatePendingActions(
  contactUpdates: ContactUpdate[],
  memories: ExtractedMemory[],
  leadInfo: LeadInfo
): PendingAction[] {
  const actions: PendingAction[] = []

  // Convert contact updates to pending actions
  for (const update of contactUpdates) {
    const shouldAutoApply = update.confidence >= 0.95 &&
      !!update.extractedQuote &&
      update.extractedQuote.length > 10 &&
      ['first_name', 'last_name'].includes(update.field) // Only auto-apply name corrections

    actions.push({
      actionType: 'update_contact',
      actionData: {
        field: update.field,
        currentValue: update.currentValue,
        newValue: update.newValue,
        leadId: leadInfo.id,
      },
      reason: update.reason,
      confidence: update.confidence,
      extractedFrom: update.extractedQuote,
      priority: update.confidence >= 0.95 ? 'high' : 'normal',
      shouldAutoApply,
    })
  }

  // Convert correction-type memories to contact updates
  for (const memory of memories) {
    if (memory.memoryType === 'correction' && memory.confidence >= 0.85) {
      actions.push({
        actionType: 'update_contact',
        actionData: {
          memoryContent: memory.content,
          leadId: leadInfo.id,
        },
        reason: memory.content,
        confidence: memory.confidence,
        extractedFrom: memory.extractedQuote,
        priority: 'normal',
        shouldAutoApply: false, // Memory-based corrections always need approval
      })
    }
  }

  return actions
}

/**
 * Main analysis function that combines all analysis steps.
 */
export async function analyzeContentForNimbus(
  content: string,
  contentType: 'call' | 'email' | 'meeting' | 'message',
  leadInfo: LeadInfo,
  direction?: 'inbound' | 'outbound',
  existingMemories?: ExtractedMemory[]
): Promise<AnalysisResult> {
  const callDirection = direction || 'outbound'

  // Run analyses in parallel
  const [contactUpdates, memories] = await Promise.all([
    contentType === 'call'
      ? analyzeTranscriptForContactUpdates(content, leadInfo, callDirection)
      : Promise.resolve([]),
    extractMemoriesFromTranscript(content, callDirection, existingMemories),
  ])

  // Generate pending actions from analysis results
  const pendingActions = generatePendingActions(contactUpdates, memories, leadInfo)

  return {
    contactUpdates,
    memories,
    pendingActions,
  }
}

/**
 * Quick check if a transcript likely contains contact corrections.
 * Used for fast filtering before full analysis.
 */
export function mightContainContactCorrections(transcript: string): boolean {
  if (!transcript || transcript.length < 50) return false

  const correctionPatterns = [
    /it's\s+spelled/i,
    /spell(ed|ing)?\s+(it|my|the)\s+/i,
    /with\s+(two|2|double)\s+(t|l|r|s|n|m)/i,
    /not\s+\w+,?\s+(but|it's|its)/i,
    /my\s+(name|email|number|phone)\s+is\s+(actually|really)/i,
    /call\s+me\s+(on|at)\s+my/i,
    /use\s+(this|my)\s+(number|email|phone)/i,
    /[a-zA-Z]-[a-zA-Z]-[a-zA-Z]/i, // Spelled out letters like M-A-R-G
    /\b(that's|it's)\s+not\s+(right|correct)/i,
    /correct(ion|ed)?:/i,
    /instead\s+of/i,
  ]

  return correctionPatterns.some(pattern => pattern.test(transcript))
}

/**
 * Extracts memories from email content.
 * Adapts the extraction for email-specific context.
 */
export async function extractMemoriesFromEmail(
  emailContent: string,
  subject: string,
  isInbound: boolean,
  existingMemories?: ExtractedMemory[]
): Promise<ExtractedMemory[]> {
  if (!isNimbusAnalysisEnabled()) {
    console.log('[NimbusContactAnalyzer] Skipped email memory extraction — Nimbus analysis is paused (NIMBUS_ANALYSIS_ENABLED=false)')
    return []
  }
  const openai = getOpenAI()
  if (!openai || !emailContent || emailContent.length < 50) {
    return []
  }

  try {
    const existingContext = existingMemories && existingMemories.length > 0
      ? `\nEXISTING MEMORIES (avoid duplicates):\n${existingMemories.map(m => `- [${m.memoryType}] ${m.content}`).join('\n')}`
      : ''

    const prompt = `You are analyzing an email to extract valuable insights about the ${isInbound ? 'LEAD (who sent this email)' : 'conversation context'}.

EMAIL DIRECTION: ${isInbound ? 'FROM lead TO us' : 'FROM us TO lead'}
SUBJECT: ${subject}
${existingContext}

EMAIL CONTENT:
${emailContent}

EXTRACT INSIGHTS that would be useful for future interactions:

1. FACTS: Financial info, personal details, timelines
2. PREFERENCES: Communication preferences, interests
3. RELATIONSHIPS: Decision makers, family involvement
4. NOTES: Questions, concerns, level of interest

${isInbound ? 'Focus on what the LEAD reveals about themselves, their needs, and concerns.' : 'Focus on commitments made and context provided.'}

Respond in JSON format:
{
  "memories": [
    {
      "memoryType": "fact|preference|relationship|note",
      "category": "personal|business|communication|financial|scheduling",
      "content": "Concise, actionable insight",
      "confidence": 0.0-1.0,
      "extractedQuote": "Optional: relevant quote"
    }
  ]
}

Keep insights concise. Maximum 5 memories per email. Confidence >= 0.7 only.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting actionable insights from email communications.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return []
    }

    const result = JSON.parse(content)
    return result.memories || []
  } catch (error) {
    console.error('[Nimbus Contact Analyzer] Error extracting memories from email:', error)
    return []
  }
}
