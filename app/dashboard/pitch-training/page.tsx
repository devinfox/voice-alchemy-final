'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, Target, Clock, Zap, Award, RefreshCw, Sparkles, Music2, Mic2, Activity, Brain, FileText, BookOpen, ChevronRight, Music } from 'lucide-react'
import AIAnalysisPanel from '@/components/AIAnalysisPanel'
import ScaleAnalysisPanel from '@/components/ScaleAnalysisPanel'

interface WeeklyProgress {
  id: string
  week_start_date: string
  avg_pitch_accuracy: number | null
  avg_pitch_onset_speed_ms: number | null
  avg_pitch_stability: number | null
  avg_in_tune_sustain_ms: number | null
  avg_overall_score: number | null
  total_sessions: number
  total_notes_attempted: number | null
  total_practice_time_seconds: number | null
  pitch_accuracy_change: number | null
  pitch_onset_speed_change: number | null
  pitch_stability_change: number | null
  in_tune_sustain_change: number | null
  // New singer-focused metrics
  avg_target_accuracy: number | null
  avg_voice_stability: number | null
  target_accuracy_change: number | null
  voice_stability_change: number | null
  predominant_tendency: 'sharp' | 'flat' | 'on-target' | null
}

interface SingerMetrics {
  avgTargetAccuracy: number
  avgVoiceStability: number
  avgSemitoneDeviation: number
  predominantTendency: 'sharp' | 'flat' | 'on-target'
  hasNewMetrics: boolean
  targetAccuracyTrend: number
  voiceStabilityTrend: number
  overallScoreTrend: number
}

interface ProgressHistoryEntry {
  id: string
  period_start: string
  period_end: string
  target_accuracy: number | null
  voice_stability: number | null
  overall_score: number | null
  target_accuracy_delta: number | null
  voice_stability_delta: number | null
  overall_score_delta: number | null
  total_sessions: number
  total_notes_attempted: number | null
}

interface SongWeeklyProgress {
  id: string
  week_start_date: string
  avg_accuracy_percent: number | null
  avg_cents_off: number | null
  total_notes: number | null
  total_notes_in_key: number | null
  total_sessions: number
  total_songs_practiced: number | null
  total_practice_time_seconds: number | null
  accuracy_change: number | null
}

interface AIFeedback {
  id: string
  feedback_type: string
  summary: string
  strengths: string[]
  areas_for_improvement: string[]
  personalized_tips: string[]
  recommended_exercises: string[]
  generated_at: string
}

interface Stats {
  currentStreak: number
  longestStreak: number
  totalSessions: number
  averageScore: number
  bestScore: number
  daysThisWeek: number
}

interface SongStats {
  totalSessions: number
  averageAccuracy: number
  bestAccuracy: number
  uniqueSongs: number
  daysThisWeek: number
}

interface SongSession {
  session_date: string
  accuracy_percent: number
  song_title: string
  song_artist: string
  song_key: string
}

interface RhythmWeeklyProgress {
  id: string
  week_start_date: string
  avg_timing_offset_ms: number | null
  avg_timing_consistency: number | null
  avg_on_beat_percent: number | null
  avg_overall_score: number | null
  total_sessions: number
  total_beats_attempted: number | null
  total_practice_time_seconds: number | null
  min_bpm_practiced: number | null
  max_bpm_practiced: number | null
  avg_bpm_practiced: number | null
  timing_offset_change: number | null
  consistency_change: number | null
  on_beat_percent_change: number | null
}

interface RhythmStats {
  totalSessions: number
  avgOnBeatPercent: number
  avgConsistency: number
  bestOnBeatPercent: number
  daysThisWeek: number
  predominantTendency?: 'early' | 'late' | 'on-time'
  avgTimingOffset?: number
}

interface RhythmSession {
  session_date: string
  on_beat_percent: number
  bpm: number
  time_signature: string
  best_streak: number
}

interface ScaleWeeklyProgress {
  id: string
  week_start_date: string
  avg_sequence_accuracy: number | null
  avg_pitch_accuracy: number | null
  avg_timing_consistency: number | null
  avg_overall_score: number | null
  total_sessions: number
  total_scales_practiced: number | null
  total_notes_attempted: number | null
  total_practice_time_seconds: number | null
  most_practiced_scale: string | null
  most_practiced_root: string | null
  sequence_accuracy_change: number | null
  pitch_accuracy_change: number | null
  overall_score_change: number | null
}

interface ScaleStats {
  totalSessions: number
  avgOverallScore: number
  bestOverallScore: number
  avgSequenceAccuracy: number
  avgPitchAccuracy: number
  uniqueScales: number
  daysThisWeek: number
  avgTempo: number
  minTempo: number
  maxTempo: number
}

interface ScaleSession {
  session_date: string
  scale_type: string
  root_note: string
  direction: string
  tempo_bpm: number
  overall_score: number
  sequence_accuracy: number
  pitch_accuracy: number
}

interface LessonNote {
  id: string
  class_started_at: string
  class_ended_at: string
  content: string
  content_html: string
  ai_summary: {
    summary?: string
    keyTopicsCovered?: string[]
    exercisesPracticed?: string[]
    teacherFeedback?: string[]
    studentProgress?: string[]
    homeworkAssignments?: string[]
    notesHighlights?: string[]
  } | null
}

interface ProgressData {
  weeklyProgress: WeeklyProgress[]
  songWeeklyProgress: SongWeeklyProgress[]
  rhythmWeeklyProgress: RhythmWeeklyProgress[]
  scaleWeeklyProgress?: ScaleWeeklyProgress[]
  aiFeedback: AIFeedback[]
  stats: Stats
  songStats: SongStats
  rhythmStats: RhythmStats
  scaleStats?: ScaleStats
  recentSongSessions: SongSession[]
  recentRhythmSessions: RhythmSession[]
  recentScaleSessions?: ScaleSession[]
  recentLessonNotes?: LessonNote[]
  // New singer-focused data
  singerMetrics?: SingerMetrics
  progressHistory?: ProgressHistoryEntry[]
}

