'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, PlayCircle } from 'lucide-react'
import { getCourseBySlug, type CourseLesson } from '@/lib/courses'

interface LessonPointer {
  sectionId: string
  sectionTitle: string
  lesson: CourseLesson
  index: number
}

function getProgressKey(slug: string) {
  return `course-progress:${slug}`
}

export default function CoursePlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const course = getCourseBySlug(slug)

  const lessonPointers = useMemo<LessonPointer[]>(
    () =>
      course
        ? course.sections.flatMap((section) =>
            section.lessons.map((lesson, idx) => ({
              sectionId: section.id,
              sectionTitle: section.title,
              lesson,
              index: idx,
            }))
          )
        : [],
    [course]
  )

  const defaultExpanded = useMemo<Record<string, boolean>>(
    () =>
      course
        ? Object.fromEntries(course.sections.map((section, idx) => [section.id, idx === 0]))
        : {},
    [course]
  )
  const defaultLessonId = course?.sections[0]?.lessons[0]?.id ?? ''

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(defaultExpanded)
  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    if (!course || typeof window === 'undefined') return defaultLessonId
    try {
      const saved = localStorage.getItem(getProgressKey(course.slug))
      if (!saved) return defaultLessonId
      const parsed = JSON.parse(saved) as { activeLessonId?: string }
      return parsed.activeLessonId || defaultLessonId
    } catch {
      return defaultLessonId
    }
  })
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>(() => {
    if (!course || typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(getProgressKey(course.slug))
      if (!saved) return []
      const parsed = JSON.parse(saved) as { completedLessonIds?: string[] }
      return parsed.completedLessonIds || []
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (!course) return
    localStorage.setItem(
      getProgressKey(course.slug),
      JSON.stringify({ completedLessonIds, activeLessonId })
    )
  }, [course, completedLessonIds, activeLessonId])

  if (!course || !course.isUnlocked) {
    return (
      <div className="p-6">
        <div className="glass-card rounded-2xl border-white/[0.08] p-8 text-center">
          <p className="text-slate-300">This course is not available yet.</p>
          <Link href="/dashboard/courses" className="inline-flex items-center gap-2 mt-4 text-[#d8b4fe] hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Back to Courses
          </Link>
        </div>
      </div>
    )
  }

  const activePointer = lessonPointers.find((item) => item.lesson.id === activeLessonId) || lessonPointers[0]
  const activeLesson = activePointer?.lesson
  const activeLessonIndex = lessonPointers.findIndex((item) => item.lesson.id === activeLesson?.id)
  const totalLessons = lessonPointers.length
  const completedCount = completedLessonIds.length
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  const goToLesson = (lessonId: string) => setActiveLessonId(lessonId)

  const markComplete = () => {
    if (!activeLesson) return
    setCompletedLessonIds((prev) => (prev.includes(activeLesson.id) ? prev : [...prev, activeLesson.id]))
  }

  const goNext = () => {
    if (activeLessonIndex < 0 || activeLessonIndex >= lessonPointers.length - 1) return
    setActiveLessonId(lessonPointers[activeLessonIndex + 1].lesson.id)
  }

  const goPrev = () => {
    if (activeLessonIndex <= 0) return
    setActiveLessonId(lessonPointers[activeLessonIndex - 1].lesson.id)
  }

  return (
    <div className="p-6 space-y-6">
      <section className="glass-card rounded-2xl border-white/[0.08] p-5">
        <Link href="/dashboard/courses" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to Courses
        </Link>
        <h1 className="text-3xl font-bold text-white mt-3">{course.title}</h1>
        <p className="text-[#d8b4fe] mt-1">{course.subtitle}</p>
        <p className="text-slate-300 mt-3 max-w-5xl">{course.description}</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500">Instructor</p>
            <p className="text-white">{course.instructor}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500">Level</p>
            <p className="text-white">{course.level}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500">Lessons</p>
            <p className="text-white">{totalLessons}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500">Progress</p>
            <p className="text-white">{progressPercent}%</p>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#a855f7] to-[#7c3aed]" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <div className="space-y-4">
          <div className="glass-card rounded-2xl border-white/[0.08] p-5">
            <h2 className="text-xl font-semibold text-white">{activeLesson?.title}</h2>
            <p className="text-slate-400 text-sm mt-1">Lesson {activeLessonIndex + 1} of {totalLessons}</p>
            <p className="text-slate-400 text-sm mt-1">{activePointer?.sectionTitle} • {activeLesson?.duration}</p>
            <p className="text-slate-300 mt-4">{activeLesson?.summary}</p>
          </div>

          <div className="glass-card-subtle rounded-2xl border-white/[0.08] p-5 space-y-5">
            <div>
              <h3 className="text-white font-semibold">Lesson Breakdown</h3>
              <div className="mt-3 space-y-3">
                {activeLesson?.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm text-slate-300 leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-white font-semibold">Key Points</h3>
              <ul className="mt-2 space-y-2">
                {activeLesson?.keyPoints.map((point) => (
                  <li key={point} className="text-sm text-slate-300 flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a855f7] shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold">Practice Assignment</h3>
              <ul className="mt-2 space-y-2">
                {activeLesson?.practice.map((item) => (
                  <li key={item} className="text-sm text-slate-300 flex items-start gap-2">
                    <PlayCircle className="w-4 h-4 text-[#d8b4fe] mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={goPrev}
              disabled={activeLessonIndex <= 0}
              className="px-4 py-2 rounded-xl glass-button disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous Lesson
            </button>
            <button
              onClick={markComplete}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white font-semibold shadow-lg shadow-[#a855f7]/20"
            >
              Mark as Complete
            </button>
            <button
              onClick={goNext}
              disabled={activeLessonIndex >= lessonPointers.length - 1}
              className="px-4 py-2 rounded-xl glass-button disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next Lesson
            </button>
          </div>
        </div>

        <aside className="glass-card-subtle rounded-2xl border-white/[0.08] p-4 h-fit xl:sticky xl:top-6">
          <h3 className="text-white font-semibold">Course Curriculum</h3>
          <p className="text-xs text-slate-400 mt-1">{totalLessons} lessons • {completedCount} completed</p>

          <div className="mt-4 space-y-2">
            {course.sections.map((section) => {
              const isOpen = expandedSections[section.id] ?? false
              const completedInSection = section.lessons.filter((lesson) => completedLessonIds.includes(lesson.id)).length

              return (
                <div key={section.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                  <button
                    onClick={() => setExpandedSections((prev) => ({ ...prev, [section.id]: !isOpen }))}
                    className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{section.title}</p>
                      <p className="text-xs text-slate-500">
                        {completedInSection}/{section.lessons.length} completed
                      </p>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-white/[0.08]">
                      {section.lessons.map((lesson) => {
                        const isActive = activeLessonId === lesson.id
                        const isComplete = completedLessonIds.includes(lesson.id)

                        return (
                          <button
                            key={lesson.id}
                            onClick={() => goToLesson(lesson.id)}
                            className={`w-full px-3 py-2.5 text-left border-b last:border-b-0 border-white/[0.06] transition-colors ${
                              isActive ? 'bg-[#a855f7]/12' : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {isComplete ? (
                                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                              ) : (
                                <Circle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className={`text-sm ${isActive ? 'text-[#e9d5ff]' : 'text-slate-200'}`}>{lesson.title}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Clock3 className="w-3 h-3" />
                                  {lesson.duration}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>
      </section>
    </div>
  )
}
