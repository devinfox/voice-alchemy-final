'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, Target, TrendingUp, Music, AlertTriangle, CheckCircle2, RefreshCw, Lightbulb, Award, ArrowUpDown, Volume2 } from 'lucide-react'

interface ScaleAnalysis {
  summary: string
  strengths: string[]
  challengingScales: string[]
  pitchTendencies: string[]
  sequenceInsights: string[]
  practiceRecommendations: string[]
  weeklyGoals: string[]
  encouragement: string
}

interface ScaleAnalysisPanelProps {
  isOpen: boolean
  onClose: () => void
  onAnalysisComplete?: () => void
}

export default function ScaleAnalysisPanel({ isOpen, onClose, onAnalysisComplete }: ScaleAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ScaleAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [dataContext, setDataContext] = useState<{
    sessionsAnalyzed: number
    notesAnalyzed: number
    weeksAnalyzed: number
  } | null>(null)

  // Fetch existing analysis when panel opens
  useEffect(() => {
    if (isOpen && !analysis) {
      fetchExistingAnalysis()
    }
  }, [isOpen])

  const fetchExistingAnalysis = async () => {
    try {
      const response = await fetch('/api/scale-training/analyze')
      if (response.ok) {
        const data = await response.json()
        if (data.analysis) {
          setAnalysis(data.analysis)
          setGeneratedAt(data.generatedAt)
        }
      }
    } catch (err) {
      console.error('Failed to fetch existing analysis:', err)
    }
  }

  const generateAnalysis = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/scale-training/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.sessionsNeeded) {
          setError(`Need at least ${data.sessionsNeeded} scale training sessions for analysis. You have ${data.currentSessions}.`)
        } else {
          throw new Error(data.error || 'Failed to generate analysis')
        }
        return
      }

      setAnalysis(data.analysis)
      setDataContext(data.dataContext)
      setGeneratedAt(new Date().toISOString())

      if (onAnalysisComplete) {
        onAnalysisComplete()
      }
    } catch (err) {
      setError('Failed to analyze scale training. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-800 border-l border-slate-700/50 shadow-2xl z-50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-pink-600/20 via-purple-600/20 to-fuchsia-600/20 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
              <Music className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Scale Training AI Coach</h2>
              <p className="text-xs text-slate-400">Personalized scale practice insights</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Generate Button */}
          {!analysis && !isLoading && !error && (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
                <Music className="w-10 h-10 text-pink-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Analyze Your Scale Training</h3>
              <p className="text-slate-400 mb-6 max-w-sm mx-auto">
                Get AI-powered insights on your scale practice, including which scales need work and pitch tendencies.
              </p>
              <button
                onClick={generateAnalysis}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Generate Analysis
                </span>
              </button>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
              <p className="text-amber-300 mb-4">{error}</p>
              <button
                onClick={generateAnalysis}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
                <div className="absolute inset-0 rounded-full border-4 border-pink-500 border-t-transparent animate-spin" />
              </div>
              <p className="text-slate-300 font-medium">Analyzing your scale training...</p>
              <p className="text-slate-500 text-sm mt-1">This may take a moment</p>
            </div>
          )}

          {/* Analysis Results */}
          {analysis && !isLoading && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-gradient-to-br from-pink-500/10 to-purple-500/10 rounded-xl p-4 border border-pink-500/20">
                <h3 className="text-sm font-semibold text-pink-300 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Overview
                </h3>
                <p className="text-slate-200 text-sm leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Strengths */}
              {analysis.strengths.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Your Strengths
                  </h3>
                  <ul className="space-y-2">
                    {analysis.strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-green-400 mt-0.5">+</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Challenging Scales */}
              {analysis.challengingScales.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Scales to Focus On
                  </h3>
                  <ul className="space-y-2">
                    {analysis.challengingScales.map((scale, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-amber-400 mt-0.5">!</span>
                        {scale}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pitch Tendencies */}
              {analysis.pitchTendencies.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    Pitch Tendencies
                  </h3>
                  <ul className="space-y-2">
                    {analysis.pitchTendencies.map((tendency, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-blue-400 mt-0.5">&bull;</span>
                        {tendency}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sequence Insights */}
              {analysis.sequenceInsights.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4" />
                    Sequence & Order Insights
                  </h3>
                  <ul className="space-y-2">
                    {analysis.sequenceInsights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-purple-400 mt-0.5">&bull;</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Practice Recommendations */}
              {analysis.practiceRecommendations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Practice Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {analysis.practiceRecommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-slate-800/50 rounded-lg p-2">
                        <span className="text-cyan-400 font-bold">{i + 1}.</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weekly Goals */}
              {analysis.weeklyGoals.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-fuchsia-400 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Goals for This Week
                  </h3>
                  <ul className="space-y-2">
                    {analysis.weeklyGoals.map((goal, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" className="rounded border-slate-600 bg-slate-800 text-fuchsia-500" />
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Encouragement */}
              {analysis.encouragement && (
                <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-xl p-4 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <Award className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-slate-200 text-sm italic">{analysis.encouragement}</p>
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                {generatedAt && (
                  <p className="text-xs text-slate-500">
                    Generated {new Date(generatedAt).toLocaleDateString()} at {new Date(generatedAt).toLocaleTimeString()}
                  </p>
                )}
                <button
                  onClick={generateAnalysis}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>

              {/* Data Context */}
              {dataContext && (
                <p className="text-xs text-slate-500 text-center">
                  Based on {dataContext.sessionsAnalyzed} sessions, {dataContext.notesAnalyzed} note samples, {dataContext.weeksAnalyzed} weeks of progress
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
