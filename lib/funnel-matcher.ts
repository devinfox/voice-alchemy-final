/**
 * Funnel matching for Voice Alchemy Academy.
 *
 * Funnels are matched to inbound emails only (there is no call pipeline in
 * this app). A funnel is eligible when it is active, has auto-enrollment
 * turned on, and has a purpose description the model can reason about.
 * Matches are created as `pending_approval` enrollments and reviewed on the
 * Drafts tab before any email goes out.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { isNimbusAnalysisEnabled } from './nimbus/config'

export interface FunnelMatchResult {
  funnel_id: string
  funnel_name: string
  match_reason: string
  confidence: 'high' | 'medium' | 'low'
}

interface FunnelOption {
  id: string
  name: string
  description: string | null
  tags: string[]
}

/**
 * Example tags a teacher can attach to a funnel. They are hints for the
 * matcher and for the person reading the funnel list; free text works too.
 */
export const EXAMPLE_FUNNEL_TAGS = [
  'new student inquiry',
  'trial lesson booked',
  'asked about pricing',
  'interested in private lessons',
  'interested in group classes',
  'songwriting interest',
  'returning student',
  'missed lessons',
  'course enrollment',
  'audition prep',
  'performance anxiety',
  'referral',
]

export function getExampleTags(): string[] {
  return EXAMPLE_FUNNEL_TAGS
}

/**
 * Use the model to pick the best funnel for an inbound email, or null.
 */
export async function findMatchingFunnelForEmail(
  emailSummary: string,
  emailContext: {
    intent: string
    sentiment: string
    keyTopics: string[]
    isFirstContact: boolean
    isInbound: boolean
    urgencyScore: number
    senderEmail: string
    subject: string
  },
  supabase: SupabaseClient
): Promise<FunnelMatchResult | null> {
  if (!isNimbusAnalysisEnabled()) return null
  if (!emailContext.isInbound) return null
  if (!process.env.OPENAI_API_KEY) return null

  const { data: funnels, error } = await supabase
    .from('email_funnels')
    .select('id, name, description, tags')
    .eq('status', 'active')
    .eq('is_deleted', false)
    .eq('auto_enroll_enabled', true)

  if (error) {
    console.error('[funnel-matcher] Error fetching funnels:', error)
    return null
  }

  const eligible = (funnels || []).filter(
    (f: FunnelOption) => f.description && f.description.trim().length > 0
  ) as FunnelOption[]

  if (eligible.length === 0) return null

  const funnelOptions = eligible
    .map((f, index) => {
      const tagsStr = f.tags?.length ? ` (Tags: ${f.tags.join(', ')})` : ''
      return `${index + 1}. "${f.name}"${tagsStr}\n   Purpose: ${f.description}`
    })
    .join('\n\n')

  const prompt = `You match inbound emails to automated email sequences ("funnels") for Voice Alchemy Academy, a vocal coaching academy. Senders are prospective or current singing students; emails are about lessons, courses, pricing, scheduling, technique, and performance goals.

EMAIL INFORMATION:
- Contact type: ${emailContext.isFirstContact ? 'NEW CONTACT (first time emailing us)' : 'EXISTING CONTACT (has emailed before)'}
- Intent: ${emailContext.intent}
- Sentiment: ${emailContext.sentiment}
- Urgency: ${emailContext.urgencyScore}/100
- Subject: ${emailContext.subject}
- Topics: ${emailContext.keyTopics.join(', ') || 'general inquiry'}

EMAIL SUMMARY:
${emailSummary}

AVAILABLE FUNNELS:
${funnelOptions}

INSTRUCTIONS:
Pick the funnel whose PURPOSE best describes this sender and situation. Be strict: only match when the email genuinely fits. Return 0 when nothing fits, when the email is a complaint or cancellation, when it needs a personal reply from the teacher, or when it is clearly not from a student or prospect (vendors, spam, notifications).

Respond with JSON:
{
  "selected_funnel": <number 0-${eligible.length}>,
  "reason": "<one or two sentences on why this email does or does not fit>",
  "confidence": "high" | "medium" | "low"
}`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You match inbound emails to email funnels. Always respond with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    })

    const content = response.choices[0]?.message?.content
    if (!content) return null

    const result = JSON.parse(content) as { selected_funnel: number; reason: string; confidence: FunnelMatchResult['confidence'] }
    const idx = Number(result.selected_funnel)
    if (!idx || idx < 1 || idx > eligible.length) return null

    const matched = eligible[idx - 1]
    return {
      funnel_id: matched.id,
      funnel_name: matched.name,
      match_reason: result.reason,
      confidence: result.confidence || 'medium',
    }
  } catch (err) {
    console.error('[funnel-matcher] Matching failed:', err)
    return null
  }
}
