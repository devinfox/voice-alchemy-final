'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  GraduationCap,
  Plus,
  Edit,
  Trash2,
  Eye,
  BookOpen,
  ArrowLeft,
  Search,
  Clock,
  Lightbulb,
} from 'lucide-react'
import { CourseBuilder } from '@/components/courses/CourseBuilder'
import { type Course, getCourseLessonCount } from '@/lib/courses'

export default function TeacherStudioPage() {
  const [activeTab, setActiveTab] = useState<'my_courses' | 'builder'>('my_courses')
  const [courses, setCourses] = useState<Course[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')

  const fetchMyCourses = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/courses?mine=true')
      const data = await res.json()
      if (res.ok && data.courses) {
        setCourses(data.courses)
      }
    } catch (err) {
      console.error('Failed to fetch teacher courses:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMyCourses()
  }, [])

  const handleDeleteCourse = async (courseId?: string) => {
    if (!courseId) return
    if (!confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      return
    }

    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setCourses((prev) => prev.filter((c) => c.id !== courseId))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete course')
      }
    } catch (err) {
      console.error('Delete course error:', err)
      alert('Failed to delete course')
    }
  }

  const handleStartNewCourse = () => {
    setEditingCourse(null)
    setActiveTab('builder')
  }

  const handleEditCourse = (course: Course) => {
    setEditingCourse(course)
    setActiveTab('builder')
  }

  const handleSaveComplete = (savedCourse: Course) => {
    setCourses((prev) => {
      const idx = prev.findIndex((c) => c.id === savedCourse.id || c.slug === savedCourse.slug)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = savedCourse
        return updated
      }
      return [savedCourse, ...prev]
    })
    setEditingCourse(savedCourse)
  }

  // Filtered courses
  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.category.toLowerCase().includes(searchQuery.toLowerCase())

    if (statusFilter === 'published') return matchesSearch && course.isPublished
    if (statusFilter === 'draft') return matchesSearch && !course.isPublished
    return matchesSearch
  })

  const publishedCount = courses.filter((c) => c.isPublished).length
  const draftCount = courses.filter((c) => !c.isPublished).length
  const totalLessonsCount = courses.reduce((acc, c) => acc + getCourseLessonCount(c), 0)

  return (
    <div className="p-6 space-y-6">
      {/* Studio Header */}
      <section className="glass-card rounded-2xl border-white/[0.08] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/courses"
              className="p-2 rounded-xl glass-button text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#a855f7]/25">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">Teacher Course Studio</h1>
          </div>
          <p className="text-slate-400 mt-2">
            Create, manage, and publish video courses, vocal drills, and interactive practice systems.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setActiveTab('my_courses')
              setEditingCourse(null)
            }}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'my_courses'
                ? 'bg-white/[0.1] text-white border border-white/[0.15]'
                : 'glass-button text-slate-400'
            }`}
          >
            My Authored Courses ({courses.length})
          </button>
          <button
            onClick={handleStartNewCourse}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg ${
              activeTab === 'builder' && !editingCourse
                ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-[#a855f7]/25'
                : 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white shadow-[#a855f7]/20'
            }`}
          >
            <Plus className="w-4 h-4" />
            Create New Course
          </button>
        </div>
      </section>

      {/* Main View Mode */}
      {activeTab === 'builder' ? (
        <CourseBuilder
          initialCourse={editingCourse || undefined}
          onSaveComplete={handleSaveComplete}
          onCancel={() => {
            setActiveTab('my_courses')
            setEditingCourse(null)
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl border-white/[0.08] p-5">
              <p className="text-xs text-slate-400">Total Authored Courses</p>
              <p className="text-2xl font-bold text-white mt-1">{courses.length}</p>
            </div>
            <div className="glass-card rounded-2xl border-white/[0.08] p-5">
              <p className="text-xs text-slate-400">Published & Live</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{publishedCount}</p>
            </div>
            <div className="glass-card rounded-2xl border-white/[0.08] p-5">
              <p className="text-xs text-slate-400">Drafts in Progress</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{draftCount}</p>
            </div>
            <div className="glass-card rounded-2xl border-white/[0.08] p-5">
              <p className="text-xs text-slate-400">Total Vocal Lessons</p>
              <p className="text-2xl font-bold text-[#d8b4fe] mt-1">{totalLessonsCount}</p>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your courses..."
                className="w-full pl-10 pr-4 py-2 text-sm glass-input rounded-xl text-white placeholder-slate-500"
              />
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  statusFilter === 'all'
                    ? 'bg-white/[0.15] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({courses.length})
              </button>
              <button
                onClick={() => setStatusFilter('published')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  statusFilter === 'published'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Published ({publishedCount})
              </button>
              <button
                onClick={() => setStatusFilter('draft')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  statusFilter === 'draft'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Drafts ({draftCount})
              </button>
            </div>
          </div>

          {/* Courses Grid */}
          {isLoading ? (
            <div className="glass-card p-12 rounded-2xl text-center space-y-3">
              <div className="w-8 h-8 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400">Loading your course portfolio...</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="glass-card p-12 rounded-2xl text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto text-slate-400">
                <BookOpen className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">No courses found</h3>
                <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
                  {searchQuery
                    ? 'No courses matched your search query.'
                    : 'You have not created any courses yet. Launch your first vocal masterclass!'}
                </p>
              </div>
              <button
                onClick={handleStartNewCourse}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white text-sm font-semibold shadow-lg shadow-[#a855f7]/25 inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Create First Course
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredCourses.map((course) => {
                const lessonCount = getCourseLessonCount(course)

                return (
                  <article
                    key={course.id || course.slug}
                    className="glass-card-subtle rounded-2xl border-white/[0.08] hover:border-[#a855f7]/40 transition-all flex flex-col justify-between overflow-hidden group"
                  >
                    {/* Cover Thumbnail / Gradient */}
                    <div className="h-36 w-full relative bg-gradient-to-br from-[#a855f7]/20 via-[#7c3aed]/10 to-slate-900 overflow-hidden border-b border-white/[0.06]">
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

                      {/* Status badge */}
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border backdrop-blur-md ${
                            course.isPublished
                              ? 'bg-green-500/20 text-green-300 border-green-500/40'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          {course.isPublished ? 'Live' : 'Draft'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/40 text-slate-300 border border-white/10 backdrop-blur-md">
                          {course.level}
                        </span>
                      </div>

                      {/* Duration */}
                      {course.estimatedDuration && (
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 text-slate-300 backdrop-blur-md flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {course.estimatedDuration}
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div>
                        <span className="text-[11px] font-semibold text-[#d8b4fe] uppercase tracking-wider">
                          {course.category}
                        </span>
                        <h3 className="text-lg font-bold text-white mt-1 line-clamp-1">
                          {course.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          {course.description || course.subtitle || 'No description provided.'}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
                        <span>{course.sections?.length || 0} Modules</span>
                        <span>{lessonCount} Lessons</span>
                        <span className="text-slate-300 font-medium">
                          {course.isFree ? 'Free' : `$${course.price || 0}`}
                        </span>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="px-5 py-3 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <Link
                        href={`/dashboard/courses/${course.slug}`}
                        className="px-3 py-1.5 rounded-lg glass-button text-xs flex items-center gap-1 text-slate-300 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </Link>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditCourse(course)}
                          className="px-3 py-1.5 rounded-lg bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#d8b4fe] hover:text-white text-xs font-semibold flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" /> Edit
                        </button>
                        {course.id && !course.id.startsWith('seed-') && (
                          <button
                            onClick={() => handleDeleteCourse(course.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {/* Vocal Coach Masterclass Tips Card */}
          <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
                <Lightbulb className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Industry Standard Vocal Course Structure
                </h3>
                <p className="text-xs text-slate-400">
                  Best practices for high-engagement vocal coaching courses
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
              <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1.5">
                <p className="font-semibold text-white">1. Pair Video with Audio Drills</p>
                <p className="text-slate-400 leading-relaxed">
                  Always provide an audio backing track or drone with target keys so singers can sing along on repeat without staring at a screen.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1.5">
                <p className="font-semibold text-white">2. Actionable Singer Homework</p>
                <p className="text-slate-400 leading-relaxed">
                  Include concrete practice steps (e.g. 5 reps of SOVT straw sirens, 30s rest) that singers can check off in real time.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1.5">
                <p className="font-semibold text-white">3. Downloadable Sheet Music / PDFs</p>
                <p className="text-slate-400 leading-relaxed">
                  Attach warm-up checklists, vocal scale charts, and lyrics so students can print or reference during offline training.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
