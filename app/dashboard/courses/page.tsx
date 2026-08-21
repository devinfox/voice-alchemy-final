'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  GraduationCap,
  Lock,
  PlayCircle,
  Sparkles,
  CheckCircle2,
  Clock,
  Award,
  Zap,
  ChevronRight,
  Plus,
  Edit3,
  Trash2,
  HelpCircle,
  BookOpen,
} from 'lucide-react'
import { courses as defaultCourses, getCourseLessonCount, Course, getAllCourses, deleteCustomCourse } from '@/lib/courses'
import { CourseBuilderModal } from '@/components/course-builder-modal'
import { SpotlightTour, SpotlightTriggerButton, SpotlightStep } from '@/components/spotlight-tour'
import { createClient } from '@/lib/supabase'

interface CourseOutcomeMeta {
  slug: string
  outcomePromise: string
  practiceMinutesNeeded: number
  progressPercent: number
  checkpointCount: number
  isTeacherRecommended?: boolean
  transformationStory?: string
}

const COURSE_META: Record<string, CourseOutcomeMeta> = {
  'beginner-vocal-foundations': {
    slug: 'beginner-vocal-foundations',
    outcomePromise: 'Build effortless vocal coordination, eliminate throat squeeze, and center pitch with Hindustani drone discipline.',
    practiceMinutesNeeded: 120,
    progressPercent: 45,
    checkpointCount: 3,
    isTeacherRecommended: true,
    transformationStory: '“In 2 weeks, my voice stopped getting tired after high notes. The SOVT exercises changed everything.” — Elena R.',
  },
  'mix-voice-and-register-control': {
    slug: 'mix-voice-and-register-control',
    outcomePromise: 'Bridge chest and head registers seamlessly across your passaggio. Eliminate voice cracks and sing with acoustic bite above C4.',
    practiceMinutesNeeded: 180,
    progressPercent: 0,
    checkpointCount: 4,
    isTeacherRecommended: true,
    transformationStory: '“Gained 4 semitones of usable, belting head-mix range without pushing volume.” — Marcus V.',
  },
  'alt-pop-performance-and-mic-technique': {
    slug: 'alt-pop-performance-and-mic-technique',
    outcomePromise: 'Master contemporary intimacy, vocal fry onsets, breath control, and studio microphone dynamics.',
    practiceMinutesNeeded: 150,
    progressPercent: 0,
    checkpointCount: 4,
    transformationStory: '“Learned how to sing with delicate emotion while maintaining sustainable cord closure.” — Sarah J.',
  },
}

const teacherCourseTourSteps: SpotlightStep[] = [
  {
    target: '[data-tour="course-builder-btn"]',
    title: '1. Custom Course & Quiz Builder',
    content: 'Create fully customized vocal courses for your students. Add modules, lessons, and optional interactive quizzes with multiple-choice questions and instant explanations.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="course-list-grid"]',
    title: '2. Vocal Curriculum & Progress Paths',
    content: 'View built-in academy courses and your custom published courses. Students can step through lessons, take optional quizzes, and track completion.',
    placement: 'top',
  },
]

