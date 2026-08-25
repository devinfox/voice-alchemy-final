'use client'

import React, { useEffect, useState } from 'react'
import {
  Course,
  CourseSection,
  CourseLesson,
  CourseQuiz,
  QuizQuestion,
  saveCustomCourse,
  generateId,
  generateUniqueSlug,
} from '@/lib/courses'
import {
  X,
  Plus,
  Trash2,
  HelpCircle,
  Sparkles,
  GraduationCap,
  Layers,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface CourseBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  onCourseCreated: (course: Course) => void
  initialCourse?: Course | null
}

function deepCloneSections(sections: CourseSection[]): CourseSection[] {
  if (typeof structuredClone === 'function') return structuredClone(sections)
  return JSON.parse(JSON.stringify(sections)) as CourseSection[]
}

function defaultSections(): CourseSection[] {
  return [
    {
      id: generateId('module'),
      title: 'Module 1: Foundations & Technique',
      lessons: [
        {
          id: generateId('lesson'),
          title: 'Lesson 1',
          duration: '10 min',
          summary: '',
          body: [],
          keyPoints: [],
          practice: [],
        },
      ],
    },
  ]
}

// Newline-joined textarea helpers: keep raw lines (including empties) while
// editing so typing Enter works; empties are stripped at save time.
function linesToText(lines: string[]): string {
  return lines.join('\n')
}

function textToLines(text: string): string[] {
  return text.split('\n')
}

function cleanLines(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => line.length > 0)
}

