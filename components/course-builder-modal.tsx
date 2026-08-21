'use client'

import React, { useState } from 'react'
import { Course, CourseSection, CourseLesson, CourseQuiz, QuizQuestion, saveCustomCourse } from '@/lib/courses'
import {
  X,
  Plus,
  Trash2,
  HelpCircle,
  Sparkles,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Layers,
  FileText,
  AlertCircle,
} from 'lucide-react'

interface CourseBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  onCourseCreated: (course: Course) => void
  initialCourse?: Course | null
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
  const [sections, setSections] = useState<CourseSection[]>(
    initialCourse?.sections || [
      {
        id: 'module-1',
        title: 'Module 1: Foundations & Technique',
        lessons: [
          {
            id: 'lesson-1-1',
            title: 'Lesson 1: Phonation & Onset Ease',
            duration: '12 min',
            summary: 'Master clean phonation onset without vocal fold strain.',
            body: [
              'Build balanced airflow and vocal fold approximation before singing high passages.',
              'Focus on sensation behind the upper teeth rather than pressing in the throat.',
            ],
            keyPoints: ['No throat squeezing', 'Sustained breath support', 'Clean onset vibration'],
            practice: ['3 rounds of 30-second straw sirens', '5 gentle hum-to-vowel transitions'],
            quiz: {
              id: 'quiz-1-1',
              title: 'Module 1 Checkpoint: Vocal Onset',
              description: 'Quick check on breath-flow coordination.',
              isOptional: true,
              passingScorePercent: 100,
              questions: [
                {
                  id: 'q1',
                  question: 'Where should you feel primary acoustic resonance during clean onset?',
                  options: [
                    'Heavy throat pressing at the larynx',
                    'Upper facial mask / hard palate without squeeze',
                    'Clenching the jaw muscles',
                    'Holding all breath in the chest',
                  ],
                  correctAnswerIndex: 1,
                  explanation:
                    'Resonance should vibrate freely through the vocal tract and hard palate, never held under throat pressure.',
                },
              ],
            },
          },
        ],
      },
    ]
  )

  const [activeTab, setActiveTab] = useState<'details' | 'curriculum'>('curriculum')
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0)

  if (!isOpen) return null

  const handleAddSection = () => {
    const newSectionNum = sections.length + 1
    const newSection: CourseSection = {
      id: `module-${Date.now()}`,
      title: `Module ${newSectionNum}: New Vocal Milestone`,
      lessons: [
        {
          id: `lesson-${Date.now()}`,
          title: 'Lesson 1: Core Technique Drill',
          duration: '15 min',
          summary: 'Overview and execution of this module concept.',
          body: ['Step-by-step vocal breakdown.'],
          keyPoints: ['Focus on resonance clarity', 'Maintain relaxed posture'],
          practice: ['Practice 10 reps of the assigned interval pattern'],
        },
      ],
    }
    setSections([...sections, newSection])
    setSelectedSectionIdx(sections.length)
  }

  const handleRemoveSection = (sectionIdx: number) => {
    if (sections.length <= 1) return
    const next = sections.filter((_, idx) => idx !== sectionIdx)
    setSections(next)
    setSelectedSectionIdx(Math.max(0, sectionIdx - 1))
  }

  const handleAddLesson = (sectionIdx: number) => {
    const currentSec = sections[sectionIdx]
    const newLessonNum = currentSec.lessons.length + 1
    const newLesson: CourseLesson = {
      id: `lesson-${Date.now()}`,
      title: `Lesson ${newLessonNum}: Practice Drill`,
      duration: '10 min',
      summary: 'Practical exercise application.',
      body: ['Detailed breakdown of this exercise.'],
      keyPoints: ['Maintain steady pitch sustain'],
      practice: ['Perform 5 sets of chromatic matching'],
    }
    const nextSections = [...sections]
    nextSections[sectionIdx] = {
      ...currentSec,
      lessons: [...currentSec.lessons, newLesson],
    }
    setSections(nextSections)
  }

  const handleRemoveLesson = (sectionIdx: number, lessonIdx: number) => {
    const currentSec = sections[sectionIdx]
    if (currentSec.lessons.length <= 1) return
    const nextSections = [...sections]
    nextSections[sectionIdx] = {
      ...currentSec,
      lessons: currentSec.lessons.filter((_, idx) => idx !== lessonIdx),
    }
    setSections(nextSections)
  }

  const handleToggleQuiz = (sectionIdx: number, lessonIdx: number) => {
    const currentSec = sections[sectionIdx]
    const currentLesson = currentSec.lessons[lessonIdx]
    const nextSections = [...sections]

    if (currentLesson.quiz) {
      // Remove quiz
      const updated = { ...currentLesson }
      delete updated.quiz
      nextSections[sectionIdx].lessons[lessonIdx] = updated
    } else {
      // Add new optional quiz
      const newQuiz: CourseQuiz = {
        id: `quiz-${Date.now()}`,
        title: `Optional Checkpoint: ${currentLesson.title}`,
        description: 'Test your understanding before moving forward.',
        isOptional: true,
        passingScorePercent: 100,
        questions: [
          {
            id: `q-${Date.now()}`,
            question: 'What is the primary technical objective of this lesson?',
            options: [
              'Singing as loudly as possible with throat pressure',
              'Consistent airflow with effortless phonation',
              'Skipping warmups completely',
              'Singing outside of your safe range',
            ],
            correctAnswerIndex: 1,
            explanation:
              'Always prioritize effortless, sustainable coordination over volume or strain.',
          },
        ],
      }
      nextSections[sectionIdx].lessons[lessonIdx] = {
        ...currentLesson,
        quiz: newQuiz,
      }
    }
    setSections(nextSections)
  }

  const handleAddQuizQuestion = (sectionIdx: number, lessonIdx: number) => {
    const currentSec = sections[sectionIdx]
    const currentLesson = currentSec.lessons[lessonIdx]
    if (!currentLesson.quiz) return

    const newQuestion: QuizQuestion = {
      id: `q-${Date.now()}`,
      question: 'New question topic?',
      options: ['Option A (Correct)', 'Option B', 'Option C', 'Option D'],
      correctAnswerIndex: 0,
      explanation: 'Explanation of why this answer is correct.',
    }

    const nextSections = [...sections]
    nextSections[sectionIdx].lessons[lessonIdx] = {
      ...currentLesson,
      quiz: {
        ...currentLesson.quiz,
        questions: [...currentLesson.quiz.questions, newQuestion],
      },
    }
    setSections(nextSections)
  }

  const handleSaveCourse = () => {
    if (!title.trim()) {
      alert('Please enter a course title')
      return
    }

    const slug =
      initialCourse?.slug ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') ||
      `custom-course-${Date.now()}`

    const newCourse: Course = {
      slug,
      title,
      subtitle: subtitle || 'Custom instructor curriculum',
      description: description || 'Master vocal progress course.',
      level,
      isFree: true,
      isUnlocked: true,
      instructor,
      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      whatYouWillLearn: [
        'Master customized vocal technique exercises',
        'Learn pitch and register connection',
        'Complete optional module checkpoints and quizzes',
      ],
      requirements: ['No prior experience required', 'Quiet practice space and microphone'],
      sections,
      isCustom: true,
    }

    saveCustomCourse(newCourse)
    onCourseCreated(newCourse)
    onClose()
  }

  const currentSection = sections[selectedSectionIdx] || sections[0]

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-2 sm:p-4">
      {/* Dim overlay */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-[9995] w-full max-w-5xl h-[92dvh] sm:h-[90vh] glass-card-luxe rounded-2xl sm:rounded-3xl border-2 border-[#CEB466]/60 shadow-2xl shadow-black/90 flex flex-col overflow-hidden bg-[#171229]/95 animate-slide-up">
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
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

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
                    onChange={(e) => setLevel(e.target.value as any)}
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
                        selectedSectionIdx === idx
                          ? 'bg-[#CEB466]/15 border-[#CEB466]/50 text-white shadow-md shadow-[#CEB466]/10'
                          : 'bg-white/[0.02] border-white/[0.06] text-gray-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{section.title}</p>
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
                    onChange={(e) => {
                      const next = [...sections]
                      next[selectedSectionIdx].title = e.target.value
                      setSections(next)
                    }}
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
                      onClick={() => handleAddLesson(selectedSectionIdx)}
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
                              onChange={(e) => {
                                const next = [...sections]
                                next[selectedSectionIdx].lessons[lIdx].title = e.target.value
                                setSections(next)
                              }}
                              placeholder="Lesson title"
                              className="sm:col-span-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs font-bold focus:border-[#CEB466] focus:outline-none"
                            />
                            <input
                              type="text"
                              value={lesson.duration}
                              onChange={(e) => {
                                const next = [...sections]
                                next[selectedSectionIdx].lessons[lIdx].duration = e.target.value
                                setSections(next)
                              }}
                              placeholder="Duration (e.g. 15 min)"
                              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-xs focus:border-[#CEB466] focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Quiz Toggle Button */}
                            <button
                              onClick={() => handleToggleQuiz(selectedSectionIdx, lIdx)}
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
                                onClick={() => handleRemoveLesson(selectedSectionIdx, lIdx)}
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
                          onChange={(e) => {
                            const next = [...sections]
                            next[selectedSectionIdx].lessons[lIdx].summary = e.target.value
                            setSections(next)
                          }}
                          placeholder="Lesson summary statement..."
                          className="w-full px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-gray-300 text-xs focus:border-[#CEB466] focus:outline-none"
                        />

                        {/* QUIZ BUILDER PANEL (IF QUIZ ENABLED) */}
                        {lesson.quiz && (
                          <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-500/30 space-y-4 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-purple-500/30 text-purple-300 text-[10px] font-bold uppercase">
                                  Optional Quiz
                                </span>
                                <input
                                  type="text"
                                  value={lesson.quiz.title}
                                  onChange={(e) => {
                                    const next = [...sections]
                                    if (next[selectedSectionIdx].lessons[lIdx].quiz) {
                                      next[selectedSectionIdx].lessons[lIdx].quiz!.title = e.target.value
                                    }
                                    setSections(next)
                                  }}
                                  className="text-xs font-bold text-white bg-transparent border-b border-purple-500/40 focus:outline-none focus:border-purple-300"
                                />
                              </div>

                              <button
                                onClick={() => handleAddQuizQuestion(selectedSectionIdx, lIdx)}
                                className="px-2 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-[11px] font-semibold flex items-center gap-1 border border-purple-500/30 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Question</span>
                              </button>
                            </div>

                            {/* Questions List */}
                            <div className="space-y-3">
                              {lesson.quiz.questions.map((q, qIdx) => (
                                <div
                                  key={q.id}
                                  className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 space-y-2.5"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-purple-400 font-bold">
                                      Q{qIdx + 1}:
                                    </span>
                                    <input
                                      type="text"
                                      value={q.question}
                                      onChange={(e) => {
                                        const next = [...sections]
                                        next[selectedSectionIdx].lessons[lIdx].quiz!.questions[
                                          qIdx
                                        ].question = e.target.value
                                        setSections(next)
                                      }}
                                      placeholder="Question prompt..."
                                      className="w-full px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 text-white text-xs focus:border-purple-400 focus:outline-none"
                                    />
                                  </div>

                                  {/* 4 Options with Radio Selector */}
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
                                          onChange={() => {
                                            const next = [...sections]
                                            next[selectedSectionIdx].lessons[lIdx].quiz!.questions[
                                              qIdx
                                            ].correctAnswerIndex = optIdx
                                            setSections(next)
                                          }}
                                          className="text-purple-500 focus:ring-purple-400"
                                          title="Mark as correct answer"
                                        />
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={(e) => {
                                            const next = [...sections]
                                            next[selectedSectionIdx].lessons[lIdx].quiz!.questions[
                                              qIdx
                                            ].options[optIdx] = e.target.value
                                            setSections(next)
                                          }}
                                          className={`w-full bg-transparent text-xs focus:outline-none ${
                                            q.correctAnswerIndex === optIdx
                                              ? 'text-emerald-400 font-semibold'
                                              : 'text-gray-300'
                                          }`}
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  {/* Explanation */}
                                  <input
                                    type="text"
                                    value={q.explanation || ''}
                                    onChange={(e) => {
                                      const next = [...sections]
                                      next[selectedSectionIdx].lessons[lIdx].quiz!.questions[
                                        qIdx
                                      ].explanation = e.target.value
                                      setSections(next)
                                    }}
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
    </div>
  )
}
