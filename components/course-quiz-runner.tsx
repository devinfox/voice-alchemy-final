'use client'

import React, { useState } from 'react'
import { CourseQuiz } from '@/lib/courses'
import { CheckCircle2, XCircle, HelpCircle, RotateCcw, Sparkles } from 'lucide-react'

interface CourseQuizRunnerProps {
  quiz: CourseQuiz
  onComplete?: (scorePercent: number) => void
}

export function CourseQuizRunner({ quiz, onComplete }: CourseQuizRunnerProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)

  const totalQuestions = quiz.questions.length

  const handleSelectOption = (questionIndex: number, optionIndex: number) => {
    if (submitted) return
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionIndex,
    }))
  }

  const handleGradeQuiz = () => {
    setSubmitted(true)
    const correct = quiz.questions.reduce((count, q, idx) => {
      return selectedAnswers[idx] === q.correctAnswerIndex ? count + 1 : count
    }, 0)
    const percent = Math.round((correct / totalQuestions) * 100)
    if (onComplete) {
      onComplete(percent)
    }
  }

  const handleReset = () => {
    setSelectedAnswers({})
    setSubmitted(false)
  }

  const answeredCount = Object.keys(selectedAnswers).length
  const correctCount = quiz.questions.reduce((count, q, idx) => {
    return selectedAnswers[idx] === q.correctAnswerIndex ? count + 1 : count
  }, 0)
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  const isPassed = scorePercent >= (quiz.passingScorePercent || 70)

  return (
    <div className="glass-card-subtle rounded-3xl border border-purple-500/30 overflow-hidden mt-6 bg-purple-950/20">
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-5 sm:p-6 bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-transparent border-b border-purple-500/20 flex items-center justify-between cursor-pointer hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider">
                Optional Quiz
              </span>
              {submitted && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    isPassed
                      ? 'bg-green-500/20 text-green-300 border-green-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isPassed ? 'Passed' : 'Review & Retry'}
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white font-luxury mt-1">
              {quiz.title}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {submitted ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-300">
                Score: <strong className="text-white">{correctCount}/{totalQuestions}</strong> ({scorePercent}%)
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-400 font-mono">
              {answeredCount}/{totalQuestions} Answered
            </span>
          )}
        </div>
      </div>

      {/* Questions List */}
      {isExpanded && (
        <div className="p-4 sm:p-6 space-y-6">
          {quiz.questions.map((q, qIdx) => {
            const selectedIdx = selectedAnswers[qIdx]
            const isAnswered = selectedIdx !== undefined
            const isCorrect = isAnswered && selectedIdx === q.correctAnswerIndex

            return (
              <div
                key={q.id || qIdx}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  submitted
                    ? isCorrect
                      ? 'bg-green-500/[0.04] border-green-500/30'
                      : 'bg-red-500/[0.04] border-red-500/30'
                    : 'bg-white/[0.02] border-white/[0.06]'
                }`}
              >
                {/* Question Prompt */}
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-6 h-6 rounded-lg bg-white/[0.08] text-[#CEB466] font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {qIdx + 1}
                  </span>
                  <p className="text-sm sm:text-base font-medium text-white leading-relaxed">
                    {q.question}
                  </p>
                </div>

                {/* Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 ml-0 sm:ml-9">
                  {q.options.map((option, optIdx) => {
                    const isSelected = selectedIdx === optIdx
                    const isThisCorrect = optIdx === q.correctAnswerIndex

                    let optionStyle =
                      'bg-white/[0.03] text-gray-300 border-white/[0.08] hover:bg-white/[0.07] hover:border-white/20'

                    if (submitted) {
                      if (isThisCorrect) {
                        optionStyle = 'bg-green-500/20 text-green-200 border-green-500/60 font-semibold'
                      } else if (isSelected && !isThisCorrect) {
                        optionStyle = 'bg-red-500/20 text-red-200 border-red-500/60 line-through opacity-80'
                      } else {
                        optionStyle = 'bg-white/[0.02] text-gray-500 border-white/[0.04] opacity-50'
                      }
                    } else if (isSelected) {
                      optionStyle = 'bg-purple-500/20 text-purple-200 border-purple-500/60 font-semibold shadow-md shadow-purple-500/10'
                    }

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => handleSelectOption(qIdx, optIdx)}
                        className={`p-3 rounded-xl border text-xs sm:text-sm text-left transition-all flex items-center justify-between gap-2 ${optionStyle}`}
                      >
                        <span>{option}</span>
                        {submitted && isThisCorrect && (
                          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                        )}
                        {submitted && isSelected && !isThisCorrect && (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Explanation Card */}
                {submitted && q.explanation && (
                  <div className="mt-3.5 sm:ml-9 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-gray-300 leading-relaxed">
                    <strong className="text-[#CEB466]">Explanation: </strong>
                    {q.explanation}
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer Grade Button */}
          <div className="pt-2 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3">
            {submitted ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Quiz</span>
                </button>
                <span className="text-xs text-gray-400">
                  {isPassed ? 'Great job! Concept mastered.' : 'Review explanations above and retry!'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGradeQuiz}
                disabled={answeredCount === 0}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 ${
                  answeredCount === totalQuestions
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-purple-500/25 cursor-pointer'
                    : 'bg-white/10 text-gray-400 border border-white/10 cursor-pointer hover:bg-white/15 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  Check Answers ({answeredCount}/{totalQuestions})
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
