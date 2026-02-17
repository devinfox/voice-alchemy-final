import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getOpenAIClient } from '@/lib/openai'

// ============================================================================
// Types
// ============================================================================

interface NotesAnalysisResult {
  summary: string
  vocalStrengths: string[]
  areasToImprove: string[]
  practiceRecommendations: string[]
  pitchTrainingFocus: string[]
  rhythmTrainingFocus: string[]
  weeklyGoals: string[]
  encouragement: string
}

// ============================================================================
// POST - Analyze notes and generate training insights
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch recent lesson notes for this user
    const { data: archivedNotes } = await supabase
      .from('notes_archive')
      .select('content, content_html, ai_summary, class_started_at, class_ended_at')
      .eq('student_id', user.id)
      .order('class_started_at', { ascending: false })
      .limit(10)

    // Fetch pitch training progress
    const { data: pitchProgress } = await supabase
      .from('pitch_training_weekly_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(4)

    // Fetch rhythm training progress
    const { data: rhythmProgress } = await supabase
      .from('rhythm_training_weekly_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(4)

    // Fetch recent AI feedback
    const { data: previousFeedback } = await supabase
      .from('pitch_training_ai_feedback')
      .select('summary, strengths, areas_for_improvement')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(3)

    // Build context for AI analysis
    const notesContext = archivedNotes?.map(note => {
      const date = note.class_started_at
        ? new Date(note.class_started_at).toLocaleDateString()
        : 'Unknown date'
      const content = note.content || ''
      const aiSummary = note.ai_summary as { summary?: string; teacherFeedback?: string[] } | null

      return `
Lesson on ${date}:
Notes: ${content.slice(0, 500)}
${aiSummary?.summary ? `AI Summary: ${aiSummary.summary}` : ''}
${aiSummary?.teacherFeedback?.length ? `Teacher Feedback: ${aiSummary.teacherFeedback.join('; ')}` : ''}
`
    }).join('\n---\n') || 'No lesson notes available'

    const pitchContext = pitchProgress?.length
      ? `Pitch Training (last ${pitchProgress.length} weeks):
${pitchProgress.map(p => `Week of ${p.week_start_date}: Accuracy ${p.avg_pitch_accuracy?.toFixed(1) || 'N/A'}%, Stability ${p.avg_pitch_stability?.toFixed(1) || 'N/A'}%, ${p.total_sessions} sessions`).join('\n')}`
      : 'No pitch training data'

    const rhythmContext = rhythmProgress?.length
      ? `Rhythm Training (last ${rhythmProgress.length} weeks):
${rhythmProgress.map(p => `Week of ${p.week_start_date}: On-beat ${p.avg_on_beat_percent?.toFixed(1) || 'N/A'}%, Consistency ${p.avg_timing_consistency?.toFixed(1) || 'N/A'}%, ${p.total_sessions} sessions`).join('\n')}`
      : 'No rhythm training data'

    const previousContext = previousFeedback?.length
      ? `Previous AI Analysis Themes:
${previousFeedback.map(f => f.summary).join('\n')}`
      : ''

    // Generate AI analysis
    const openai = getOpenAIClient()

    const systemPrompt = `You are an expert vocal coach AI analyzing a student's lesson notes and training data to provide personalized insights and recommendations.

Your analysis should:
- Be encouraging and supportive while being honest about areas to improve
- Connect lesson notes with self-practice training data
- Provide specific, actionable recommendations
- Set realistic weekly goals based on current progress
- Identify patterns across lessons and training sessions

Focus on the holistic development of the student's vocal abilities, including pitch accuracy, timing/rhythm, and any techniques mentioned in lesson notes.`

    const userPrompt = `Analyze this student's recent vocal training data and provide comprehensive insights:

RECENT LESSON NOTES:
${notesContext}

${pitchContext}

${rhythmContext}

${previousContext}

Based on all available data, provide your analysis in JSON format:
{
  "summary": "A 3-4 sentence overview of the student's current progress, connecting lessons with self-practice",
  "vocalStrengths": ["strength observed from notes/data 1", "strength 2", "strength 3"],
  "areasToImprove": ["area that needs work based on notes/data 1", "area 2"],
  "practiceRecommendations": ["specific practice recommendation 1", "recommendation 2", "recommendation 3"],
  "pitchTrainingFocus": ["what to focus on in pitch training 1", "focus 2"],
  "rhythmTrainingFocus": ["what to focus on in rhythm training 1", "focus 2"],
  "weeklyGoals": ["achievable goal for this week 1", "goal 2", "goal 3"],
  "encouragement": "A brief motivational message based on their progress"
}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const analysis: NotesAnalysisResult = JSON.parse(content)

    // Save the analysis to pitch_training_ai_feedback
    const { data: savedFeedback, error: saveError } = await supabase
      .from('pitch_training_ai_feedback')
      .insert({
        user_id: user.id,
        feedback_type: 'notes_analysis',
        reference_id: null,
        summary: analysis.summary,
        strengths: analysis.vocalStrengths,
        areas_for_improvement: analysis.areasToImprove,
        personalized_tips: analysis.practiceRecommendations,
        recommended_exercises: [...analysis.pitchTrainingFocus, ...analysis.rhythmTrainingFocus],
        context_data: {
          weeklyGoals: analysis.weeklyGoals,
          rhythmTrainingFocus: analysis.rhythmTrainingFocus,
          pitchTrainingFocus: analysis.pitchTrainingFocus,
          encouragement: analysis.encouragement,
          notesAnalyzed: archivedNotes?.length || 0,
          pitchWeeksAnalyzed: pitchProgress?.length || 0,
          rhythmWeeksAnalyzed: rhythmProgress?.length || 0
        }
      })
      .select()
      .single()

    if (saveError) {
      console.error('Failed to save analysis:', saveError)
    }

    return NextResponse.json({
      success: true,
      analysis,
      feedbackId: savedFeedback?.id,
      dataContext: {
        notesAnalyzed: archivedNotes?.length || 0,
        pitchWeeksAnalyzed: pitchProgress?.length || 0,
        rhythmWeeksAnalyzed: rhythmProgress?.length || 0
      }
    })

  } catch (error) {
    console.error('Notes analysis error:', error)
    return NextResponse.json({ error: 'Failed to analyze notes' }, { status: 500 })
  }
}

// ============================================================================
// GET - Get latest notes analysis
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: latestAnalysis } = await supabase
      .from('pitch_training_ai_feedback')
      .select('*')
      .eq('user_id', user.id)
      .eq('feedback_type', 'notes_analysis')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestAnalysis) {
      return NextResponse.json({ analysis: null })
    }

    // Reconstruct the analysis format
    const contextData = latestAnalysis.context_data as {
      weeklyGoals?: string[]
      rhythmTrainingFocus?: string[]
      pitchTrainingFocus?: string[]
      encouragement?: string
    } | null

    return NextResponse.json({
      analysis: {
        summary: latestAnalysis.summary,
        vocalStrengths: latestAnalysis.strengths,
        areasToImprove: latestAnalysis.areas_for_improvement,
        practiceRecommendations: latestAnalysis.personalized_tips,
        pitchTrainingFocus: contextData?.pitchTrainingFocus || [],
        rhythmTrainingFocus: contextData?.rhythmTrainingFocus || [],
        weeklyGoals: contextData?.weeklyGoals || [],
        encouragement: contextData?.encouragement || ''
      },
      generatedAt: latestAnalysis.generated_at
    })

  } catch (error) {
    console.error('Get notes analysis error:', error)
    return NextResponse.json({ error: 'Failed to get analysis' }, { status: 500 })
  }
}