function formatChange(change: number | null, inverted: boolean = false): { text: string; color: string; icon: typeof TrendingUp } {
  if (change === null || change === undefined) {
    return { text: '--', color: 'text-slate-500', icon: Minus }
  }

  // For onset speed, lower is better, so invert the logic
  const isPositive = inverted ? change < 0 : change > 0

  if (Math.abs(change) < 0.5) {
    return { text: '0%', color: 'text-slate-400', icon: Minus }
  }

  return {
    text: `${isPositive ? '+' : ''}${change.toFixed(1)}%`,
    color: isPositive ? 'text-green-400' : 'text-red-400',
    icon: isPositive ? TrendingUp : TrendingDown
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return '--'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatPracticeTime(seconds: number | null): string {
  if (!seconds) return '--'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export default function PitchTrainingProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingFeedback, setGeneratingFeedback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'pitch-trainer' | 'rhythm-trainer' | 'scale-trainer'>('overview')
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [showScaleAIPanel, setShowScaleAIPanel] = useState(false)

  const fetchProgress = async () => {
    try {
      setLoading(true)
      const [progressRes, notesRes, scaleRes] = await Promise.all([
        fetch('/api/pitch-training/progress?weeks=8&includeFeedback=true'),
        fetch('/api/pitch-training/recent-notes'),
        fetch('/api/scale-training/session?days=30')
      ])
      if (!progressRes.ok) throw new Error('Failed to fetch progress')
      const result = await progressRes.json()

      // Add lesson notes if available
      if (notesRes.ok) {
        const notesData = await notesRes.json()
        result.recentLessonNotes = notesData.notes || []
      }

      // Process scale training sessions
      if (scaleRes.ok) {
        const scaleData = await scaleRes.json()
        const sessions = scaleData.sessions || []

        // Calculate scale stats
        if (sessions.length > 0) {
          const overallScores = sessions.map((s: any) => s.overall_score || 0)
          const sequenceAccuracies = sessions.map((s: any) => s.sequence_accuracy || 0)
          const pitchAccuracies = sessions.map((s: any) => s.pitch_accuracy || 0)
          const tempos = sessions.map((s: any) => s.tempo_bpm || 80)
          const uniqueScales = new Set(sessions.map((s: any) => `${s.scale_type}-${s.root_note}`))

          // Count days practiced this week
          const now = new Date()
          const weekStart = new Date(now)
          const dayOfWeek = weekStart.getDay()
          weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
          weekStart.setHours(0, 0, 0, 0)
          const daysThisWeek = new Set(
            sessions
              .filter((s: any) => new Date(s.session_date) >= weekStart)
              .map((s: any) => s.session_date)
          ).size

          result.scaleStats = {
            totalSessions: sessions.length,
            avgOverallScore: overallScores.reduce((a: number, b: number) => a + b, 0) / overallScores.length,
            bestOverallScore: Math.max(...overallScores),
            avgSequenceAccuracy: sequenceAccuracies.reduce((a: number, b: number) => a + b, 0) / sequenceAccuracies.length,
            avgPitchAccuracy: pitchAccuracies.reduce((a: number, b: number) => a + b, 0) / pitchAccuracies.length,
            uniqueScales: uniqueScales.size,
            daysThisWeek,
            avgTempo: tempos.reduce((a: number, b: number) => a + b, 0) / tempos.length,
            minTempo: Math.min(...tempos),
            maxTempo: Math.max(...tempos),
          }

          result.recentScaleSessions = sessions.slice(0, 10).map((s: any) => ({
            session_date: s.session_date,
            scale_type: s.scale_type,
            root_note: s.root_note,
            direction: s.direction,
            tempo_bpm: s.tempo_bpm || 80,
            overall_score: s.overall_score,
            sequence_accuracy: s.sequence_accuracy,
            pitch_accuracy: s.pitch_accuracy,
          }))
        }
      }

      setData(result)
    } catch (err) {
      setError('Failed to load progress data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const generateNewFeedback = async () => {
    try {
      setGeneratingFeedback(true)
      const response = await fetch('/api/pitch-training/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisType: 'weekly' })
      })
      if (!response.ok) throw new Error('Failed to generate feedback')
      await fetchProgress() // Refresh data
    } catch (err) {
      console.error(err)
    } finally {
      setGeneratingFeedback(false)
    }
  }

  useEffect(() => {
    fetchProgress()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#a855f7]"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">{error || 'No data available'}</p>
        <button
          onClick={fetchProgress}
          className="mt-4 px-4 py-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white rounded-lg hover:from-[#c084fc] hover:to-[#8b5cf6]"
        >
          Try Again
        </button>
      </div>
    )
  }

  const currentWeek = data.weeklyProgress[0]
  const currentSongWeek = data.songWeeklyProgress[0]
  const latestFeedback = data.aiFeedback[0]

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Pitch Perfect</h1>
          <p className="text-slate-400 mt-1">Track your vocal pitch and rhythm improvement over time</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAIPanel(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white rounded-xl transition-all shadow-lg shadow-[#a855f7]/20 text-sm font-medium"
            title="AI Coach Analysis"
          >
            <Brain className="w-4 h-4" />
            <span className="hidden sm:inline">Analyze Notes</span>
          </button>
          <button
            onClick={fetchProgress}
            className="p-2 hover:bg-white/[0.08] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* AI Analysis Panel */}
      <AIAnalysisPanel
        isOpen={showAIPanel}
        onClose={() => setShowAIPanel(false)}
        onAnalysisComplete={fetchProgress}
      />

      {/* Scale Analysis Panel */}
      <ScaleAnalysisPanel
        isOpen={showScaleAIPanel}
        onClose={() => setShowScaleAIPanel(false)}
        onAnalysisComplete={fetchProgress}
      />

      {/* Tab Navigation */}
      <div className="flex gap-2 glass-card-subtle border border-white/[0.08] p-1 rounded-xl w-fit flex-wrap">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
            activeTab === 'overview'
              ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-lg shadow-[#a855f7]/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('pitch-trainer')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
            activeTab === 'pitch-trainer'
              ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-lg shadow-[#a855f7]/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <Mic2 className="w-4 h-4" />
          Pitch Trainer
        </button>
        <button
          onClick={() => setActiveTab('rhythm-trainer')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
            activeTab === 'rhythm-trainer'
              ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-lg shadow-[#a855f7]/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <Activity className="w-4 h-4" />
          Rhythm Trainer
        </button>
        <button
          onClick={() => setActiveTab('scale-trainer')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
            activeTab === 'scale-trainer'
              ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-lg shadow-[#a855f7]/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <Music className="w-4 h-4" />
          Scales
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Quick Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-[#c4b5fd] mb-2">
                <Mic2 className="w-4 h-4" />
                <span className="text-xs font-medium">
                  {data.singerMetrics?.hasNewMetrics ? 'Target Accuracy' : 'Pitch Accuracy'}
                </span>
              </div>
              <p className="text-2xl font-bold text-white">
                {data.singerMetrics?.hasNewMetrics
                  ? data.singerMetrics.avgTargetAccuracy.toFixed(0)
                  : currentWeek?.avg_pitch_accuracy?.toFixed(0) || '--'}%
              </p>
              <p className="text-xs text-slate-400">
                {data.singerMetrics?.hasNewMetrics ? 'recent sessions' : 'this week'}
              </p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <Music2 className="w-4 h-4" />
                <span className="text-xs font-medium">Song Accuracy</span>
              </div>
              <p className="text-2xl font-bold text-white">{currentSongWeek?.avg_accuracy_percent?.toFixed(0) || '--'}%</p>
              <p className="text-xs text-slate-400">in-key rate</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <Activity className="w-4 h-4" />
                <span className="text-xs font-medium">Rhythm Accuracy</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.rhythmWeeklyProgress?.[0]?.avg_on_beat_percent?.toFixed(0) || '--'}%</p>
              <p className="text-xs text-slate-400">on-beat</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-medium">Recent Lessons</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.recentLessonNotes?.length || 0}</p>
              <p className="text-xs text-slate-400">with notes</p>
            </div>
          </div>

          {/* Combined Progress Card */}
          <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#c4b5fd]" />
              Your Training Summary
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Pitch Training Summary */}
              <div className="bg-indigo-500/10 rounded-xl p-4 border border-indigo-500/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-indigo-300 flex items-center gap-2">
                    <Mic2 className="w-4 h-4" />
                    Pitch Training
                  </h3>
                  <button
                    onClick={() => setActiveTab('pitch-trainer')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    Details <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  {data.singerMetrics?.hasNewMetrics ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Target Accuracy</span>
                        <span className="text-white">{data.singerMetrics.avgTargetAccuracy}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Voice Stability</span>
                        <span className="text-white">{data.singerMetrics.avgVoiceStability}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tendency</span>
                        <span className={`flex items-center gap-1 ${
                          data.singerMetrics.predominantTendency === 'sharp' ? 'text-amber-400' :
                          data.singerMetrics.predominantTendency === 'flat' ? 'text-blue-400' :
                          'text-green-400'
                        }`}>
                          {data.singerMetrics.predominantTendency === 'sharp' ? '♯ Sharp' :
                           data.singerMetrics.predominantTendency === 'flat' ? '♭ Flat' : '✓ On Target'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sessions</span>
                        <span className="text-white">{data.stats.totalSessions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Best Score</span>
                        <span className="text-white">{data.stats.bestScore}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Current Streak</span>
                        <span className="text-white">{data.stats.currentStreak} days</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Scale Training Summary */}
              <div className="bg-pink-500/10 rounded-xl p-4 border border-pink-500/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-pink-300 flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    Scale Training
                  </h3>
                  <button
                    onClick={() => setActiveTab('scale-trainer')}
                    className="text-xs text-pink-400 hover:text-pink-300 flex items-center gap-1"
                  >
                    Details <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sessions</span>
                    <span className="text-white">{data.scaleStats?.totalSessions || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Best Score</span>
                    <span className="text-white">{data.scaleStats?.bestOverallScore?.toFixed(0) || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Scales Practiced</span>
                    <span className="text-white">{data.scaleStats?.uniqueScales || 0}</span>
                  </div>
                </div>
              </div>

              {/* Rhythm Training Summary */}
              <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-amber-300 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Rhythm Training
                  </h3>
                  <button
                    onClick={() => setActiveTab('rhythm-trainer')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    Details <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">On-Beat Rate</span>
                    <span className="text-white">{data.rhythmStats?.avgOnBeatPercent || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Consistency</span>
                    <span className="text-white">{data.rhythmStats?.avgConsistency?.toFixed(0) || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tendency</span>
                    <span className={`flex items-center gap-1 ${
                      data.rhythmStats?.predominantTendency === 'early' ? 'text-blue-400' :
                      data.rhythmStats?.predominantTendency === 'late' ? 'text-orange-400' :
                      'text-green-400'
                    }`}>
                      {data.rhythmStats?.predominantTendency === 'early' ? '⏪ Early' :
                       data.rhythmStats?.predominantTendency === 'late' ? '⏩ Late' : '✓ On Time'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Lesson Notes */}
          {data.recentLessonNotes && data.recentLessonNotes.length > 0 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  Recent Lesson Notes
                </h2>
                <span className="text-xs text-slate-400">From your live classes</span>
              </div>

              <div className="space-y-4">
                {data.recentLessonNotes.slice(0, 5).map((note) => (
                  <div key={note.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-white">
                        {new Date(note.class_started_at).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      {note.ai_summary?.summary && (
                        <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded-lg">AI Summary</span>
                      )}
                    </div>

                    {/* AI Summary if available */}
                    {note.ai_summary?.summary && (
                      <p className="text-sm text-slate-300 mb-3">{note.ai_summary.summary}</p>
                    )}

                    {/* Key Topics */}
                    {note.ai_summary?.keyTopicsCovered && note.ai_summary.keyTopicsCovered.length > 0 && (
                      <div className="mb-3">
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Topics Covered</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {note.ai_summary.keyTopicsCovered.slice(0, 4).map((topic, i) => (
                            <span key={i} className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Teacher Feedback */}
                    {note.ai_summary?.teacherFeedback && note.ai_summary.teacherFeedback.length > 0 && (
                      <div className="mb-3">
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Teacher Feedback</span>
                        <ul className="mt-1 space-y-1">
                          {note.ai_summary.teacherFeedback.slice(0, 2).map((feedback, i) => (
                            <li key={i} className="text-xs text-slate-300 pl-3 border-l-2 border-green-500/30">
                              {feedback}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Homework */}
                    {note.ai_summary?.homeworkAssignments && note.ai_summary.homeworkAssignments.length > 0 && (
                      <div>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Homework</span>
                        <ul className="mt-1 space-y-1">
                          {note.ai_summary.homeworkAssignments.map((hw, i) => (
                            <li key={i} className="text-xs text-amber-300 pl-3 border-l-2 border-amber-500/30">
                              {hw}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Fallback to plain notes if no AI summary */}
                    {!note.ai_summary?.summary && note.content && (
                      <p className="text-sm text-slate-400 italic">
                        {note.content.slice(0, 200)}{note.content.length > 200 ? '...' : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Coach Analysis Card */}
          {latestFeedback && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  AI Coach Insights
                </h2>
                <button
                  onClick={() => setShowAIPanel(true)}
                  className="text-xs text-[#c4b5fd] hover:text-white flex items-center gap-1"
                >
                  Full Analysis <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] mb-4">
                <p className="text-slate-300 leading-relaxed">{latestFeedback.summary}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Strengths */}
                {latestFeedback.strengths.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-green-400 mb-2">Strengths</h3>
                    <ul className="space-y-1">
                      {latestFeedback.strengths.slice(0, 3).map((s, i) => (
                        <li key={i} className="text-xs text-slate-300 pl-3 border-l-2 border-green-500/30">{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Areas to Improve */}
                {latestFeedback.areas_for_improvement.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-amber-400 mb-2">Focus Areas</h3>
                    <ul className="space-y-1">
                      {latestFeedback.areas_for_improvement.slice(0, 3).map((a, i) => (
                        <li key={i} className="text-xs text-slate-300 pl-3 border-l-2 border-amber-500/30">{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!currentWeek && !currentSongWeek && (!data.recentLessonNotes || data.recentLessonNotes.length === 0) && (
            <div className="text-center py-12 glass-card-subtle rounded-2xl border-white/[0.08]">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#a855f7]/20 rounded-full flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-[#c4b5fd]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Start Your Training Journey</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Use the training tools to practice pitch, song singing, and rhythm. Your progress and lesson notes will be combined here for a complete overview.
              </p>
            </div>
          )}
        </>
      )}

      {/* Pitch Trainer Pro Tab */}
      {activeTab === 'pitch-trainer' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-[#c4b5fd] mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-xs font-medium">Current Streak</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.currentStreak}</p>
              <p className="text-xs text-slate-400">days</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <Award className="w-4 h-4" />
                <span className="text-xs font-medium">Best Streak</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.longestStreak}</p>
              <p className="text-xs text-slate-400">days</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <Target className="w-4 h-4" />
                <span className="text-xs font-medium">Best Score</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.bestScore}%</p>
              <p className="text-xs text-slate-400">all time</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-xs font-medium">This Week</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.daysThisWeek}</p>
              <p className="text-xs text-slate-400">sessions</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-[#d8b4fe] mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Total Sessions</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.totalSessions}</p>
              <p className="text-xs text-slate-400">completed</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-violet-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">Avg Score</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.averageScore}%</p>
              <p className="text-xs text-slate-400">overall</p>
            </div>
          </div>

          {/* Singer-Focused Metrics Card */}
          {data.singerMetrics?.hasNewMetrics && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Mic2 className="w-5 h-5 text-[#c4b5fd]" />
                Singer Performance Insights
                <span className="ml-2 px-2 py-0.5 bg-[#a855f7]/20 text-[#c4b5fd] text-xs rounded-full">New</span>
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Target Accuracy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Target Accuracy</span>
                    {(() => {
                      const trend = data.singerMetrics!.targetAccuracyTrend
                      if (Math.abs(trend) < 1) return null
                      const isPositive = trend > 0
                      return (
                        <span className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.singerMetrics.avgTargetAccuracy.toFixed(1)}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${data.singerMetrics.avgTargetAccuracy}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">How close to the target note</p>
                </div>

                {/* Voice Stability */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Voice Stability</span>
                    {(() => {
                      const trend = data.singerMetrics!.voiceStabilityTrend
                      if (Math.abs(trend) < 1) return null
                      const isPositive = trend > 0
                      return (
                        <span className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.singerMetrics.avgVoiceStability.toFixed(1)}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${data.singerMetrics.avgVoiceStability}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">How steady your pitch is</p>
                </div>

                {/* Semitone Deviation */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Avg Deviation</span>
                  <p className="text-3xl font-bold text-white">
                    {Math.abs(data.singerMetrics.avgSemitoneDeviation).toFixed(2)}
                    <span className="text-lg text-slate-400"> ST</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {data.singerMetrics.avgSemitoneDeviation === 0
                      ? 'Perfect centering'
                      : data.singerMetrics.avgSemitoneDeviation > 0
                        ? 'Slightly sharp on average'
                        : 'Slightly flat on average'}
                  </p>
                </div>

                {/* Pitch Tendency */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Pitch Tendency</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-3xl font-bold ${
                      data.singerMetrics.predominantTendency === 'sharp' ? 'text-amber-400' :
                      data.singerMetrics.predominantTendency === 'flat' ? 'text-blue-400' :
                      'text-green-400'
                    }`}>
                      {data.singerMetrics.predominantTendency === 'sharp' ? '♯' :
                       data.singerMetrics.predominantTendency === 'flat' ? '♭' : '✓'}
                    </span>
                    <span className="text-xl font-semibold text-white capitalize">
                      {data.singerMetrics.predominantTendency === 'on-target' ? 'On Target' : data.singerMetrics.predominantTendency}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {data.singerMetrics.predominantTendency === 'sharp'
                      ? 'You tend to sing slightly sharp'
                      : data.singerMetrics.predominantTendency === 'flat'
                        ? 'You tend to sing slightly flat'
                        : 'Great pitch centering!'}
                  </p>
                </div>
              </div>

              {/* Overall Trend */}
              {Math.abs(data.singerMetrics.overallScoreTrend) >= 1 && (
                <div className={`mt-6 p-4 rounded-xl ${
                  data.singerMetrics.overallScoreTrend > 0
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-amber-500/10 border border-amber-500/20'
                }`}>
                  <div className="flex items-center gap-3">
                    {data.singerMetrics.overallScoreTrend > 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-amber-400" />
                    )}
                    <div>
                      <p className={`font-medium ${
                        data.singerMetrics.overallScoreTrend > 0 ? 'text-green-400' : 'text-amber-400'
                      }`}>
                        {data.singerMetrics.overallScoreTrend > 0 ? 'Improving!' : 'Room for improvement'}
                      </p>
                      <p className="text-sm text-slate-400">
                        Your overall score has {data.singerMetrics.overallScoreTrend > 0 ? 'increased' : 'decreased'} by{' '}
                        <span className="font-medium">{Math.abs(data.singerMetrics.overallScoreTrend).toFixed(1)}%</span>{' '}
                        over your recent sessions
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress Evolution Chart */}
          {data.progressHistory && data.progressHistory.length >= 3 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                Progress Evolution
                <span className="text-sm font-normal text-slate-400 ml-2">
                  Last {data.progressHistory.length} sessions
                </span>
              </h2>

              {/* Visual progress timeline */}
              <div className="space-y-4">
                {/* Target Accuracy Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Target Accuracy Trend</span>
                    <span className="text-sm text-white">
                      {data.progressHistory[0]?.target_accuracy?.toFixed(1) || '--'}%
                    </span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {data.progressHistory.slice(0, 14).reverse().map((entry, i) => {
                      const value = entry.target_accuracy || 0
                      const height = Math.max(4, (value / 100) * 100)
                      return (
                        <div
                          key={entry.id}
                          className="flex-1 bg-gradient-to-t from-indigo-600 to-purple-500 rounded-t transition-all hover:from-indigo-500 hover:to-purple-400"
                          style={{ height: `${height}%` }}
                          title={`${new Date(entry.period_start).toLocaleDateString()}: ${value.toFixed(1)}%`}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Voice Stability Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Voice Stability Trend</span>
                    <span className="text-sm text-white">
                      {data.progressHistory[0]?.voice_stability?.toFixed(1) || '--'}%
                    </span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {data.progressHistory.slice(0, 14).reverse().map((entry, i) => {
                      const value = entry.voice_stability || 0
                      const height = Math.max(4, (value / 100) * 100)
                      return (
                        <div
                          key={entry.id}
                          className="flex-1 bg-gradient-to-t from-green-600 to-emerald-500 rounded-t transition-all hover:from-green-500 hover:to-emerald-400"
                          style={{ height: `${height}%` }}
                          title={`${new Date(entry.period_start).toLocaleDateString()}: ${value.toFixed(1)}%`}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Overall Score Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Overall Score Trend</span>
                    <span className="text-sm text-white">
                      {data.progressHistory[0]?.overall_score?.toFixed(1) || '--'}%
                    </span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {data.progressHistory.slice(0, 14).reverse().map((entry, i) => {
                      const value = entry.overall_score || 0
                      const height = Math.max(4, (value / 100) * 100)
                      return (
                        <div
                          key={entry.id}
                          className="flex-1 bg-gradient-to-t from-[#a855f7] to-[#c084fc] rounded-t transition-all hover:from-[#9333ea] hover:to-[#a855f7]"
                          style={{ height: `${height}%` }}
                          title={`${new Date(entry.period_start).toLocaleDateString()}: ${value.toFixed(1)}%`}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Progress Summary */}
              <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.08]">
                <div className="text-center">
                  <p className="text-sm text-slate-400">First Session</p>
                  <p className="text-lg font-semibold text-white">
                    {data.progressHistory[data.progressHistory.length - 1]?.overall_score?.toFixed(0) || '--'}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-400">Latest Session</p>
                  <p className="text-lg font-semibold text-white">
                    {data.progressHistory[0]?.overall_score?.toFixed(0) || '--'}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-400">Total Change</p>
                  {(() => {
                    const first = data.progressHistory[data.progressHistory.length - 1]?.overall_score || 0
                    const last = data.progressHistory[0]?.overall_score || 0
                    const change = last - first
                    return (
                      <p className={`text-lg font-semibold ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(0)}%
                      </p>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Current Week Metrics */}
          {currentWeek && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#c4b5fd]" />
                This Week&apos;s Progress
                <span className="text-sm font-normal text-slate-400 ml-2">
                  Week of {new Date(currentWeek.week_start_date).toLocaleDateString()}
                </span>
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Target Accuracy (New) or Pitch Accuracy (Legacy) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">
                      {currentWeek.avg_target_accuracy !== null ? 'Target Accuracy' : 'Pitch Accuracy'}
                    </span>
                    {(() => {
                      const change = formatChange(currentWeek.target_accuracy_change ?? currentWeek.pitch_accuracy_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {(currentWeek.avg_target_accuracy ?? currentWeek.avg_pitch_accuracy)?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${currentWeek.avg_target_accuracy ?? currentWeek.avg_pitch_accuracy ?? 0}%` }}
                    />
                  </div>
                  {currentWeek.avg_target_accuracy !== null && (
                    <p className="text-xs text-slate-500">How close to target note</p>
                  )}
                </div>

                {/* Voice Stability (New) or Pitch Stability (Legacy) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">
                      {currentWeek.avg_voice_stability !== null ? 'Voice Stability' : 'Pitch Stability'}
                    </span>
                    {(() => {
                      const change = formatChange(currentWeek.voice_stability_change ?? currentWeek.pitch_stability_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {(currentWeek.avg_voice_stability ?? currentWeek.avg_pitch_stability)?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${currentWeek.avg_voice_stability ?? currentWeek.avg_pitch_stability ?? 0}%` }}
                    />
                  </div>
                  {currentWeek.avg_voice_stability !== null && (
                    <p className="text-xs text-slate-500">How steady your pitch</p>
                  )}
                </div>

                {/* Pitch Tendency (New) or Onset Speed (Legacy) */}
                {currentWeek.predominant_tendency ? (
                  <div className="space-y-2">
                    <span className="text-sm text-slate-400">Pitch Tendency</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-3xl font-bold ${
                        currentWeek.predominant_tendency === 'sharp' ? 'text-amber-400' :
                        currentWeek.predominant_tendency === 'flat' ? 'text-blue-400' :
                        'text-green-400'
                      }`}>
                        {currentWeek.predominant_tendency === 'sharp' ? '♯' :
                         currentWeek.predominant_tendency === 'flat' ? '♭' : '✓'}
                      </span>
                      <span className="text-lg font-semibold text-white capitalize">
                        {currentWeek.predominant_tendency === 'on-target' ? 'On Target' : currentWeek.predominant_tendency}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">Your typical pitch direction</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Onset Speed</span>
                      {(() => {
                        const change = formatChange(currentWeek.pitch_onset_speed_change, true)
                        return (
                          <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                            <change.icon className="w-3 h-3" />
                            {change.text}
                          </span>
                        )
                      })()}
                    </div>
                    <p className="text-3xl font-bold text-white">
                      {currentWeek.avg_pitch_onset_speed_ms || '--'}
                      <span className="text-lg text-slate-400">ms</span>
                    </p>
                    <p className="text-xs text-slate-500">Lower is better</p>
                  </div>
                )}

                {/* Overall Score or In-Tune Sustain */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">
                      {currentWeek.predominant_tendency ? 'Overall Score' : 'In-Tune Sustain'}
                    </span>
                    {!currentWeek.predominant_tendency && (() => {
                      const change = formatChange(currentWeek.in_tune_sustain_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {currentWeek.predominant_tendency
                      ? `${currentWeek.avg_overall_score?.toFixed(1) || '--'}%`
                      : formatDuration(currentWeek.avg_in_tune_sustain_ms)
                    }
                  </p>
                  <p className="text-xs text-slate-500">
                    {currentWeek.predominant_tendency
                      ? 'Combined performance score'
                      : 'Longest sustained in-tune'
                    }
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-white/[0.08] flex items-center justify-between">
                <div className="flex gap-6">
                  <div>
                    <span className="text-sm text-slate-400">Sessions</span>
                    <p className="text-lg font-semibold text-white">{currentWeek.total_sessions}</p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-400">Notes Practiced</span>
                    <p className="text-lg font-semibold text-white">{currentWeek.total_notes_attempted || '--'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-400">Practice Time</span>
                    <p className="text-lg font-semibold text-white">{formatPracticeTime(currentWeek.total_practice_time_seconds)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm text-slate-400">Overall Score</span>
                  <p className="text-2xl font-bold text-[#c4b5fd]">{currentWeek.avg_overall_score?.toFixed(1) || '--'}%</p>
                </div>
              </div>
            </div>
          )}

          {/* AI Feedback */}
          <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                AI Coach Feedback
              </h2>
              <button
                onClick={generateNewFeedback}
                disabled={generatingFeedback}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  generatingFeedback
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white'
                }`}
              >
                {generatingFeedback ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Get New Analysis
                  </>
                )}
              </button>
            </div>

            {latestFeedback ? (
              <div className="space-y-6">
                {/* Summary */}
                <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                  <p className="text-slate-300 leading-relaxed">{latestFeedback.summary}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Generated {new Date(latestFeedback.generated_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Strengths */}
                  <div>
                    <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                      Strengths
                    </h3>
                    <ul className="space-y-2">
                      {latestFeedback.strengths.map((strength, i) => (
                        <li key={i} className="text-sm text-slate-300 pl-4 border-l-2 border-green-500/30">
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Areas for Improvement */}
                  <div>
                    <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                      Areas to Focus On
                    </h3>
                    <ul className="space-y-2">
                      {latestFeedback.areas_for_improvement.map((area, i) => (
                        <li key={i} className="text-sm text-slate-300 pl-4 border-l-2 border-amber-500/30">
                          {area}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Tips */}
                <div>
                  <h3 className="text-sm font-semibold text-[#c4b5fd] mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
                    Personalized Tips
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {latestFeedback.personalized_tips.map((tip, i) => (
                      <div key={i} className="bg-[#a855f7]/12 rounded-lg p-3 border border-[#a855f7]/25">
                        <p className="text-sm text-slate-300">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Exercises */}
                {latestFeedback.recommended_exercises.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                      Recommended Exercises
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {latestFeedback.recommended_exercises.map((exercise, i) => (
                        <span key={i} className="px-3 py-1.5 bg-purple-600/20 text-purple-300 rounded-lg text-sm border border-purple-500/20">
                          {exercise}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No AI feedback yet. Complete some practice sessions to get personalized insights!</p>
                <button
                  onClick={generateNewFeedback}
                  disabled={generatingFeedback || !currentWeek}
                  className="px-4 py-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white rounded-lg hover:from-[#c084fc] hover:to-[#8b5cf6] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Generate First Analysis
                </button>
              </div>
            )}
          </div>

          {/* Weekly History */}
          {data.weeklyProgress.length > 1 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6">Weekly History</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-slate-400 border-b border-white/[0.08]">
                      <th className="pb-3 pr-4">Week</th>
                      <th className="pb-3 pr-4">Score</th>
                      <th className="pb-3 pr-4">Accuracy</th>
                      <th className="pb-3 pr-4">Stability</th>
                      <th className="pb-3 pr-4">Sessions</th>
                      <th className="pb-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeklyProgress.map((week, index) => (
                      <tr key={week.id} className="border-b border-white/[0.08]">
                        <td className="py-3 pr-4 text-slate-300">
                          {new Date(week.week_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {index === 0 && <span className="ml-2 text-xs text-[#c4b5fd]">(Current)</span>}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-white font-medium">{week.avg_overall_score?.toFixed(1) || '--'}%</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-300">{week.avg_pitch_accuracy?.toFixed(1) || '--'}%</td>
                        <td className="py-3 pr-4 text-slate-300">{week.avg_pitch_stability?.toFixed(1) || '--'}%</td>
                        <td className="py-3 pr-4 text-slate-300">{week.total_sessions}</td>
                        <td className="py-3 text-slate-300">{formatPracticeTime(week.total_practice_time_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!currentWeek && (
            <div className="text-center py-12 glass-card-subtle rounded-2xl border-white/[0.08]">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#a855f7]/20 rounded-full flex items-center justify-center">
                <Target className="w-8 h-8 text-[#c4b5fd]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Start Your Pitch Training Journey</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Use the Pitch Trainer Pro tool to practice matching notes. Your progress will be tracked here
                with detailed metrics and AI-powered feedback.
              </p>
            </div>
          )}
        </>
      )}

      {/* Rhythm Trainer Tab */}
      {activeTab === 'rhythm-trainer' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <Target className="w-4 h-4" />
                <span className="text-xs font-medium">Best On-Beat</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.rhythmStats?.bestOnBeatPercent || 0}%</p>
              <p className="text-xs text-slate-400">accuracy</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-orange-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">Avg Accuracy</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.rhythmStats?.avgOnBeatPercent?.toFixed(1) || 0}%</p>
              <p className="text-xs text-slate-400">on-beat</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-red-400 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-xs font-medium">Consistency</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.rhythmStats?.avgConsistency?.toFixed(1) || 0}%</p>
              <p className="text-xs text-slate-400">timing</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-[#d8b4fe] mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Total Sessions</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.rhythmStats?.totalSessions || 0}</p>
              <p className="text-xs text-slate-400">completed</p>
            </div>
          </div>

          {/* Current Week Metrics */}
          {data.rhythmWeeklyProgress?.[0] && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                This Week&apos;s Rhythm Practice
                <span className="text-sm font-normal text-slate-400 ml-2">
                  Week of {new Date(data.rhythmWeeklyProgress[0].week_start_date).toLocaleDateString()}
                </span>
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* On-Beat Accuracy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">On-Beat %</span>
                    {(() => {
                      const change = formatChange(data.rhythmWeeklyProgress[0].on_beat_percent_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.rhythmWeeklyProgress[0].avg_on_beat_percent?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                      style={{ width: `${data.rhythmWeeklyProgress[0].avg_on_beat_percent || 0}%` }}
                    />
                  </div>
                </div>

                {/* Timing Consistency */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Consistency</span>
                    {(() => {
                      const change = formatChange(data.rhythmWeeklyProgress[0].consistency_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.rhythmWeeklyProgress[0].avg_timing_consistency?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all"
                      style={{ width: `${data.rhythmWeeklyProgress[0].avg_timing_consistency || 0}%` }}
                    />
                  </div>
                </div>

                {/* Avg Timing Offset */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Avg Offset</span>
                    {(() => {
                      const change = formatChange(data.rhythmWeeklyProgress[0].timing_offset_change, true)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {data.rhythmWeeklyProgress[0].avg_timing_offset_ms?.toFixed(0) || '--'}
                    <span className="text-lg text-slate-400">ms</span>
                  </p>
                  <p className="text-xs text-slate-500">Lower is better</p>
                </div>

                {/* BPM Range */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">BPM Range</span>
                  <p className="text-3xl font-bold text-white">
                    {data.rhythmWeeklyProgress[0].min_bpm_practiced || '--'}-{data.rhythmWeeklyProgress[0].max_bpm_practiced || '--'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Avg: {data.rhythmWeeklyProgress[0].avg_bpm_practiced?.toFixed(0) || '--'} BPM
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-white/[0.08] flex items-center justify-between">
                <div className="flex gap-6">
                  <div>
                    <span className="text-sm text-slate-400">Sessions</span>
                    <p className="text-lg font-semibold text-white">{data.rhythmWeeklyProgress[0].total_sessions}</p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-400">Beats Practiced</span>
                    <p className="text-lg font-semibold text-white">{data.rhythmWeeklyProgress[0].total_beats_attempted || '--'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-400">Practice Time</span>
                    <p className="text-lg font-semibold text-white">{formatPracticeTime(data.rhythmWeeklyProgress[0].total_practice_time_seconds)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm text-slate-400">Overall Score</span>
                  <p className="text-2xl font-bold text-amber-400">{data.rhythmWeeklyProgress[0].avg_overall_score?.toFixed(1) || '--'}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Recent Rhythm Sessions */}
          {data.recentRhythmSessions && data.recentRhythmSessions.length > 0 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6">Recent Sessions</h2>
              <div className="space-y-3">
                {data.recentRhythmSessions.slice(0, 10).map((session, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{session.bpm} BPM</p>
                        <p className="text-sm text-slate-400">{session.time_signature} • Streak: {session.best_streak}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        session.on_beat_percent >= 80 ? 'text-green-400' :
                        session.on_beat_percent >= 60 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {session.on_beat_percent?.toFixed(1)}%
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(session.session_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly History */}
          {data.rhythmWeeklyProgress && data.rhythmWeeklyProgress.length > 1 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6">Weekly History</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-slate-400 border-b border-white/[0.08]">
                      <th className="pb-3 pr-4">Week</th>
                      <th className="pb-3 pr-4">On-Beat %</th>
                      <th className="pb-3 pr-4">Consistency</th>
                      <th className="pb-3 pr-4">Avg BPM</th>
                      <th className="pb-3">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rhythmWeeklyProgress.map((week, index) => (
                      <tr key={week.id} className="border-b border-white/[0.08]">
                        <td className="py-3 pr-4 text-slate-300">
                          {new Date(week.week_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {index === 0 && <span className="ml-2 text-xs text-amber-400">(Current)</span>}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-white font-medium">{week.avg_on_beat_percent?.toFixed(1) || '--'}%</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-300">{week.avg_timing_consistency?.toFixed(1) || '--'}%</td>
                        <td className="py-3 pr-4 text-slate-300">{week.avg_bpm_practiced?.toFixed(0) || '--'}</td>
                        <td className="py-3 text-slate-300">{week.total_sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {(!data.rhythmWeeklyProgress || data.rhythmWeeklyProgress.length === 0) && (!data.recentRhythmSessions || data.recentRhythmSessions.length === 0) && (
            <div className="text-center py-12 glass-card-subtle rounded-2xl border-white/[0.08]">
              <div className="w-16 h-16 mx-auto mb-4 bg-amber-600/20 rounded-full flex items-center justify-center">
                <Activity className="w-8 h-8 text-amber-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Start Rhythm Training</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Use the Rhythm Trainer to practice your timing with a metronome.
                Your sessions will be tracked here.
              </p>
            </div>
          )}
        </>
      )}

      {/* Scale Trainer Tab */}
      {activeTab === 'scale-trainer' && (
        <>
          {/* AI Coach Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowScaleAIPanel(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-pink-500/20 text-sm font-medium"
              title="Scale Training AI Coach"
            >
              <Brain className="w-4 h-4" />
              <span>AI Scale Coach</span>
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-pink-400 mb-2">
                <Target className="w-4 h-4" />
                <span className="text-xs font-medium">Best Score</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.scaleStats?.bestOverallScore?.toFixed(0) || 0}%</p>
              <p className="text-xs text-slate-400">overall</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">Avg Score</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.scaleStats?.avgOverallScore?.toFixed(1) || 0}%</p>
              <p className="text-xs text-slate-400">overall</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-fuchsia-400 mb-2">
                <Music className="w-4 h-4" />
                <span className="text-xs font-medium">Scales Practiced</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.scaleStats?.uniqueScales || 0}</p>
              <p className="text-xs text-slate-400">unique</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-[#d8b4fe] mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Total Sessions</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.scaleStats?.totalSessions || 0}</p>
              <p className="text-xs text-slate-400">completed</p>
            </div>
          </div>

          {/* Detailed Metrics */}
          {data.scaleStats && data.scaleStats.totalSessions > 0 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Music className="w-5 h-5 text-pink-400" />
                Scale Training Metrics
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Sequence Accuracy */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Sequence Accuracy</span>
                  <p className="text-3xl font-bold text-white">
                    {data.scaleStats.avgSequenceAccuracy?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${data.scaleStats.avgSequenceAccuracy || 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">Notes sung in correct order</p>
                </div>

                {/* Pitch Accuracy */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Pitch Accuracy</span>
                  <p className="text-3xl font-bold text-white">
                    {data.scaleStats.avgPitchAccuracy?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full transition-all"
                      style={{ width: `${data.scaleStats.avgPitchAccuracy || 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">How close to target pitch</p>
                </div>

                {/* Days This Week */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Days This Week</span>
                  <p className="text-3xl font-bold text-white">{data.scaleStats.daysThisWeek}</p>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <div
                        key={day}
                        className={`flex-1 h-2 rounded ${
                          day < data.scaleStats!.daysThisWeek
                            ? 'bg-gradient-to-r from-pink-500 to-purple-500'
                            : 'bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Practice consistency</p>
                </div>

                {/* Tempo/Speed */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Average Tempo</span>
                  <p className="text-3xl font-bold text-white">
                    {data.scaleStats.avgTempo?.toFixed(0) || 80}
                    <span className="text-lg text-slate-400 ml-1">BPM</span>
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Range: {data.scaleStats.minTempo || 80} - {data.scaleStats.maxTempo || 80} BPM</span>
                  </div>
                  <p className="text-xs text-slate-500">Practice speed</p>
                </div>
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          {data.recentScaleSessions && data.recentScaleSessions.length > 0 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6">Recent Scale Sessions</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-slate-400 border-b border-white/[0.08]">
                      <th className="pb-3 pr-4">Date</th>
                      <th className="pb-3 pr-4">Scale</th>
                      <th className="pb-3 pr-4">Direction</th>
                      <th className="pb-3 pr-4">Tempo</th>
                      <th className="pb-3 pr-4">Sequence</th>
                      <th className="pb-3 pr-4">Pitch</th>
                      <th className="pb-3">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentScaleSessions.map((session, index) => (
                      <tr key={index} className="border-b border-white/[0.08]">
                        <td className="py-3 pr-4 text-slate-300">
                          {new Date(session.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-3 pr-4 text-white font-medium">
                          {session.root_note} {session.scale_type.replace('_', ' ')}
                        </td>
                        <td className="py-3 pr-4 text-slate-300 capitalize">{session.direction}</td>
                        <td className="py-3 pr-4 text-slate-300">{session.tempo_bpm || 80} BPM</td>
                        <td className="py-3 pr-4 text-slate-300">{session.sequence_accuracy?.toFixed(0) || '--'}%</td>
                        <td className="py-3 pr-4 text-slate-300">{session.pitch_accuracy?.toFixed(0) || '--'}%</td>
                        <td className="py-3">
                          <span className={`font-medium ${
                            session.overall_score >= 80 ? 'text-green-400' :
                            session.overall_score >= 60 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {session.overall_score?.toFixed(0) || '--'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Scale Training Info */}
          <div className="glass-card-subtle rounded-xl p-6 border-white/[0.08]">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Music className="w-5 h-5 text-purple-400" />
              About Scale Training
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-2">How it works</h4>
                <ul className="text-sm text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    Select a scale type (Major, Minor, Pentatonic, etc.)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    Choose your root note and octave
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    Sing each note in order - the trainer tracks your pitch
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    Get real-time feedback on accuracy and sequence
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-2">Tips for success</h4>
                <ul className="text-sm text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--accent)] mt-1">•</span>
                    Start with simple scales like C Major
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--accent)] mt-1">•</span>
                    Use a comfortable octave for your voice range
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--accent)] mt-1">•</span>
                    Hold each note steady for better accuracy tracking
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--accent)] mt-1">•</span>
                    Practice ascending before trying descending or both
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {(!data.scaleStats || data.scaleStats.totalSessions === 0) && (
            <div className="text-center py-12 glass-card-subtle rounded-2xl border-white/[0.08]">
              <div className="w-16 h-16 mx-auto mb-4 bg-pink-600/20 rounded-full flex items-center justify-center">
                <Music className="w-8 h-8 text-pink-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Start Scale Training</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Use Pitch Perfect on your dashboard to practice scales.
                Your sessions will be tracked here.
              </p>
            </div>
          )}
        </>
      )}

    </div>
  )
}
