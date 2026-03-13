import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getOpenAIClient } from '@/lib/openai'

// ============================================================================
// Types
// ============================================================================

interface ScaleAnalysisResult {
  summary: string
  strengths: string[]
  challengingScales: string[]
  pitchTendencies: string[]
  sequenceInsights: string[]
  practiceRecommendations: string[]
  weeklyGoals: string[]
  encouragement: string
}

interface NoteMetricAggregate {
  note_name: string
  octave: number
  avg_pitch_accuracy: number
  avg_cents_deviation: number
  times_practiced: number
  avg_was_in_order: number
}

interface ScaleSessionAggregate {
  scale_type: string
  root_note: string
  direction: string
  avg_overall_score: number
  avg_sequence_accuracy: number
  avg_pitch_accuracy: number
  session_count: number
}

// ============================================================================
// POST - Analyze scale training and generate insights
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all scale training sessions for this user (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: sessions } = await supabase
      .from('scale_training_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('session_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('session_date', { ascending: false })

    // Fetch note metrics for detailed analysis
    const { data: noteMetrics } = await supabase
      .from('scale_training_note_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500)

    // Fetch weekly progress
    const { data: weeklyProgress } = await supabase
      .from('scale_training_weekly_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(4)

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        error: 'Not enough data for analysis. Complete more scale training sessions first.',
        sessionsNeeded: 5,
        currentSessions: 0
      }, { status: 400 })
    }

    // Aggregate data by scale type
    const scaleAggregates: Record<string, ScaleSessionAggregate> = {}
    sessions.forEach(session => {
      const key = `${session.scale_type}-${session.root_note}-${session.direction}`
      if (!scaleAggregates[key]) {
        scaleAggregates[key] = {
          scale_type: session.scale_type,
          root_note: session.root_note,
          direction: session.direction,
          avg_overall_score: 0,
          avg_sequence_accuracy: 0,
          avg_pitch_accuracy: 0,
          session_count: 0
        }
      }
      const agg = scaleAggregates[key]
      agg.avg_overall_score += session.overall_score || 0
      agg.avg_sequence_accuracy += session.sequence_accuracy || 0
      agg.avg_pitch_accuracy += session.pitch_accuracy || 0
      agg.session_count++
    })

    // Calculate averages
    Object.values(scaleAggregates).forEach(agg => {
      agg.avg_overall_score /= agg.session_count
      agg.avg_sequence_accuracy /= agg.session_count
      agg.avg_pitch_accuracy /= agg.session_count
    })

    // Aggregate note metrics
    const noteAggregates: Record<string, NoteMetricAggregate> = {}
    noteMetrics?.forEach(metric => {
      const key = `${metric.note_name}-${metric.octave}`
      if (!noteAggregates[key]) {
        noteAggregates[key] = {
          note_name: metric.note_name,
          octave: metric.octave,
          avg_pitch_accuracy: 0,
          avg_cents_deviation: 0,
          times_practiced: 0,
          avg_was_in_order: 0
        }
      }
      const agg = noteAggregates[key]
      agg.avg_pitch_accuracy += metric.pitch_accuracy || 0
      agg.avg_cents_deviation += metric.cents_deviation || 0
      agg.avg_was_in_order += metric.was_in_order ? 1 : 0
      agg.times_practiced++
    })

    // Calculate note averages
    Object.values(noteAggregates).forEach(agg => {
      agg.avg_pitch_accuracy /= agg.times_practiced
      agg.avg_cents_deviation /= agg.times_practiced
      agg.avg_was_in_order /= agg.times_practiced
    })

    // Find patterns
    const sortedScales = Object.values(scaleAggregates).sort((a, b) => a.avg_overall_score - b.avg_overall_score)
    const challengingScales = sortedScales.slice(0, 3)
    const strongScales = sortedScales.slice(-3).reverse()

    const sortedNotes = Object.values(noteAggregates).sort((a, b) => a.avg_pitch_accuracy - b.avg_pitch_accuracy)
    const difficultNotes = sortedNotes.slice(0, 5)

    // Analyze pitch tendencies
    const flatNotes = Object.values(noteAggregates).filter(n => n.avg_cents_deviation < -10)
    const sharpNotes = Object.values(noteAggregates).filter(n => n.avg_cents_deviation > 10)

    // Analyze ascending vs descending
    const ascendingSessions = sessions.filter(s => s.direction === 'ascending')
    const descendingSessions = sessions.filter(s => s.direction === 'descending')
    const avgAscendingScore = ascendingSessions.length > 0
      ? ascendingSessions.reduce((s, x) => s + (x.overall_score || 0), 0) / ascendingSessions.length
      : null
    const avgDescendingScore = descendingSessions.length > 0
      ? descendingSessions.reduce((s, x) => s + (x.overall_score || 0), 0) / descendingSessions.length
      : null

    // Build context for AI
    const scalesContext = `
Scale Performance (last 30 days, ${sessions.length} total sessions):

CHALLENGING SCALES (lowest scores):
${challengingScales.map(s =>
  `- ${s.root_note} ${s.scale_type.replace('_', ' ')} (${s.direction}): ${s.avg_overall_score.toFixed(1)}% overall, ${s.avg_pitch_accuracy.toFixed(1)}% pitch, ${s.session_count} sessions`
).join('\n')}

STRONGEST SCALES (highest scores):
${strongScales.map(s =>
  `- ${s.root_note} ${s.scale_type.replace('_', ' ')} (${s.direction}): ${s.avg_overall_score.toFixed(1)}% overall, ${s.avg_pitch_accuracy.toFixed(1)}% pitch, ${s.session_count} sessions`
).join('\n')}
`

    const notesContext = `
NOTE-BY-NOTE ANALYSIS:

DIFFICULT NOTES (lowest pitch accuracy):
${difficultNotes.map(n =>
  `- ${n.note_name}${n.octave}: ${n.avg_pitch_accuracy.toFixed(1)}% accuracy, avg ${n.avg_cents_deviation > 0 ? '+' : ''}${n.avg_cents_deviation.toFixed(1)} cents, practiced ${n.times_practiced} times`
).join('\n')}

PITCH TENDENCIES:
${flatNotes.length > 0 ? `Tends to sing FLAT on: ${flatNotes.map(n => `${n.note_name}${n.octave} (${n.avg_cents_deviation.toFixed(0)} cents)`).join(', ')}` : 'No consistent flat tendency'}
${sharpNotes.length > 0 ? `Tends to sing SHARP on: ${sharpNotes.map(n => `${n.note_name}${n.octave} (+${n.avg_cents_deviation.toFixed(0)} cents)`).join(', ')}` : 'No consistent sharp tendency'}
`

    const directionContext = `
ASCENDING VS DESCENDING:
${avgAscendingScore !== null ? `Ascending scales: ${avgAscendingScore.toFixed(1)}% average (${ascendingSessions.length} sessions)` : 'No ascending scale data'}
${avgDescendingScore !== null ? `Descending scales: ${avgDescendingScore.toFixed(1)}% average (${descendingSessions.length} sessions)` : 'No descending scale data'}
${avgAscendingScore !== null && avgDescendingScore !== null
  ? `Difference: ${Math.abs(avgAscendingScore - avgDescendingScore).toFixed(1)}% ${avgAscendingScore > avgDescendingScore ? '(stronger ascending)' : '(stronger descending)'}`
  : ''}
`

    const progressContext = weeklyProgress?.length
      ? `
WEEKLY PROGRESS:
${weeklyProgress.map(w =>
  `Week of ${w.week_start_date}: ${w.avg_overall_score?.toFixed(1) || 'N/A'}% overall, ${w.total_sessions} sessions, practiced ${w.total_scales_practiced || 0} unique scales`
).join('\n')}
`
      : 'No weekly progress data available'

    // Generate AI analysis
    const openai = getOpenAIClient()

    const systemPrompt = `You are an expert vocal coach AI specializing in scale training analysis. You help singers improve their pitch accuracy, scale sequence memory, and overall musicianship.

Your analysis should:
- Be encouraging while providing honest, specific feedback
- Identify patterns in the data (struggling notes, tendency to go flat/sharp, weaker scales)
- Provide actionable practice recommendations
- Set realistic goals based on current performance
- Consider both pitch accuracy AND sequence accuracy (singing notes in order)
- Understand that scales going up vs down can have different challenges`

    const userPrompt = `Analyze this singer's scale training data and provide comprehensive insights:

${scalesContext}

${notesContext}

${directionContext}

${progressContext}

Based on all available data, provide your analysis in JSON format:
{
  "summary": "A 3-4 sentence overview of the student's scale training progress, highlighting key patterns and overall trajectory",
  "strengths": ["specific strength 1", "strength 2", "strength 3"],
  "challengingScales": ["specific scale challenge with context 1", "challenge 2", "challenge 3"],
  "pitchTendencies": ["specific pitch tendency observation 1", "tendency 2"],
  "sequenceInsights": ["observation about note order/sequence accuracy 1", "insight 2"],
  "practiceRecommendations": ["specific, actionable recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"],
  "weeklyGoals": ["achievable goal for this week 1", "goal 2", "goal 3"],
  "encouragement": "A motivational message acknowledging their efforts and progress"
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

    const analysis: ScaleAnalysisResult = JSON.parse(content)

    // Save the analysis (reusing pitch_training_ai_feedback table with different feedback_type)
    const { data: savedFeedback, error: saveError } = await supabase
      .from('pitch_training_ai_feedback')
      .insert({
        user_id: user.id,
        feedback_type: 'scale_analysis',
        reference_id: null,
        summary: analysis.summary,
        strengths: analysis.strengths,
        areas_for_improvement: analysis.challengingScales,
        personalized_tips: analysis.practiceRecommendations,
        recommended_exercises: analysis.sequenceInsights,
        context_data: {
          pitchTendencies: analysis.pitchTendencies,
          weeklyGoals: analysis.weeklyGoals,
          encouragement: analysis.encouragement,
          sessionsAnalyzed: sessions.length,
          notesAnalyzed: noteMetrics?.length || 0,
          weeksAnalyzed: weeklyProgress?.length || 0
        }
      })
      .select()
      .single()

    if (saveError) {
      console.error('Failed to save scale analysis:', saveError)
    }

    return NextResponse.json({
      success: true,
      analysis,
      feedbackId: savedFeedback?.id,
      dataContext: {
        sessionsAnalyzed: sessions.length,
        notesAnalyzed: noteMetrics?.length || 0,
        weeksAnalyzed: weeklyProgress?.length || 0
      }
    })

  } catch (error) {
    console.error('Scale analysis error:', error)
    return NextResponse.json({ error: 'Failed to analyze scale training' }, { status: 500 })
  }
}

// ============================================================================
// GET - Get latest scale analysis
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
      .eq('feedback_type', 'scale_analysis')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestAnalysis) {
      return NextResponse.json({ analysis: null })
    }

    // Reconstruct the analysis format
    const contextData = latestAnalysis.context_data as {
      pitchTendencies?: string[]
      weeklyGoals?: string[]
      encouragement?: string
    } | null

    return NextResponse.json({
      analysis: {
        summary: latestAnalysis.summary,
        strengths: latestAnalysis.strengths,
        challengingScales: latestAnalysis.areas_for_improvement,
        pitchTendencies: contextData?.pitchTendencies || [],
        sequenceInsights: latestAnalysis.recommended_exercises,
        practiceRecommendations: latestAnalysis.personalized_tips,
        weeklyGoals: contextData?.weeklyGoals || [],
        encouragement: contextData?.encouragement || ''
      },
      generatedAt: latestAnalysis.generated_at
    })

  } catch (error) {
    console.error('Get scale analysis error:', error)
    return NextResponse.json({ error: 'Failed to get analysis' }, { status: 500 })
  }
}
