import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getOpenAIClient } from '@/lib/openai'

// ============================================================================
// Types
// ============================================================================

interface SongwritingTip {
  type: 'lyric_tip' | 'structure' | 'emotion' | 'hook' | 'imagery' | 'rhythm' | 'general'
  section?: 'verse' | 'chorus' | 'bridge' | 'pre_chorus' | 'intro' | 'outro'
  originalText?: string
  suggestion: string
  reasoning: string
  exampleRewrite?: string
}

interface CoachingResponse {
  tips: SongwritingTip[]
  overallFeedback: string
  songStrengths: string[]
  nextSteps: string[]
}

// ============================================================================
// POST - Get AI coaching tips for songwriting
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { content, vibe, mood, genre, inspirationStory, keyEmotions, focusArea } = body

    if (!content || content.trim().length < 10) {
      return NextResponse.json({
        tips: [],
        overallFeedback: 'Start writing your lyrics and I\'ll provide tips as you go!',
        songStrengths: [],
        nextSteps: ['Begin with your main idea or hook', 'Write freely without judging yourself first']
      })
    }

    const openai = getOpenAIClient()

    const systemPrompt = `You are an award-winning, Grammy-level songwriter and vocal coach who has written multiple Top 100 hits.
You've worked with artists like Adele, Ed Sheeran, Taylor Swift, and Bruno Mars.

Your role is to coach aspiring songwriters with warmth, encouragement, and expert insight.

COACHING STYLE:
- Be encouraging but honest - like a supportive mentor
- Point out what's working BEFORE suggesting improvements
- Give specific, actionable tips (not vague advice)
- Reference techniques used in hit songs when relevant
- Help them dig deeper emotionally
- Focus on making lyrics more vivid, specific, and relatable
- Suggest ways to strengthen hooks and memorable lines
- Consider the commercial appeal while maintaining authenticity

KEY PRINCIPLES FOR HIT SONGWRITING:
1. Specificity > Generality - "Tuesday morning coffee" beats "every day"
2. Show, don't tell - "My hands are shaking" beats "I'm nervous"
3. Universal emotions through specific stories
4. Strong hooks that stick in people's heads
5. Emotional contrast and journey
6. Conversational, natural language
7. Rhythm and flow that matches the intended feel
8. A clear "title moment" that people remember`

    const userPrompt = `Analyze this song and provide coaching tips:

SONG CONTEXT:
- Vibe: ${vibe || 'Not specified'}
- Mood: ${mood || 'Not specified'}
- Genre: ${genre || 'Not specified'}
- Key Emotions: ${keyEmotions?.join(', ') || 'Not specified'}
- Inspiration: ${inspirationStory || 'Not specified'}
${focusArea ? `- Focus Area: ${focusArea}` : ''}

CURRENT LYRICS:
${content}

Provide coaching in JSON format:
{
  "tips": [
    {
      "type": "lyric_tip|structure|emotion|hook|imagery|rhythm|general",
      "section": "verse|chorus|bridge|pre_chorus|null",
      "originalText": "the specific line or phrase you're addressing (if applicable)",
      "suggestion": "Your specific tip or suggestion",
      "reasoning": "Why this change would make the song stronger (reference hit songwriting techniques)",
      "exampleRewrite": "An optional rewritten version showing the improvement"
    }
  ],
  "overallFeedback": "2-3 sentences of encouraging overall feedback about the song's potential",
  "songStrengths": ["What's already working well 1", "Strength 2"],
  "nextSteps": ["Specific next step 1", "Next step 2", "Next step 3"]
}

Guidelines:
- Provide 3-5 specific, actionable tips
- Always include at least 2 song strengths
- Make suggestions that deepen emotion and specificity
- If something could be "a little deeper", show HOW to make it deeper
- Consider the genre and vibe when giving advice`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 2000
    })

    const responseContent = response.choices[0]?.message?.content
    if (!responseContent) {
      throw new Error('No response from OpenAI')
    }

    const coaching: CoachingResponse = JSON.parse(responseContent)

    // Save feedback to database
    const { data: existingDoc } = await supabase
      .from('songwriting_documents')
      .select('total_ai_interactions')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    const { error: updateError } = await supabase
      .from('songwriting_documents')
      .update({
        last_ai_feedback: coaching,
        total_ai_interactions: (existingDoc?.total_ai_interactions || 0) + 1,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error saving AI feedback:', updateError)
    }

    // Also save individual tips to feedback history
    if (coaching.tips && coaching.tips.length > 0) {
      const feedbackEntries = coaching.tips.map(tip => ({
        document_id: id,
        user_id: user.id,
        feedback_type: tip.type,
        section_type: tip.section || null,
        original_text: tip.originalText || null,
        suggestion: tip.suggestion,
        reasoning: tip.reasoning || null,
      }))

      await supabase
        .from('songwriting_ai_feedback')
        .insert(feedbackEntries)
    }

    return NextResponse.json(coaching)

  } catch (error) {
    console.error('Songwriting coach error:', error)
    return NextResponse.json({ error: 'Failed to get coaching tips' }, { status: 500 })
  }
}
