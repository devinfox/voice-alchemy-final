import OpenAI from 'openai'
import { isNimbusAnalysisEnabled } from './nimbus/config'

export interface PresentationRequest {
  detected: boolean
  confidence: 'high' | 'medium' | 'low'
  clientName: string | null
  clientCompany: string | null
  presentationType: 'sales_pitch' | 'portfolio_review' | 'educational' | 'proposal' | 'custom'
  topics: string[]
  keyPoints: string[]
  deadline: string | null // ISO date string
  context: string // Summary of what was discussed
  extractedRequirements: string[] // Specific things mentioned that should be in the deck
  suggestedSlideCount: number
  tone: 'professional' | 'friendly' | 'formal' | 'educational'
}

interface DetectionContext {
  contentType: 'call' | 'email' | 'meeting'
  content: string
  contactName?: string
  contactCompany?: string
  direction?: 'inbound' | 'outbound'
}

/**
 * Detect if a conversation mentions a presentation/deck request
 * and extract all relevant information to generate one
 */
export async function detectPresentationRequest(
  context: DetectionContext
): Promise<PresentationRequest | null> {
  if (!isNimbusAnalysisEnabled()) {
    return null
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `You are an AI assistant analyzing business communications to detect presentation/deck requests.

CONTEXT:
- Content Type: ${context.contentType}
- Direction: ${context.direction || 'N/A'}
- Contact Name: ${context.contactName || 'Unknown'}
- Contact Company: ${context.contactCompany || 'Unknown'}

CONTENT TO ANALYZE:
${context.content}

TASK:
Determine if anyone in this conversation mentioned needing, wanting, or requesting a presentation, deck, slides, or pitch materials.

Look for phrases like:
- "Can you prepare a presentation..."
- "I need a deck for..."
- "Put together some slides..."
- "Create a pitch for..."
- "I want to show them a presentation..."
- "Prepare materials for the meeting..."
- "Need slides ready by..."
- "Put together a proposal..."
- Any mention of needing visual materials for a client meeting

If a presentation is mentioned, extract ALL context about what it should contain:
- Who is it for?
- What should it cover?
- Any specific numbers, facts, or points mentioned
- Timeline/deadline if any
- The purpose (sales, education, proposal, etc.)

Respond in JSON format:
{
  "detected": true/false,
  "confidence": "high|medium|low",
  "clientName": "Name of the person the deck is for (if mentioned)",
  "clientCompany": "Company name if mentioned",
  "presentationType": "sales_pitch|portfolio_review|educational|proposal|custom",
  "topics": ["topic1", "topic2"],
  "keyPoints": ["specific point mentioned that should be included", "another point"],
  "deadline": "ISO date if deadline mentioned, otherwise null",
  "context": "2-3 sentence summary of what was discussed and why they need a presentation",
  "extractedRequirements": [
    "Specific requirement 1 from the conversation",
    "Investment amount: $X if mentioned",
    "Specific concern or interest area"
  ],
  "suggestedSlideCount": 8,
  "tone": "professional|friendly|formal|educational"
}

IMPORTANT:
- Only set detected=true if there's a clear indication someone needs a presentation created
- Set confidence=high only if explicit request with clear details
- Set confidence=medium if implied need or partial details
- Set confidence=low if only vague mention
- If no presentation is mentioned, return detected=false with empty/null values`

  try {
    console.log('[PresentationDetector] Calling OpenAI for detection...')
    console.log('[PresentationDetector] Content preview:', context.content.substring(0, 200))

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const rawContent = response.choices[0].message.content || '{}'
    console.log('[PresentationDetector] OpenAI raw response:', rawContent.substring(0, 500))

    const result = JSON.parse(rawContent)
    console.log('[PresentationDetector] Parsed result:', {
      detected: result.detected,
      confidence: result.confidence,
      topicsCount: result.topics?.length,
      contextLength: result.context?.length,
    })

    if (!result.detected) {
      console.log('[PresentationDetector] No presentation detected in content')
      return null
    }

    return {
      detected: result.detected,
      confidence: result.confidence || 'low',
      clientName: result.clientName || context.contactName || null,
      clientCompany: result.clientCompany || context.contactCompany || null,
      presentationType: result.presentationType || 'sales_pitch',
      topics: result.topics || [],
      keyPoints: result.keyPoints || [],
      deadline: result.deadline || null,
      context: result.context || '',
      extractedRequirements: result.extractedRequirements || [],
      suggestedSlideCount: result.suggestedSlideCount || 8,
      tone: result.tone || 'professional',
    }
  } catch (error) {
    console.error('[PresentationDetector] Error detecting presentation request:', error)
    return null
  }
}

/**
 * Check if the detected request has enough information for AI to generate a presentation
 */
export function hasEnoughInfoForPresentation(request: PresentationRequest): boolean {
  // Need at least:
  // 1. Some topics or key points
  // 2. Medium or high confidence
  // 3. Some context about what's needed

  const hasTopics = request.topics.length > 0 || request.keyPoints.length > 0
  const hasConfidence = request.confidence === 'high' || request.confidence === 'medium'
  const hasContext = request.context.length > 20

  return hasTopics && hasConfidence && hasContext
}
