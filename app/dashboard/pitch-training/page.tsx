'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, Target, Clock, Zap, Award, RefreshCw, Sparkles, Music2, Mic2, Activity, Brain } from 'lucide-react'
import AIAnalysisPanel from '@/components/AIAnalysisPanel'

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
}

interface RhythmSession {
  session_date: string
  on_beat_percent: number
  bpm: number
  time_signature: string
  best_streak: number
}

interface ProgressData {
  weeklyProgress: WeeklyProgress[]
  songWeeklyProgress: SongWeeklyProgress[]
  rhythmWeeklyProgress: RhythmWeeklyProgress[]
  aiFeedback: AIFeedback[]
  stats: Stats
  songStats: SongStats
  rhythmStats: RhythmStats
  recentSongSessions: SongSession[]
  recentRhythmSessions: RhythmSession[]
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
  const [activeTab, setActiveTab] = useState<'pitch-trainer' | 'song-trainer' | 'rhythm-trainer'>('pitch-trainer')
  const [showAIPanel, setShowAIPanel] = useState(false)

  const fetchProgress = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/pitch-training/progress?weeks=8&includeFeedback=true')
      if (!response.ok) throw new Error('Failed to fetch progress')
      const result = await response.json()
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
          <h1 className="text-3xl font-bold text-white">Training Center</h1>
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

      {/* Tab Navigation */}
      <div className="flex gap-2 glass-card-subtle border border-white/[0.08] p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('pitch-trainer')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
            activeTab === 'pitch-trainer'
              ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-lg shadow-[#a855f7]/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <Mic2 className="w-4 h-4" />
          Pitch Trainer Pro
        </button>
        <button
          onClick={() => setActiveTab('song-trainer')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
            activeTab === 'song-trainer'
              ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-lg shadow-[#a855f7]/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <Music2 className="w-4 h-4" />
          Song Pitch Trainer
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
      </div>

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
                {/* Pitch Accuracy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Pitch Accuracy</span>
                    {(() => {
                      const change = formatChange(currentWeek.pitch_accuracy_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {currentWeek.avg_pitch_accuracy?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${currentWeek.avg_pitch_accuracy || 0}%` }}
                    />
                  </div>
                </div>

                {/* Pitch Onset Speed */}
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

                {/* Pitch Stability */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Pitch Stability</span>
                    {(() => {
                      const change = formatChange(currentWeek.pitch_stability_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {currentWeek.avg_pitch_stability?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${currentWeek.avg_pitch_stability || 0}%` }}
                    />
                  </div>
                </div>

                {/* In-Tune Sustain */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">In-Tune Sustain</span>
                    {(() => {
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
                    {formatDuration(currentWeek.avg_in_tune_sustain_ms)}
                  </p>
                  <p className="text-xs text-slate-500">Longest sustained in-tune</p>
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

      {/* Song Pitch Trainer Tab */}
      {activeTab === 'song-trainer' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <Target className="w-4 h-4" />
                <span className="text-xs font-medium">Best Accuracy</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.songStats.bestAccuracy}%</p>
              <p className="text-xs text-slate-400">in key</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-teal-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">Avg Accuracy</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.songStats.averageAccuracy}%</p>
              <p className="text-xs text-slate-400">overall</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-cyan-400 mb-2">
                <Music2 className="w-4 h-4" />
                <span className="text-xs font-medium">Songs Practiced</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.songStats.uniqueSongs}</p>
              <p className="text-xs text-slate-400">unique</p>
            </div>

            <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08]">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Total Sessions</span>
              </div>
              <p className="text-2xl font-bold text-white">{data.songStats.totalSessions}</p>
              <p className="text-xs text-slate-400">completed</p>
            </div>
          </div>

          {/* Current Week Metrics */}
          {currentSongWeek && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                This Week&apos;s Song Practice
                <span className="text-sm font-normal text-slate-400 ml-2">
                  Week of {new Date(currentSongWeek.week_start_date).toLocaleDateString()}
                </span>
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* In-Key Accuracy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">In-Key Accuracy</span>
                    {(() => {
                      const change = formatChange(currentSongWeek.accuracy_change)
                      return (
                        <span className={`flex items-center gap-1 text-xs ${change.color}`}>
                          <change.icon className="w-3 h-3" />
                          {change.text}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {currentSongWeek.avg_accuracy_percent?.toFixed(1) || '--'}%
                  </p>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                      style={{ width: `${currentSongWeek.avg_accuracy_percent || 0}%` }}
                    />
                  </div>
                </div>

                {/* Avg Cents Off */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Avg Cents Off</span>
                  <p className="text-3xl font-bold text-white">
                    {currentSongWeek.avg_cents_off?.toFixed(1) || '--'}
                    <span className="text-lg text-slate-400">¢</span>
                  </p>
                  <p className="text-xs text-slate-500">Lower is better</p>
                </div>

                {/* Total Notes */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Notes Sung</span>
                  <p className="text-3xl font-bold text-white">
                    {currentSongWeek.total_notes || 0}
                  </p>
                  <p className="text-xs text-slate-500">
                    {currentSongWeek.total_notes_in_key || 0} in key
                  </p>
                </div>

                {/* Songs Practiced */}
                <div className="space-y-2">
                  <span className="text-sm text-slate-400">Songs Practiced</span>
                  <p className="text-3xl font-bold text-white">
                    {currentSongWeek.total_songs_practiced || 0}
                  </p>
                  <p className="text-xs text-slate-500">{currentSongWeek.total_sessions} sessions</p>
                </div>
              </div>
            </div>
          )}

          {/* Recent Song Sessions */}
          {data.recentSongSessions.length > 0 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6">Recent Sessions</h2>
              <div className="space-y-3">
                {data.recentSongSessions.slice(0, 10).map((session, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                        <Music2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{session.song_title}</p>
                        <p className="text-sm text-slate-400">{session.song_artist} • Key of {session.song_key}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        session.accuracy_percent >= 80 ? 'text-green-400' :
                        session.accuracy_percent >= 60 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {session.accuracy_percent?.toFixed(1)}%
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
          {data.songWeeklyProgress.length > 1 && (
            <div className="glass-card-subtle rounded-2xl p-6 border-white/[0.08]">
              <h2 className="text-xl font-semibold text-white mb-6">Weekly History</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-slate-400 border-b border-white/[0.08]">
                      <th className="pb-3 pr-4">Week</th>
                      <th className="pb-3 pr-4">Accuracy</th>
                      <th className="pb-3 pr-4">Avg Cents Off</th>
                      <th className="pb-3 pr-4">Songs</th>
                      <th className="pb-3">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.songWeeklyProgress.map((week, index) => (
                      <tr key={week.id} className="border-b border-white/[0.08]">
                        <td className="py-3 pr-4 text-slate-300">
                          {new Date(week.week_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {index === 0 && <span className="ml-2 text-xs text-emerald-400">(Current)</span>}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-white font-medium">{week.avg_accuracy_percent?.toFixed(1) || '--'}%</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-300">{week.avg_cents_off?.toFixed(1) || '--'}¢</td>
                        <td className="py-3 pr-4 text-slate-300">{week.total_songs_practiced || 0}</td>
                        <td className="py-3 text-slate-300">{week.total_sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!currentSongWeek && data.recentSongSessions.length === 0 && (
            <div className="text-center py-12 glass-card-subtle rounded-2xl border-white/[0.08]">
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-600/20 rounded-full flex items-center justify-center">
                <Music2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Start Singing Songs</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Use the Song Pitch Trainer to practice singing in key with famous songs.
                Your sessions will be tracked here.
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
    </div>
  )
}
