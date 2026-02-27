import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { analyzeWeeklyProgress, generateComprehensiveInsights } from '@/lib/openai'

// ============================================================================
// GET - Get user's weekly progress and AI feedback
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const weeks = parseInt(searchParams.get('weeks') || '8')
    const includeAIFeedback = searchParams.get('includeFeedback') !== 'false'

    // Get weekly progress data (includes new singer-focused metrics)
    const { data: weeklyProgress, error: progressError } = await supabase
      .from('pitch_training_weekly_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(weeks)

    // Get progress history for evolution tracking
    const { data: progressHistory } = await supabase
      .from('pitch_training_progress_history')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_type', 'daily')
      .order('period_start', { ascending: false })
      .limit(30)

    if (progressError) {
      console.error('Weekly progress fetch error:', progressError)
      return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
    }

    // Get recent AI feedback
    let aiFeedback = null
    if (includeAIFeedback) {
      const { data: feedback } = await supabase
        .from('pitch_training_ai_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('generated_at', { ascending: false })
        .limit(5)

      aiFeedback = feedback
    }

    // Calculate streaks and achievements for pitch trainer (includes new singer-focused metrics)
    const { data: recentSessions } = await supabase
      .from('pitch_training_sessions')
      .select('session_date, overall_score, avg_target_accuracy, avg_voice_stability, avg_semitone_deviation, pitch_tendency')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false })
      .limit(30)

    const stats = calculateStats(recentSessions || [])
    const singerMetrics = calculateSingerMetrics(recentSessions || [])

    // Get song pitch training data
    const { data: songWeeklyProgress } = await supabase
      .from('song_pitch_weekly_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(weeks)

    const { data: recentSongSessions } = await supabase
      .from('song_pitch_sessions')
      .select('session_date, accuracy_percent, song_title, song_artist, song_key')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false })
      .limit(30)

    const songStats = calculateSongStats(recentSongSessions || [])

    // Get rhythm training data
    const { data: rhythmWeeklyProgress } = await supabase
      .from('rhythm_training_weekly_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(weeks)

    const { data: recentRhythmSessions } = await supabase
      .from('rhythm_training_sessions')
      .select('session_date, on_beat_percent, bpm, time_signature, best_streak, timing_consistency, rhythm_tendency, avg_timing_offset_ms')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false })
      .limit(30)

    const rhythmStats = calculateRhythmStats(recentRhythmSessions || [])

    return NextResponse.json({
      // Pitch Trainer Pro data
      weeklyProgress: weeklyProgress || [],
      aiFeedback: aiFeedback || [],
      stats,
      // New singer-focused metrics
      singerMetrics,
      progressHistory: progressHistory || [],
      // Song Pitch Trainer data
      songWeeklyProgress: songWeeklyProgress || [],
      songStats,
      recentSongSessions: recentSongSessions || [],
      // Rhythm Trainer data
      rhythmWeeklyProgress: rhythmWeeklyProgress || [],
      rhythmStats,
      recentRhythmSessions: recentRhythmSessions || []
    })

  } catch (error) {
    console.error('Progress GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// POST - Generate new AI analysis for weekly progress
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { analysisType = 'weekly' } = body

    // Get weekly progress data
    const { data: weeklyProgress } = await supabase
      .from('pitch_training_weekly_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(8)

    if (!weeklyProgress || weeklyProgress.length === 0) {
      return NextResponse.json({
        error: 'No progress data available for analysis'
      }, { status: 400 })
    }

    // Get student context
    const { data: lessonNotes } = await supabase
      .from('notes_archive')
      .select('content')
      .or(`student_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: previousFeedback } = await supabase
      .from('pitch_training_ai_feedback')
      .select('summary')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(3)

    const studentContext = {
      lessonNotes: lessonNotes?.map(n => n.content?.substring(0, 200)) || [],
      previousAiFeedback: previousFeedback?.map(f => f.summary) || []
    }

    let analysis
    const currentWeek = {
      weekStartDate: weeklyProgress[0].week_start_date,
      avgPitchAccuracy: weeklyProgress[0].avg_pitch_accuracy,
      avgPitchOnsetSpeedMs: weeklyProgress[0].avg_pitch_onset_speed_ms,
      avgPitchStability: weeklyProgress[0].avg_pitch_stability,
      avgInTuneSustainMs: weeklyProgress[0].avg_in_tune_sustain_ms,
      avgOverallScore: weeklyProgress[0].avg_overall_score,
      totalSessions: weeklyProgress[0].total_sessions,
      pitchAccuracyChange: weeklyProgress[0].pitch_accuracy_change,
      pitchOnsetSpeedChange: weeklyProgress[0].pitch_onset_speed_change,
      pitchStabilityChange: weeklyProgress[0].pitch_stability_change,
      inTuneSustainChange: weeklyProgress[0].in_tune_sustain_change
    }

    const previousWeeks = weeklyProgress.slice(1).map(w => ({
      weekStartDate: w.week_start_date,
      avgPitchAccuracy: w.avg_pitch_accuracy,
      avgPitchOnsetSpeedMs: w.avg_pitch_onset_speed_ms,
      avgPitchStability: w.avg_pitch_stability,
      avgInTuneSustainMs: w.avg_in_tune_sustain_ms,
      avgOverallScore: w.avg_overall_score,
      totalSessions: w.total_sessions,
      pitchAccuracyChange: w.pitch_accuracy_change,
      pitchOnsetSpeedChange: w.pitch_onset_speed_change,
      pitchStabilityChange: w.pitch_stability_change,
      inTuneSustainChange: w.in_tune_sustain_change
    }))

    if (analysisType === 'comprehensive') {
      // Get recent session metrics for comprehensive analysis
      const { data: recentSessions } = await supabase
        .from('pitch_training_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('session_date', { ascending: false })
        .limit(10)

      const sessionMetrics = (recentSessions || []).map(s => ({
        avgPitchAccuracy: s.avg_pitch_accuracy,
        avgPitchOnsetSpeedMs: s.avg_pitch_onset_speed_ms,
        avgPitchStability: s.avg_pitch_stability,
        avgInTuneSustainMs: s.avg_in_tune_sustain_ms,
        overallScore: s.overall_score,
        totalNotesAttempted: s.total_notes_attempted,
        totalNotesMatched: s.total_notes_matched,
        durationSeconds: s.duration_seconds
      }))

      analysis = await generateComprehensiveInsights(
        sessionMetrics,
        [currentWeek, ...previousWeeks],
        studentContext
      )
    } else {
      analysis = await analyzeWeeklyProgress(
        currentWeek,
        previousWeeks,
        studentContext
      )
    }

    // Save the feedback
    const { data: savedFeedback, error: saveError } = await supabase
      .from('pitch_training_ai_feedback')
      .insert({
        user_id: user.id,
        feedback_type: analysisType,
        reference_id: null,
        summary: analysis.summary,
        strengths: analysis.strengths,
        areas_for_improvement: analysis.areasForImprovement,
        personalized_tips: analysis.personalizedTips,
        recommended_exercises: analysis.recommendedExercises,
        context_data: { currentWeek, previousWeeks: previousWeeks.slice(0, 3) }
      })
      .select()
      .single()

    if (saveError) {
      console.error('Feedback save error:', saveError)
    }

    return NextResponse.json({
      analysis,
      feedbackId: savedFeedback?.id
    })

  } catch (error) {
    console.error('Progress analysis error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// Helper: Calculate stats
// ============================================================================

function calculateStats(sessions: { session_date: string; overall_score: number }[]) {
  if (sessions.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalSessions: 0,
      averageScore: 0,
      bestScore: 0,
      daysThisWeek: 0
    }
  }

  // Calculate current streak
  let currentStreak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < sessions.length; i++) {
    const sessionDate = new Date(sessions[i].session_date)
    sessionDate.setHours(0, 0, 0, 0)

    const expectedDate = new Date(today)
    expectedDate.setDate(expectedDate.getDate() - i)

    if (sessionDate.getTime() === expectedDate.getTime()) {
      currentStreak++
    } else if (i === 0 && sessionDate.getTime() === expectedDate.getTime() - 86400000) {
      // Allow for yesterday if no session today yet
      currentStreak++
    } else {
      break
    }
  }

  // Calculate longest streak
  let longestStreak = 0
  let tempStreak = 1

  for (let i = 1; i < sessions.length; i++) {
    const current = new Date(sessions[i].session_date)
    const previous = new Date(sessions[i - 1].session_date)
    const diffDays = Math.round((previous.getTime() - current.getTime()) / 86400000)

    if (diffDays === 1) {
      tempStreak++
    } else {
      longestStreak = Math.max(longestStreak, tempStreak)
      tempStreak = 1
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak, currentStreak)

  // Calculate days this week
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const daysThisWeek = sessions.filter(s => {
    const d = new Date(s.session_date)
    return d >= weekStart
  }).length

  // Calculate averages
  const scores = sessions.map(s => s.overall_score)
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length
  const bestScore = Math.max(...scores)

  return {
    currentStreak,
    longestStreak,
    totalSessions: sessions.length,
    averageScore: Math.round(averageScore * 10) / 10,
    bestScore: Math.round(bestScore * 10) / 10,
    daysThisWeek
  }
}

// ============================================================================
// Helper: Calculate song stats
// ============================================================================

function calculateSongStats(sessions: { session_date: string; accuracy_percent: number; song_title?: string }[]) {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      averageAccuracy: 0,
      bestAccuracy: 0,
      uniqueSongs: 0,
      daysThisWeek: 0
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Calculate days this week
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const daysThisWeek = sessions.filter(s => {
    const d = new Date(s.session_date)
    return d >= weekStart
  }).length

  // Calculate averages
  const accuracies = sessions.map(s => s.accuracy_percent || 0)
  const averageAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length
  const bestAccuracy = Math.max(...accuracies)

  // Count unique songs
  const uniqueSongs = new Set(sessions.map(s => s.song_title)).size

  return {
    totalSessions: sessions.length,
    averageAccuracy: Math.round(averageAccuracy * 10) / 10,
    bestAccuracy: Math.round(bestAccuracy * 10) / 10,
    uniqueSongs,
    daysThisWeek
  }
}

// ============================================================================
// Helper: Calculate rhythm stats
// ============================================================================

// ============================================================================
// Helper: Calculate singer-focused metrics
// ============================================================================

interface SessionWithSingerMetrics {
  session_date: string
  overall_score: number
  avg_target_accuracy?: number | null
  avg_voice_stability?: number | null
  avg_semitone_deviation?: number | null
  pitch_tendency?: string | null
}

function calculateSingerMetrics(sessions: SessionWithSingerMetrics[]) {
  if (sessions.length === 0) {
    return {
      avgTargetAccuracy: 0,
      avgVoiceStability: 0,
      avgSemitoneDeviation: 0,
      predominantTendency: 'on-target' as const,
      hasNewMetrics: false,
      // Evolution tracking
      targetAccuracyTrend: 0,
      voiceStabilityTrend: 0,
      overallScoreTrend: 0
    }
  }

  // Check if sessions have the new metrics
  const sessionsWithMetrics = sessions.filter(s => s.avg_target_accuracy !== null && s.avg_target_accuracy !== undefined)
  const hasNewMetrics = sessionsWithMetrics.length > 0

  if (!hasNewMetrics) {
    return {
      avgTargetAccuracy: 0,
      avgVoiceStability: 0,
      avgSemitoneDeviation: 0,
      predominantTendency: 'on-target' as const,
      hasNewMetrics: false,
      targetAccuracyTrend: 0,
      voiceStabilityTrend: 0,
      overallScoreTrend: 0
    }
  }

  // Calculate averages from sessions with new metrics
  const avgTargetAccuracy = sessionsWithMetrics.reduce((sum, s) => sum + (s.avg_target_accuracy || 0), 0) / sessionsWithMetrics.length
  const avgVoiceStability = sessionsWithMetrics.reduce((sum, s) => sum + (s.avg_voice_stability || 0), 0) / sessionsWithMetrics.length
  const avgSemitoneDeviation = sessionsWithMetrics.reduce((sum, s) => sum + (s.avg_semitone_deviation || 0), 0) / sessionsWithMetrics.length

  // Calculate predominant tendency
  const tendencyCounts = { sharp: 0, flat: 0, 'on-target': 0 }
  sessionsWithMetrics.forEach(s => {
    const tendency = (s.pitch_tendency || 'on-target') as keyof typeof tendencyCounts
    if (tendency in tendencyCounts) {
      tendencyCounts[tendency]++
    }
  })
  const predominantTendency = Object.entries(tendencyCounts).sort((a, b) => b[1] - a[1])[0][0] as 'sharp' | 'flat' | 'on-target'

  // Calculate trends (compare first half vs second half of sessions)
  let targetAccuracyTrend = 0
  let voiceStabilityTrend = 0
  let overallScoreTrend = 0

  if (sessionsWithMetrics.length >= 4) {
    const midpoint = Math.floor(sessionsWithMetrics.length / 2)
    const recentHalf = sessionsWithMetrics.slice(0, midpoint) // Most recent
    const olderHalf = sessionsWithMetrics.slice(midpoint) // Older

    const recentAvgTarget = recentHalf.reduce((sum, s) => sum + (s.avg_target_accuracy || 0), 0) / recentHalf.length
    const olderAvgTarget = olderHalf.reduce((sum, s) => sum + (s.avg_target_accuracy || 0), 0) / olderHalf.length
    targetAccuracyTrend = recentAvgTarget - olderAvgTarget

    const recentAvgStability = recentHalf.reduce((sum, s) => sum + (s.avg_voice_stability || 0), 0) / recentHalf.length
    const olderAvgStability = olderHalf.reduce((sum, s) => sum + (s.avg_voice_stability || 0), 0) / olderHalf.length
    voiceStabilityTrend = recentAvgStability - olderAvgStability

    const recentAvgScore = recentHalf.reduce((sum, s) => sum + (s.overall_score || 0), 0) / recentHalf.length
    const olderAvgScore = olderHalf.reduce((sum, s) => sum + (s.overall_score || 0), 0) / olderHalf.length
    overallScoreTrend = recentAvgScore - olderAvgScore
  }

  return {
    avgTargetAccuracy: Math.round(avgTargetAccuracy * 10) / 10,
    avgVoiceStability: Math.round(avgVoiceStability * 10) / 10,
    avgSemitoneDeviation: Math.round(avgSemitoneDeviation * 100) / 100,
    predominantTendency,
    hasNewMetrics: true,
    targetAccuracyTrend: Math.round(targetAccuracyTrend * 10) / 10,
    voiceStabilityTrend: Math.round(voiceStabilityTrend * 10) / 10,
    overallScoreTrend: Math.round(overallScoreTrend * 10) / 10
  }
}

interface RhythmSession {
  session_date: string
  on_beat_percent: number
  bpm?: number
  timing_consistency?: number | null
  rhythm_tendency?: string | null
  avg_timing_offset_ms?: number | null
}

function calculateRhythmStats(sessions: RhythmSession[]) {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      avgOnBeatPercent: 0,
      avgConsistency: 0,
      bestOnBeatPercent: 0,
      daysThisWeek: 0,
      predominantTendency: 'on-time' as const,
      avgTimingOffset: 0
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Calculate days this week (use Monday as week start for consistency with PostgreSQL)
  const weekStart = new Date(today)
  const dayOfWeek = weekStart.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  weekStart.setDate(weekStart.getDate() + mondayOffset)

  const daysThisWeek = sessions.filter(s => {
    const d = new Date(s.session_date)
    return d >= weekStart
  }).length

  // Calculate averages
  const onBeatPercentages = sessions.map(s => s.on_beat_percent || 0)
  const avgOnBeatPercent = onBeatPercentages.reduce((a, b) => a + b, 0) / onBeatPercentages.length
  const bestOnBeatPercent = Math.max(...onBeatPercentages)

  // Calculate average consistency from sessions that have it
  const sessionsWithConsistency = sessions.filter(s => s.timing_consistency != null)
  const avgConsistency = sessionsWithConsistency.length > 0
    ? sessionsWithConsistency.reduce((sum, s) => sum + (s.timing_consistency || 0), 0) / sessionsWithConsistency.length
    : 0

  // Calculate predominant tendency
  const tendencyCounts = { early: 0, late: 0, 'on-time': 0 }
  sessions.forEach(s => {
    const tendency = (s.rhythm_tendency || 'on-time') as keyof typeof tendencyCounts
    if (tendency in tendencyCounts) {
      tendencyCounts[tendency]++
    }
  })
  const predominantTendency = Object.entries(tendencyCounts)
    .sort((a, b) => b[1] - a[1])[0][0] as 'early' | 'late' | 'on-time'

  // Calculate average timing offset
  const sessionsWithOffset = sessions.filter(s => s.avg_timing_offset_ms != null)
  const avgTimingOffset = sessionsWithOffset.length > 0
    ? sessionsWithOffset.reduce((sum, s) => sum + (s.avg_timing_offset_ms || 0), 0) / sessionsWithOffset.length
    : 0

  return {
    totalSessions: sessions.length,
    avgOnBeatPercent: Math.round(avgOnBeatPercent * 10) / 10,
    avgConsistency: Math.round(avgConsistency * 10) / 10,
    bestOnBeatPercent: Math.round(bestOnBeatPercent * 10) / 10,
    daysThisWeek,
    predominantTendency,
    avgTimingOffset: Math.round(avgTimingOffset * 10) / 10
  }
}
