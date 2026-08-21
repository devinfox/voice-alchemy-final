'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  GraduationCap,
  Lock,
  PlayCircle,
  Sparkles,
  Search,
  Clock,
  User,
  ChevronRight,
} from 'lucide-react'
import {
  VOCAL_COURSE_CATEGORIES,
  getCourseLessonCount,
  type Course,
  courses as seedCourses,
} from '@/lib/courses'
import { createClient } from '@/lib/supabase'

export default function CoursesPage() {
  const [coursesList, setCoursesList] = useState<Course[]>(seedCourses)
  const [isTeacher, setIsTeacher] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedLevel, setSelectedLevel] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

          if (
            profile?.role === 'teacher' ||
            profile?.role === 'instructor' ||
            profile?.role === 'admin'
          ) {
            setIsTeacher(true)
          }
        }

        const res = await fetch('/api/courses')
        const data = await res.json()
        if (res.ok && data.courses && Array.isArray(data.courses) && data.courses.length > 0) {
          setCoursesList(data.courses)
        }
      } catch (err) {
        console.error('Failed to fetch courses:', err)
      }
    }
    loadData()
  }, [])

  // Filter courses
  const filtered = coursesList.filter((course) => {
    const matchesCategory =
      selectedCategory === 'All' || course.category === selectedCategory
    const matchesLevel = selectedLevel === 'All' || course.level === selectedLevel
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.instructor.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesCategory && matchesLevel && matchesSearch
  })

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <section className="glass-card rounded-2xl border-white/[0.08] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#a855f7]/25">
              <GraduationCap className="w-4.5 h-4.5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Academy Courses</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1.5">
            Master vocal mechanics, Hindustani precision, mix voice, and modern alt-pop delivery.
          </p>
        </div>

        {isTeacher && (
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/courses/studio"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white font-semibold text-sm shadow-lg shadow-[#a855f7]/25 flex items-center gap-2 transition-all hover:scale-[1.02]"
            >
              <Sparkles className="w-4 h-4" />
              Teacher Course Studio
            </Link>
          </div>
        )}
      </section>

      {/* Filter Bar & Search */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vocal courses & drills..."
              className="w-full pl-10 pr-4 py-2 text-sm glass-input rounded-xl text-white placeholder-slate-500"
            />
          </div>

          {/* Level Filter */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto pb-1 sm:pb-0">
            {['All', 'Beginner', 'Intermediate', 'Advanced'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedLevel === lvl
                    ? 'bg-white/[0.15] text-white border border-white/20'
                    : 'text-slate-400 hover:text-white glass-button-subtle'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === 'All'
                ? 'bg-gradient-to-r from-[#a855f7]/30 to-[#7c3aed]/30 text-white border border-[#a855f7]/50 shadow-sm'
                : 'glass-card-subtle text-slate-400 hover:text-white border-white/[0.08]'
            }`}
          >
            All Specializations
          </button>
          {VOCAL_COURSE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-gradient-to-r from-[#a855f7]/30 to-[#7c3aed]/30 text-white border border-[#a855f7]/50 shadow-sm'
                  : 'glass-card-subtle text-slate-400 hover:text-white border-white/[0.08]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Courses Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filtered.map((course) => {
          const lessonCount = getCourseLessonCount(course)

          const content = (
            <article
              className={`rounded-2xl border flex flex-col justify-between h-full transition-all overflow-hidden group ${
                course.isUnlocked
                  ? 'glass-card-subtle border-white/[0.1] hover:border-[#a855f7]/40 hover:bg-white/[0.06] cursor-pointer'
                  : 'border-white/[0.08] bg-white/[0.02] opacity-80 cursor-not-allowed'
              }`}
            >
              {/* Cover Header */}
              <div className="h-32 w-full relative bg-gradient-to-br from-[#a855f7]/20 via-[#7c3aed]/10 to-slate-900 overflow-hidden border-b border-white/[0.06]">
                {course.thumbnailUrl ? (
                  <Image
                    src={course.thumbnailUrl}
                    alt={course.title}
                    fill
                    unoptimized
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <GraduationCap className="w-10 h-10 text-white/20" />
                  </div>
                )}

                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border backdrop-blur-md ${
                      course.isUnlocked
                        ? 'bg-green-500/20 text-green-300 border-green-500/30'
                        : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
                    }`}
                  >
                    {course.isUnlocked ? 'Unlocked' : 'Coming Soon'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/40 text-slate-300 border border-white/10 backdrop-blur-md">
                    {course.level}
                  </span>
                </div>

                {!course.isUnlocked && (
                  <div className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-slate-400 backdrop-blur-md">
                    <Lock className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] font-semibold text-[#d8b4fe] uppercase tracking-wider">
                    {course.category || 'Vocal Technique'}
                  </span>
                  <h2 className="text-lg font-bold text-white mt-0.5 group-hover:text-[#e9d5ff] transition-colors">
                    {course.title}
                  </h2>
                  <p className="text-[#d8b4fe] text-xs font-medium mt-0.5">{course.subtitle}</p>
                  <p className="text-slate-300 mt-2 text-[13px] leading-relaxed line-clamp-2">
                    {course.description}
                  </p>
                </div>

                {/* Metadata details */}
                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <User className="w-3.5 h-3.5 text-[#d8b4fe]" />
                    <span className="truncate max-w-[120px]">{course.instructor}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{lessonCount > 0 ? `${lessonCount} lessons` : 'Coming soon'}</span>
                  </div>
                </div>
              </div>

              {/* Card Footer CTA */}
              {course.isUnlocked && (
                <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[13px] font-semibold text-[#e9d5ff] group-hover:text-white transition-colors">
                  <span className="inline-flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-[#d8b4fe]" />
                    Open Class
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </article>
          )

          if (course.isUnlocked) {
            return (
              <Link key={course.id || course.slug} href={`/dashboard/courses/${course.slug}`} className="block h-full">
                {content}
              </Link>
            )
          }

          return (
            <div key={course.id || course.slug} aria-disabled className="block h-full">
              {content}
            </div>
          )
        })}
      </section>
    </div>
  )
}