export default function CoursesPage() {
  const [courseList, setCourseList] = useState<Course[]>(defaultCourses)
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [filter, setFilter] = useState<'all' | 'custom'>('all')
  const [isTeacher, setIsTeacher] = useState(false)

  const refreshCourses = () => {
    setCourseList(getAllCourses())
  }

  useEffect(() => {
    refreshCourses()

    // Check user role
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        const role = profile?.role
        const teacherRole = role === 'teacher' || role === 'instructor' || role === 'admin'
        setIsTeacher(teacherRole)
      }
    })
  }, [])

  const handleCourseCreated = () => {
    refreshCourses()
  }

  const handleDeleteCourse = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this custom course?')) {
      deleteCustomCourse(slug)
      refreshCourses()
    }
  }

  const handleEditCourse = (course: Course, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingCourse(course)
    setIsBuilderOpen(true)
  }

  const displayedCourses =
    filter === 'custom' ? courseList.filter((c) => c.isCustom) : courseList

  const totalLessons = courseList.reduce((sum, c) => sum + getCourseLessonCount(c), 0)

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-7xl mx-auto">
      {/* On-page spotlight tour (Teacher Only) */}
      {isTeacher && <SpotlightTour tourKey="teacher_course_builder_v4" steps={teacherCourseTourSteps} />}

      {/* Header */}
      <section className="glass-card-luxe rounded-2xl sm:rounded-3xl border border-[#CEB466]/40 p-4 sm:p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Voice Alchemy Master Curriculum</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">
              {isTeacher ? 'Vocal Progress Paths & Course Studio' : 'Vocal Progress Paths'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1 max-w-2xl leading-relaxed">
              {isTeacher
                ? 'Outcome-based vocal transformation paths. Build custom courses, add optional module quizzes, and guide students through step-by-step masterclasses.'
                : 'Outcome-based vocal transformation paths. Complete guided lessons, record checkpoint takes, and take optional quizzes to level up your vocal technique.'}
            </p>
          </div>

          {/* Teacher Action Controls */}
          {isTeacher && (
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
              <SpotlightTriggerButton tourKey="teacher_course_builder_v4" label="How to" />

              <button
                data-tour="course-builder-btn"
                onClick={() => {
                  setEditingCourse(null)
                  setIsBuilderOpen(true)
                }}
                className="w-full sm:w-auto py-2.5 sm:py-3 px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] font-bold text-xs sm:text-sm shadow-xl shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Course & Quizzes</span>
              </button>
            </div>
          )}
        </div>

        {/* Filter bar */}
        <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {isTeacher ? (
              <>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    filter === 'all'
                      ? 'bg-[#CEB466] text-[#171229] shadow-md shadow-[#CEB466]/20'
                      : 'bg-white/[0.05] text-gray-300 hover:bg-white/10'
                  }`}
                >
                  All Courses ({courseList.length})
                </button>
                <button
                  onClick={() => setFilter('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    filter === 'custom'
                      ? 'bg-[#CEB466] text-[#171229] shadow-md shadow-[#CEB466]/20'
                      : 'bg-white/[0.05] text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Teacher Created ({courseList.filter((c) => c.isCustom).length})</span>
                </button>
              </>
            ) : (
              <span className="text-xs font-semibold text-gray-300">
                {displayedCourses.length} Masterclasses Available
              </span>
            )}
          </div>

          <span className="text-xs text-gray-400 font-mono hidden sm:inline">
            {totalLessons} Total Lessons
          </span>
        </div>
      </section>

      {/* Courses Grid */}
      <section data-tour="course-list-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedCourses.map((course) => {
          const lessonCount = getCourseLessonCount(course)
          const meta = COURSE_META[course.slug] || {
            slug: course.slug,
            outcomePromise: course.description,
            practiceMinutesNeeded: 120,
            progressPercent: 0,
            checkpointCount: course.sections.length,
          }

          const isUnlocked = course.isUnlocked
          const quizCount = course.sections.reduce(
            (sum, s) => sum + (s.quiz ? 1 : 0) + s.lessons.filter((l) => l.quiz).length,
            0
          )

          return (
            <div
              key={course.slug}
              className={`glass-card-subtle rounded-3xl border p-6 flex flex-col justify-between transition-all duration-300 ${
                isUnlocked
                  ? 'border-white/[0.1] hover:border-[#CEB466]/50 hover:bg-white/[0.06] shadow-xl'
                  : 'border-white/[0.06] bg-white/[0.02] opacity-85 hover:opacity-100 hover:border-purple-500/40'
              }`}
            >
              <div className="space-y-4">
                {/* Badges & Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        course.isCustom
                          ? 'bg-[#CEB466]/20 text-[#CEB466] border-[#CEB466]/40'
                          : isUnlocked
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-white/10 text-gray-300 border-white/15'
                      }`}
                    >
                      {course.isCustom ? 'Teacher Created' : isUnlocked ? 'Unlocked & Active' : 'Roadmap Milestone'}
                    </span>

                    {quizCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" />
                        <span>{quizCount} {quizCount === 1 ? 'Quiz' : 'Quizzes'}</span>
                      </span>
                    )}
                  </div>

                  {isTeacher && course.isCustom ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleEditCourse(course, e)}
                        className="p-1.5 text-gray-400 hover:text-[#CEB466] transition-colors rounded-lg hover:bg-white/5"
                        title="Edit course"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCourse(course.slug, e)}
                        className="p-1.5 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
                        title="Delete course"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    !isUnlocked && <Lock className="w-4 h-4 text-purple-400" />
                  )}
                </div>

                {/* Course Title & Level */}
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span className="font-semibold text-[#CEB466] uppercase tracking-wider">{course.level} Level</span>
                    <span>{lessonCount} Lessons</span>
                  </div>
                  <h3 className="text-xl font-bold text-white font-luxury">{course.title}</h3>
                </div>

                {/* Outcome Promise */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#CEB466]">
                    Outcome Promise
                  </span>
                  <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">
                    {meta.outcomePromise}
                  </p>
                </div>

                {/* Key Metrics Strip */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#CEB466]" />
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Total Time</p>
                      <p className="font-bold text-white">{meta.practiceMinutesNeeded} min</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-400" />
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Modules</p>
                      <p className="font-bold text-white">{course.sections.length} Units</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-5 mt-4 border-t border-white/[0.08]">
                {isUnlocked ? (
                  <Link
                    href={`/dashboard/courses/${course.slug}`}
                    className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#CEB466]/20 transition-all hover:scale-[1.01]"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Launch Masterclass</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <div className="w-full py-3 px-4 rounded-2xl bg-white/[0.04] text-gray-400 text-xs font-semibold flex items-center justify-center gap-2 border border-white/10 cursor-not-allowed">
                    <Lock className="w-4 h-4" />
                    <span>Unlocked with Membership</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* Course Builder Modal (Teacher Only) */}
      {isTeacher && isBuilderOpen && (
        <CourseBuilderModal
          isOpen={isBuilderOpen}
          initialCourse={editingCourse}
          onClose={() => setIsBuilderOpen(false)}
          onCourseCreated={handleCourseCreated}
        />
      )}
    </div>
  )
}