export function CourseBuilderModal({
  isOpen,
  onClose,
  onCourseCreated,
  initialCourse,
}: CourseBuilderModalProps) {
  const [title, setTitle] = useState(initialCourse?.title || '')
  const [subtitle, setSubtitle] = useState(initialCourse?.subtitle || '')
  const [description, setDescription] = useState(initialCourse?.description || '')
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>(
    initialCourse?.level || 'Beginner'
  )
  const [instructor, setInstructor] = useState(initialCourse?.instructor || 'Voice Alchemy Coach')
  const [whatYouWillLearn, setWhatYouWillLearn] = useState<string[]>(
    initialCourse?.whatYouWillLearn ? [...initialCourse.whatYouWillLearn] : []
  )
  const [requirements, setRequirements] = useState<string[]>(
    initialCourse?.requirements ? [...initialCourse.requirements] : []
  )
  // Deep-clone so edits never mutate objects shared with the catalog page —
  // otherwise "cancel" would leave half-applied edits in the parent's state.
  const [sections, setSections] = useState<CourseSection[]>(() =>
    initialCourse?.sections?.length ? deepCloneSections(initialCourse.sections) : defaultSections()
  )

  const [activeTab, setActiveTab] = useState<'details' | 'curriculum'>('curriculum')
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)

  // Snapshot of the initial form state, for the unsaved-changes prompt.
  const buildSnapshot = () =>
    JSON.stringify({
      title,
      subtitle,
      description,
      level,
      instructor,
      whatYouWillLearn,
      requirements,
      sections,
    })
  const [initialSnapshot] = useState(buildSnapshot)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const attemptClose = () => {
    if (buildSnapshot() !== initialSnapshot) {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    if (!isOpen || showDiscardConfirm) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') attemptClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  // ── Immutable state updaters ──────────────────────────────────────────────

  const updateSection = (sectionIdx: number, patch: Partial<CourseSection>) => {
    setSections((prev) =>
      prev.map((section, idx) => (idx === sectionIdx ? { ...section, ...patch } : section))
    )
  }

  const updateLesson = (sectionIdx: number, lessonIdx: number, patch: Partial<CourseLesson>) => {
    setSections((prev) =>
      prev.map((section, sIdx) =>
        sIdx === sectionIdx
          ? {
              ...section,
              lessons: section.lessons.map((lesson, lIdx) =>
                lIdx === lessonIdx ? { ...lesson, ...patch } : lesson
              ),
            }
          : section
      )
    )
  }

  const updateQuiz = (sectionIdx: number, lessonIdx: number, patch: Partial<CourseQuiz>) => {
    setSections((prev) =>
      prev.map((section, sIdx) =>
        sIdx === sectionIdx
          ? {
              ...section,
              lessons: section.lessons.map((lesson, lIdx) =>
                lIdx === lessonIdx && lesson.quiz
                  ? { ...lesson, quiz: { ...lesson.quiz, ...patch } }
                  : lesson
              ),
            }
          : section
      )
    )
  }

  const updateQuestion = (
    sectionIdx: number,
    lessonIdx: number,
    questionIdx: number,
    patch: Partial<QuizQuestion>
  ) => {
    setSections((prev) =>
      prev.map((section, sIdx) =>
        sIdx === sectionIdx
          ? {
              ...section,
              lessons: section.lessons.map((lesson, lIdx) =>
                lIdx === lessonIdx && lesson.quiz
                  ? {
                      ...lesson,
                      quiz: {
                        ...lesson.quiz,
                        questions: lesson.quiz.questions.map((q, qIdx) =>
                          qIdx === questionIdx ? { ...q, ...patch } : q
                        ),
                      },
                    }
                  : lesson
              ),
            }
          : section
      )
    )
  }

  // ── Structure operations ──────────────────────────────────────────────────

  const handleAddSection = () => {
    const newSection: CourseSection = {
      id: generateId('module'),
      title: `Module ${sections.length + 1}`,
      lessons: [
        {
          id: generateId('lesson'),
          title: 'Lesson 1',
          duration: '10 min',
          summary: '',
          body: [],
          keyPoints: [],
          practice: [],
        },
      ],
    }
    setSections((prev) => [...prev, newSection])
    setSelectedSectionIdx(sections.length)
  }

  const handleRemoveSection = (sectionIdx: number) => {
    if (sections.length <= 1) return
    setSections((prev) => prev.filter((_, idx) => idx !== sectionIdx))
    setSelectedSectionIdx(Math.max(0, Math.min(sectionIdx - 1, sections.length - 2)))
  }

  const handleAddLesson = (sectionIdx: number) => {
    const newLesson: CourseLesson = {
      id: generateId('lesson'),
      title: `Lesson ${sections[sectionIdx].lessons.length + 1}`,
      duration: '10 min',
      summary: '',
      body: [],
      keyPoints: [],
      practice: [],
    }
    setSections((prev) =>
      prev.map((section, idx) =>
        idx === sectionIdx ? { ...section, lessons: [...section.lessons, newLesson] } : section
      )
    )
  }

  const handleRemoveLesson = (sectionIdx: number, lessonIdx: number) => {
    if (sections[sectionIdx].lessons.length <= 1) return
    setSections((prev) =>
      prev.map((section, idx) =>
        idx === sectionIdx
          ? { ...section, lessons: section.lessons.filter((_, lIdx) => lIdx !== lessonIdx) }
          : section
      )
    )
  }

  const handleToggleQuiz = (sectionIdx: number, lessonIdx: number) => {
    const lesson = sections[sectionIdx]?.lessons[lessonIdx]
    if (!lesson) return
    if (lesson.quiz) {
      updateLesson(sectionIdx, lessonIdx, { quiz: undefined })
    } else {
      const newQuiz: CourseQuiz = {
        id: generateId('quiz'),
        title: `Checkpoint: ${lesson.title}`,
        description: '',
        isOptional: true,
        passingScorePercent: 70,
        questions: [
          {
            id: generateId('q'),
            question: '',
            options: ['', '', '', ''],
            correctAnswerIndex: 0,
            explanation: '',
          },
        ],
      }
      updateLesson(sectionIdx, lessonIdx, { quiz: newQuiz })
    }
  }

  const handleAddQuizQuestion = (sectionIdx: number, lessonIdx: number) => {
    const quiz = sections[sectionIdx]?.lessons[lessonIdx]?.quiz
    if (!quiz) return
    const newQuestion: QuizQuestion = {
      id: generateId('q'),
      question: '',
      options: ['', '', '', ''],
      correctAnswerIndex: 0,
      explanation: '',
    }
    updateQuiz(sectionIdx, lessonIdx, { questions: [...quiz.questions, newQuestion] })
  }

  const handleRemoveQuizQuestion = (sectionIdx: number, lessonIdx: number, questionIdx: number) => {
    const quiz = sections[sectionIdx]?.lessons[lessonIdx]?.quiz
    if (!quiz || quiz.questions.length <= 1) return
    updateQuiz(sectionIdx, lessonIdx, {
      questions: quiz.questions.filter((_, qIdx) => qIdx !== questionIdx),
    })
  }

  const handleAddOption = (sectionIdx: number, lessonIdx: number, questionIdx: number) => {
    const question = sections[sectionIdx]?.lessons[lessonIdx]?.quiz?.questions[questionIdx]
    if (!question || question.options.length >= 6) return
    updateQuestion(sectionIdx, lessonIdx, questionIdx, { options: [...question.options, ''] })
  }

  const handleRemoveOption = (
    sectionIdx: number,
    lessonIdx: number,
    questionIdx: number,
    optionIdx: number
  ) => {
    const question = sections[sectionIdx]?.lessons[lessonIdx]?.quiz?.questions[questionIdx]
    if (!question || question.options.length <= 2) return
    const nextOptions = question.options.filter((_, oIdx) => oIdx !== optionIdx)
    let nextCorrect = question.correctAnswerIndex
    if (optionIdx === question.correctAnswerIndex) nextCorrect = 0
    else if (optionIdx < question.correctAnswerIndex) nextCorrect -= 1
    updateQuestion(sectionIdx, lessonIdx, questionIdx, {
      options: nextOptions,
      correctAnswerIndex: nextCorrect,
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const validate = (): string[] => {
    const errors: string[] = []
    if (!title.trim()) errors.push('Course title is required.')
    sections.forEach((section, sIdx) => {
      if (!section.title.trim()) errors.push(`Module ${sIdx + 1} needs a title.`)
      section.lessons.forEach((lesson, lIdx) => {
        if (!lesson.title.trim()) errors.push(`Module ${sIdx + 1}, Lesson ${lIdx + 1} needs a title.`)
        if (lesson.quiz) {
          lesson.quiz.questions.forEach((q, qIdx) => {
            const label = `Module ${sIdx + 1}, Lesson ${lIdx + 1}, Question ${qIdx + 1}`
            if (!q.question.trim()) errors.push(`${label} needs a prompt.`)
            const filledOptions = q.options.filter((opt) => opt.trim().length > 0)
            if (filledOptions.length < 2) errors.push(`${label} needs at least 2 answer options.`)
            if (!q.options[q.correctAnswerIndex]?.trim())
              errors.push(`${label}: the correct answer can't be an empty option.`)
          })
        }
      })
    })
    return errors
  }

  const handleSaveCourse = () => {
    setSaveError(null)
    const errors = validate()
    setValidationErrors(errors)
    if (errors.length > 0) return

    const slug = initialCourse?.slug || generateUniqueSlug(title)

    const cleanedSections: CourseSection[] = sections.map((section) => ({
      ...section,
      title: section.title.trim(),
      lessons: section.lessons.map((lesson) => ({
        ...lesson,
        title: lesson.title.trim(),
        summary: lesson.summary.trim(),
        body: cleanLines(lesson.body),
        keyPoints: cleanLines(lesson.keyPoints),
        practice: cleanLines(lesson.practice),
        quiz: lesson.quiz
          ? {
              ...lesson.quiz,
              title: lesson.quiz.title.trim() || 'Knowledge Check',
              description: lesson.quiz.description?.trim() || undefined,
              questions: lesson.quiz.questions.map((q) => ({
                ...q,
                question: q.question.trim(),
                options: q.options.map((opt) => opt.trim()),
                explanation: q.explanation?.trim() || undefined,
              })),
            }
          : undefined,
      })),
    }))

    const newCourse: Course = {
      slug,
      title: title.trim(),
      subtitle: subtitle.trim() || 'Custom instructor curriculum',
      description: description.trim() || 'Custom vocal progress course.',
      level,
      isFree: initialCourse?.isFree ?? true,
      isUnlocked: initialCourse?.isUnlocked ?? true,
      instructor: instructor.trim() || 'Voice Alchemy Coach',
      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      whatYouWillLearn: cleanLines(whatYouWillLearn),
      requirements: cleanLines(requirements),
      sections: cleanedSections,
      isCustom: true,
    }

    const saved = saveCustomCourse(newCourse)
    if (!saved) {
      setSaveError(
        'Saving failed — your browser storage may be full. Your edits are still here; try removing another course or freeing space, then publish again.'
      )
      return
    }
    onCourseCreated(saved)
    onClose()
  }

  const safeSectionIdx = Math.min(selectedSectionIdx, sections.length - 1)
  const currentSection = sections[safeSectionIdx]

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-2 sm:p-4">
      {/* Dim overlay */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-[2px] transition-opacity"
        onClick={attemptClose}
      />

      {/* Modal Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initialCourse ? 'Edit Course' : 'Course & Quiz Studio'}
        className="relative z-[9995] w-full max-w-5xl h-[92dvh] sm:h-[90vh] glass-card-luxe modal-solid rounded-2xl sm:rounded-3xl border-2 border-[#CEB466]/60 shadow-2xl shadow-black/90 flex flex-col overflow-hidden animate-slide-up"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] shadow-lg shadow-[#CEB466]/20 font-bold flex-shrink-0">
              <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-white font-luxury truncate">
                {initialCourse ? 'Edit Course' : 'Course & Quiz Studio'}
              </h2>
              <p className="text-[10px] sm:text-xs text-gray-300 hidden xs:block truncate">
                Design vocal courses with optional lesson quizzes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={handleSaveCourse}
              className="px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] font-bold text-xs sm:text-sm shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Publish</span>
            </button>

            <button
              onClick={attemptClose}
              aria-label="Close course builder"
              className="p-1.5 sm:p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Validation / save errors */}
        {(validationErrors.length > 0 || saveError) && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-xs text-red-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-red-300">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{saveError ? 'Could not save' : 'Fix these before publishing:'}</span>
            </div>
            {saveError ? (
              <p>{saveError}</p>
            ) : (
              <ul className="list-disc list-inside space-y-0.5">
                {validationErrors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 border-b border-white/[0.08] flex items-center gap-3 sm:gap-4 bg-white/[0.01] overflow-x-auto whitespace-nowrap scrollbar-none">
          <button
            onClick={() => setActiveTab('curriculum')}
            className={`py-2.5 sm:py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 flex-shrink-0 ${
              activeTab === 'curriculum'
                ? 'border-[#CEB466] text-[#CEB466]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Modules & Quizzes ({sections.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('details')}
            className={`py-2.5 sm:py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 flex-shrink-0 ${
              activeTab === 'details'
                ? 'border-[#CEB466] text-[#CEB466]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Metadata & Settings</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6">
          {activeTab === 'details' ? (
            /* DETAILS TAB */
            <div className="max-w-2xl space-y-4">
              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase text-gray-400 mb-1">
                  Course Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Mixed Voice Mastery & Range Expansion"
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs sm:text-sm focus:border-[#CEB466] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase text-gray-400 mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g. Eliminate the vocal break and sing with resonant bite"
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs sm:text-sm focus:border-[#CEB466] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-[11px] sm:text-xs font-bold uppercase text-gray-400 mb-1">
                    Difficulty Level
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as 'Beginner' | 'Intermediate' | 'Advanced')}
                    className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-[#171229] border border-white/10 text-white text-xs sm:text-sm focus:border-[#CEB466] focus:outline-none"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] sm:text-xs font-bold uppercase text-gray-400 mb-1">
                    Instructor Name
                  </label>
                  <input
                    type="text"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="Coach name"
                    className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs sm:text-sm focus:border-[#CEB466] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase text-gray-400 mb-1">
                  Outcome Promise & Overview
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the vocal transformation students achieve by completing this course..."
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs sm:text-sm focus:border-[#CEB466] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase text-gray-400 mb-1">
                  What Students Will Learn <span className="normal-case font-normal">(one outcome per line)</span>
                </label>
                <textarea
                  rows={4}
                  value={linesToText(whatYouWillLearn)}
                  onChange={(e) => setWhatYouWillLearn(textToLines(e.target.value))}
                  placeholder={'Build stable breath support\nCenter pitch with drone practice\nSing with clear, relaxed tone'}
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs sm:text-sm focus:border-[#CEB466] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase text-gray-400 mb-1">
                  Requirements <span className="normal-case font-normal">(one per line)</span>
                </label>
                <textarea
                  rows={3}
                  value={linesToText(requirements)}
                  onChange={(e) => setRequirements(textToLines(e.target.value))}
                  placeholder={'No prior experience required\nQuiet practice space and microphone'}
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs sm:text-sm focus:border-[#CEB466] focus:outline-none"
                />
              </div>
            </div>
          ) : !currentSection ? (
            /* Defensive empty state — sections should never be empty via the UI */
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-gray-300">This course has no modules yet.</p>
              <button
                onClick={handleAddSection}
                className="px-4 py-2 rounded-xl bg-[#CEB466]/10 hover:bg-[#CEB466]/20 text-[#CEB466] border border-[#CEB466]/30 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Module</span>
              </button>
            </div>
          ) : (
            /* CURRICULUM TAB (Modules, Lessons, Optional Quizzes) */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 h-full">
              {/* Left Column: Modules Sidebar */}
              <div className="md:col-span-4 space-y-2.5 sm:space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-gray-400">
                    Modules ({sections.length})
                  </h3>
                  <button
                    onClick={handleAddSection}
                    className="px-2.5 py-1 rounded-lg bg-[#CEB466]/10 hover:bg-[#CEB466]/20 text-[#CEB466] border border-[#CEB466]/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Module</span>
                  </button>
                </div>

                <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-none">
                  {sections.map((section, idx) => (
                    <div
                      key={section.id}
                      onClick={() => setSelectedSectionIdx(idx)}
                      className={`p-3 rounded-xl sm:rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 flex-shrink-0 min-w-[200px] md:min-w-0 ${
                        safeSectionIdx === idx
                          ? 'bg-[#CEB466]/15 border-[#CEB466]/50 text-white shadow-md shadow-[#CEB466]/10'
                          : 'bg-white/[0.02] border-white/[0.06] text-gray-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{section.title || `Module ${idx + 1}`}</p>
                        <p className="text-[10px] sm:text-[11px] text-gray-400">
                          {section.lessons.length} Lessons •{' '}
                          {section.lessons.filter((l) => l.quiz).length} Quizzes
                        </p>
                      </div>

                      {sections.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveSection(idx)
                          }}
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          title="Delete module"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Active Module Lessons & Quiz Builder */}
              <div className="md:col-span-8 space-y-5 bg-white/[0.02] p-5 rounded-3xl border border-white/[0.06]">
                {/* Module Title Edit */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                    Module Title
                  </label>
                  <input
                    type="text"
                    value={currentSection.title}
                    onChange={(e) => updateSection(safeSectionIdx, { title: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-bold text-base focus:border-[#CEB466] focus:outline-none"
                  />
                </div>

                {/* Lessons in this Module */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Module Lessons ({currentSection.lessons.length})
                    </h4>
                    <button
                      onClick={() => handleAddLesson(safeSectionIdx)}
                      className="px-3 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Lesson</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {currentSection.lessons.map((lesson, lIdx) => (
                      <div
                        key={lesson.id}
                        className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={lesson.title}
                              onChange={(e) => updateLesson(safeSectionIdx, lIdx, { title: e.target.value })}
                              placeholder="Lesson title"
                              className="sm:col-span-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs font-bold focus:border-[#CEB466] focus:outline-none"
                            />
                            <input
                              type="text"
                              value={lesson.duration}
                              onChange={(e) => updateLesson(safeSectionIdx, lIdx, { duration: e.target.value })}
                              placeholder="Duration (e.g. 15 min)"
                              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-xs focus:border-[#CEB466] focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Quiz Toggle Button */}
                            <button
                              onClick={() => handleToggleQuiz(safeSectionIdx, lIdx)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border transition-all ${
                                lesson.quiz
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-md shadow-purple-500/10'
                                  : 'bg-white/[0.04] text-gray-400 border-white/10 hover:text-white'
                              }`}
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                              <span>{lesson.quiz ? 'Quiz Attached' : '+ Add Quiz'}</span>
                            </button>

                            {currentSection.lessons.length > 1 && (
                              <button
                                onClick={() => handleRemoveLesson(safeSectionIdx, lIdx)}
                                className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                                title="Delete lesson"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Lesson Summary */}
                        <input
                          type="text"
                          value={lesson.summary}
                          onChange={(e) => updateLesson(safeSectionIdx, lIdx, { summary: e.target.value })}
                          placeholder="Lesson summary statement..."
                          className="w-full px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-gray-300 text-xs focus:border-[#CEB466] focus:outline-none"
                        />

                        {/* Lesson Content: breakdown, key points, practice */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                              Lesson Breakdown
                            </label>
                            <textarea
                              rows={3}
                              value={linesToText(lesson.body)}
                              onChange={(e) => updateLesson(safeSectionIdx, lIdx, { body: textToLines(e.target.value) })}
                              placeholder={'One paragraph per line…'}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-gray-300 text-[11px] leading-relaxed focus:border-[#CEB466] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                              Key Points
                            </label>
                            <textarea
                              rows={3}
                              value={linesToText(lesson.keyPoints)}
                              onChange={(e) => updateLesson(safeSectionIdx, lIdx, { keyPoints: textToLines(e.target.value) })}
                              placeholder={'One key point per line…'}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-gray-300 text-[11px] leading-relaxed focus:border-[#CEB466] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                              Practice Assignments
                            </label>
                            <textarea
                              rows={3}
                              value={linesToText(lesson.practice)}
                              onChange={(e) => updateLesson(safeSectionIdx, lIdx, { practice: textToLines(e.target.value) })}
                              placeholder={'One assignment per line…'}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-gray-300 text-[11px] leading-relaxed focus:border-[#CEB466] focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* QUIZ BUILDER PANEL (IF QUIZ ENABLED) */}
                        {lesson.quiz && (
                          <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-500/30 space-y-4 animate-fade-in">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="px-2 py-0.5 rounded-md bg-purple-500/30 text-purple-300 text-[10px] font-bold uppercase shrink-0">
                                  {lesson.quiz.isOptional ? 'Optional Quiz' : 'Required Check'}
                                </span>
                                <input
                                  type="text"
                                  value={lesson.quiz.title}
                                  onChange={(e) => updateQuiz(safeSectionIdx, lIdx, { title: e.target.value })}
                                  placeholder="Quiz title"
                                  className="flex-1 min-w-0 text-xs font-bold text-white bg-transparent border-b border-purple-500/40 focus:outline-none focus:border-purple-300"
                                />
                              </div>

                              <button
                                onClick={() => handleAddQuizQuestion(safeSectionIdx, lIdx)}
                                className="px-2 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-[11px] font-semibold flex items-center gap-1 border border-purple-500/30 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Question</span>
                              </button>
                            </div>

                            {/* Quiz settings */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold uppercase text-purple-300/70 mb-1">
                                  Quiz Description
                                </label>
                                <input
                                  type="text"
                                  value={lesson.quiz.description || ''}
                                  onChange={(e) => updateQuiz(safeSectionIdx, lIdx, { description: e.target.value })}
                                  placeholder="Shown to students above the quiz…"
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-[11px] focus:border-purple-400 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-purple-300/70 mb-1">
                                  Passing Score (%)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={lesson.quiz.passingScorePercent ?? 70}
                                  onChange={(e) => {
                                    const parsed = parseInt(e.target.value, 10)
                                    updateQuiz(safeSectionIdx, lIdx, {
                                      passingScorePercent: Number.isNaN(parsed)
                                        ? 70
                                        : Math.max(0, Math.min(100, parsed)),
                                    })
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[11px] focus:border-purple-400 focus:outline-none"
                                />
                              </div>
                            </div>

                            {/* Questions List */}
                            <div className="space-y-3">
                              {lesson.quiz.questions.map((q, qIdx) => (
                                <div
                                  key={q.id}
                                  className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 space-y-2.5"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-purple-400 font-bold shrink-0">
                                      Q{qIdx + 1}:
                                    </span>
                                    <input
                                      type="text"
                                      value={q.question}
                                      onChange={(e) => updateQuestion(safeSectionIdx, lIdx, qIdx, { question: e.target.value })}
                                      placeholder="Question prompt..."
                                      className="w-full px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 text-white text-xs focus:border-purple-400 focus:outline-none"
                                    />
                                    {lesson.quiz!.questions.length > 1 && (
                                      <button
                                        onClick={() => handleRemoveQuizQuestion(safeSectionIdx, lIdx, qIdx)}
                                        className="p-1 text-gray-500 hover:text-red-400 transition-colors shrink-0"
                                        title="Delete question"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Options with correct-answer radio */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {q.options.map((opt, optIdx) => (
                                      <div
                                        key={optIdx}
                                        className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/5"
                                      >
                                        <input
                                          type="radio"
                                          name={`q-${lesson.id}-${qIdx}`}
                                          checked={q.correctAnswerIndex === optIdx}
                                          onChange={() => updateQuestion(safeSectionIdx, lIdx, qIdx, { correctAnswerIndex: optIdx })}
                                          className="text-purple-500 focus:ring-purple-400"
                                          title="Mark as correct answer"
                                        />
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={(e) => {
                                            const nextOptions = q.options.map((o, oIdx) =>
                                              oIdx === optIdx ? e.target.value : o
                                            )
                                            updateQuestion(safeSectionIdx, lIdx, qIdx, { options: nextOptions })
                                          }}
                                          placeholder={`Answer option ${optIdx + 1}`}
                                          className={`w-full bg-transparent text-xs focus:outline-none ${
                                            q.correctAnswerIndex === optIdx
                                              ? 'text-emerald-400 font-semibold'
                                              : 'text-gray-300'
                                          }`}
                                        />
                                        {q.options.length > 2 && (
                                          <button
                                            onClick={() => handleRemoveOption(safeSectionIdx, lIdx, qIdx, optIdx)}
                                            className="p-0.5 text-gray-600 hover:text-red-400 transition-colors shrink-0"
                                            title="Remove option"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  {q.options.length < 6 && (
                                    <button
                                      onClick={() => handleAddOption(safeSectionIdx, lIdx, qIdx)}
                                      className="text-[11px] text-purple-300/80 hover:text-purple-200 font-semibold flex items-center gap-1 transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add Option</span>
                                    </button>
                                  )}

                                  {/* Explanation */}
                                  <input
                                    type="text"
                                    value={q.explanation || ''}
                                    onChange={(e) => updateQuestion(safeSectionIdx, lIdx, qIdx, { explanation: e.target.value })}
                                    placeholder="Explanation shown when graded..."
                                    className="w-full px-2 py-1 rounded-md bg-white/[0.02] border border-white/5 text-gray-400 text-[11px] focus:outline-none focus:border-purple-400"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved-changes confirmation */}
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Discard unsaved changes?"
        message="Your edits to this course haven't been published yet. Closing now will discard them."
        confirmText="Discard Changes"
        cancelText="Keep Editing"
        destructive
        onConfirm={() => {
          setShowDiscardConfirm(false)
          onClose()
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  )
}
