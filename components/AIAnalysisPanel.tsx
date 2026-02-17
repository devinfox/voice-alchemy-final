'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, Target, TrendingUp, Music, Activity, CheckCircle2, RefreshCw, MessageSquare, Lightbulb, Award } from 'lucide-react'

interface NotesAnalysis {
  summary: string
  vocalStrengths: string[]
  areasToImprove: string[]
  practiceRecommendations: string[]
  pitchTrainingFocus: string[]
  rhythmTrainingFocus: string[]
  weeklyGoals: string[]
  encouragement: string
}

interface AIAnalysisPanelProps {
  isOpen: boolean
  onClose: () => void
  onAnalysisComplete?: () => void
}

export default function AIAnalysisPanel({ isOpen, onClose, onAnalysisComplete }: AIAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<NotesAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [dataContext, setDataContext] = useState<{
    notesAnalyzed: number
    pitchWeeksAnalyzed: number
    rhythmWeeksAnalyzed: number
  } | null>(null)

  // Fetch existing analysis when panel opens
  useEffect(() => {
    if (isOpen && !analysis) {
      fetchExistingAnalysis()
    }
  }, [isOpen])

  const fetchExistingAnalysis = async () => {
    try {
      const response = await fetch('/api/pitch-training/analyze-notes')
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
      const response = await fetch('/api/pitch-training/analyze-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        throw new Error('Failed to generate analysis')
      }

      const data = await response.json()
      setAnalysis(data.analysis)
      setDataContext(data.dataContext)
      setGeneratedAt(new Date().toISOString())

      if (onAnalysisComplete) {
        onAnalysisComplete()
      }
    } catch (err) {
      setError('Failed to analyze notes. Please try again.')
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
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-800 border-l border-slate-700/50 shadow-2xl z-50 animate-slide-in-right overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-600/20 via-purple-600/20 to-indigo-600/20 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-purple-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI Coach Analysis</h2>
              <p className="text-xs text-slate-400">Insights from your notes & training</p>
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
          {!analysis && !isLoading && (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-amber-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-amber-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Analyze Your Progress</h3>
              <p className="text-slate-400 mb-6 max-w-sm mx-auto">
                Get AI-powered insights based on your lesson notes and training data.
              </p>
              <button
                onClick={generateAnalysis}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Generate Analysis
                </span>
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
                <div className="absolute inset-0 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
              </div>
              <p className="text-slate-300 font-medium">Analyzing your notes...</p>
              <p className="text-slate-500 text-sm mt-1">This may take a moment</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
              <p className="text-red-400">{error}</p>
              <button
                onClick={generateAnalysis}
                className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Analysis Results */}
          {analysis && !isLoading && (
            <>
              {/* Summary */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-400 mb-2">Summary</h3>
                    <p className="text-slate-300 text-sm leading-relaxed">{analysis.summary}</p>
                  </div>
                </div>
              </div>

              {/* Encouragement */}
              {analysis.encouragement && (
                <div className="bg-gradient-to-r from-amber-500/10 to-purple-500/10 rounded-xl p-4 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <Award className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <p className="text-amber-200 text-sm italic">&ldquo;{analysis.encouragement}&rdquo;</p>
                  </div>
                </div>
              )}

              {/* Vocal Strengths */}
              {analysis.vocalStrengths?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Your Strengths
                  </h3>
                  <div className="space-y-2">
                    {analysis.vocalStrengths.map((strength, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                        <span className="text-green-400 mt-0.5">+</span>
                        {strength}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Areas to Improve */}
              {analysis.areasToImprove?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Areas to Focus On
                  </h3>
                  <div className="space-y-2">
                    {analysis.areasToImprove.map((area, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                        <span className="text-amber-400 mt-0.5">!</span>
                        {area}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Practice Recommendations */}
              {analysis.practiceRecommendations?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Practice Recommendations
                  </h3>
                  <div className="space-y-2">
                    {analysis.practiceRecommendations.map((rec, i) => (
                      <div key={i} className="text-sm text-slate-300 bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Training Focus */}
              <div className="grid grid-cols-2 gap-4">
                {/* Pitch Training Focus */}
                {analysis.pitchTrainingFocus?.length > 0 && (
                  <div className="bg-indigo-500/10 rounded-xl p-4 border border-indigo-500/20">
                    <h4 className="text-xs font-semibold text-indigo-400 mb-2 flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5" />
                      Pitch Focus
                    </h4>
                    <ul className="space-y-1">
                      {analysis.pitchTrainingFocus.map((focus, i) => (
                        <li key={i} className="text-xs text-slate-300">{focus}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Rhythm Training Focus */}
                {analysis.rhythmTrainingFocus?.length > 0 && (
                  <div className="bg-orange-500/10 rounded-xl p-4 border border-orange-500/20">
                    <h4 className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      Rhythm Focus
                    </h4>
                    <ul className="space-y-1">
                      {analysis.rhythmTrainingFocus.map((focus, i) => (
                        <li key={i} className="text-xs text-slate-300">{focus}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Weekly Goals */}
              {analysis.weeklyGoals?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    This Week&apos;s Goals
                  </h3>
                  <div className="space-y-2">
                    {analysis.weeklyGoals.map((goal, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-slate-300 bg-cyan-500/10 rounded-lg p-3 border border-cyan-500/20">
                        <span className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-bold">
                          {i + 1}
                        </span>
                        {goal}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regenerate Button */}
              <div className="pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                  {generatedAt && (
                    <p className="text-xs text-slate-500">
                      Generated {new Date(generatedAt).toLocaleDateString()} at{' '}
                      {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  <button
                    onClick={generateAnalysis}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CSS Animation */}
      <style jsx global>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </>
  )
}
