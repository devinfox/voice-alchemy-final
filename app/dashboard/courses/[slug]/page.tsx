'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, PlayCircle, RotateCcw } from 'lucide-react'
import { getCourseBySlug, type Course, type CourseLesson } from '@/lib/courses'
import { CourseQuizRunner } from '@/components/course-quiz-runner'

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

  // Course data and saved progress are loaded after mount. Custom courses and
  // saved progress live in localStorage, which the server can't see — reading
  // them during render would make the server and client HTML disagree.
  const [isLoaded, setIsLoaded] = useState(false)
  const [course, setCourse] = useState<Course | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [activeLessonId, setActiveLessonId] = useState<string>('')
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([])

  useEffect(() => {
    const loadedCourse = getCourseBySlug(slug) ?? null
    const validLessonIds = new Set(
      loadedCourse?.sections.flatMap((section) => section.lessons.map((lesson) => lesson.id)) ?? []
    )
    const defaultLessonId = loadedCourse?.sections[0]?.lessons[0]?.id ?? ''

    let savedActiveId = ''
    let savedCompletedIds: string[] = []
    if (loadedCourse) {
      try {
        const saved = localStorage.getItem(getProgressKey(loadedCourse.slug))
        if (saved) {
          const parsed = JSON.parse(saved) as { activeLessonId?: string; completedLessonIds?: string[] }
          savedActiveId = parsed.activeLessonId || ''
          savedCompletedIds = Array.isArray(parsed.completedLessonIds) ? parsed.completedLessonIds : []
        }
      } catch {
        // Corrupt progress data — start fresh.
      }
    }

    // Drop ids that no longer exist (e.g. the teacher deleted a lesson), and
    // fall back to the first lesson when the saved pointer is stale.
    const activeId = validLessonIds.has(savedActiveId) ? savedActiveId : defaultLessonId
    const completedIds = savedCompletedIds.filter((id) => validLessonIds.has(id))

    const activeSectionId =
      loadedCourse?.sections.find((section) => section.lessons.some((lesson) => lesson.id === activeId))?.id ??
      loadedCourse?.sections[0]?.id

    // One-shot post-hydration load from localStorage; server HTML and the
    // client's first render intentionally agree on the loading state first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCourse(loadedCourse)
    setActiveLessonId(activeId)
    setCompletedLessonIds(completedIds)
    setExpandedSections(
      loadedCourse
        ? Object.fromEntries(loadedCourse.sections.map((section) => [section.id, section.id === activeSectionId]))
        : {}
    )
    setIsLoaded(true)
  }, [slug])

  useEffect(() => {
    if (!isLoaded || !course) return
    try {
      localStorage.setItem(
        getProgressKey(course.slug),
        JSON.stringify({ completedLessonIds, activeLessonId })
      )
    } catch (e) {
      console.error('Failed to persist course progress', e)
    }
  }, [isLoaded, course, completedLessonIds, activeLessonId])

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

  if (!isLoaded) {
    return (
      <div className="p-6">
        <div className="glass-card rounded-2xl border-white/[0.08] p-8 text-center">
          <p className="text-slate-400 animate-pulse">Loading course…</p>
        </div>
      </div>
    )
  }

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
  const progressPercent = totalLessons > 0 ? Math.min(100, Math.round((completedCount / totalLessons) * 100)) : 0
  const isActiveLessonComplete = !!activeLesson && completedLessonIds.includes(activeLesson.id)

  const goToLesson = (lessonId: string) => {
    setActiveLessonId(lessonId)
    const sectionId = lessonPointers.find((item) => item.lesson.id === lessonId)?.sectionId
    if (sectionId) {
      setExpandedSections((prev) => (prev[sectionId] ? prev : { ...prev, [sectionId]: true }))
    }
    // On mobile the curriculum sidebar sits below the lesson content; jump
    // back up so the newly selected lesson is visible.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const markComplete = () => {
    if (!activeLesson) return
    setCompletedLessonIds((prev) => (prev.includes(activeLesson.id) ? prev : [...prev, activeLesson.id]))
  }

  const toggleComplete = () => {
    if (!activeLesson) return
    setCompletedLessonIds((prev) =>
      prev.includes(activeLesson.id) ? prev.filter((id) => id !== activeLesson.id) : [...prev, activeLesson.id]
    )
  }

  const goNext = () => {
    if (activeLessonIndex < 0 || activeLessonIndex >= lessonPointers.length - 1) return
    goToLesson(lessonPointers[activeLessonIndex + 1].lesson.id)
  }

  const goPrev = () => {
    if (activeLessonIndex <= 0) return
    goToLesson(lessonPointers[activeLessonIndex - 1].lesson.id)
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
            {activeLesson && activeLesson.body.length > 0 && (
              <div>
                <h3 className="text-white font-semibold">Lesson Breakdown</h3>
                <div className="mt-3 space-y-3">
                  {activeLesson.body.map((paragraph, idx) => (
                    <p key={`${activeLesson.id}-body-${idx}`} className="text-sm text-slate-300 leading-relaxed">{paragraph}</p>
                  ))}
                </div>
              </div>
            )}

            {activeLesson && activeLesson.keyPoints.length > 0 && (
              <div>
                <h3 className="text-white font-semibold">Key Points</h3>
                <ul className="mt-2 space-y-2">
                  {activeLesson.keyPoints.map((point, idx) => (
                    <li key={`${activeLesson.id}-point-${idx}`} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a855f7] shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeLesson && activeLesson.practice.length > 0 && (
              <div>
                <h3 className="text-white font-semibold">Practice Assignment</h3>
                <ul className="mt-2 space-y-2">
                  {activeLesson.practice.map((item, idx) => (
                    <li key={`${activeLesson.id}-practice-${idx}`} className="text-sm text-slate-300 flex items-start gap-2">
                      <PlayCircle className="w-4 h-4 text-[#d8b4fe] mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quiz / Knowledge Check — passing auto-marks the lesson complete */}
            {activeLesson?.quiz && (
              <CourseQuizRunner
                key={activeLesson.id}
                quiz={activeLesson.quiz}
                onComplete={(scorePercent) => {
                  if (scorePercent >= (activeLesson.quiz?.passingScorePercent ?? 70)) {
                    markComplete()
                  }
                }}
              />
            )}
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
              onClick={toggleComplete}
              className={`px-4 py-2 rounded-xl font-semibold shadow-lg transition-all flex items-center gap-2 ${
                isActiveLessonComplete
                  ? 'bg-white/[0.08] text-green-300 border border-green-500/40 hover:bg-white/[0.12]'
                  : 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white shadow-[#a855f7]/20'
              }`}
            >
              {isActiveLessonComplete ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Completed — Undo</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Complete</span>
                </>
              )}
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
                    aria-expanded={isOpen}
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
