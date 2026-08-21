'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Video,
  Sparkles,
  Award,
  CheckCircle2,
  Activity,
  Mic,
} from 'lucide-react'
import SessionView from '@/components/SessionView'

interface User {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  avatar_url: string | null
}

interface LessonData {
  relationship: {
    id: string
    status: string
    created_at: string
    updated_at: string
    instructor: User
    student: User
  }
  currentNotes: {
    id: string
    content: string
    content_html: string
    week_start: string
    class_active: boolean
    is_locked: boolean
    class_started_at: string | null
    class_ended_at: string | null
  } | null
  currentWeek: {
    start: string
    end: string
  }
  archivedNotesCount: number
  isTeacher: boolean
  currentUser?: {
    id: string
    name: string
  }
}

function getUserDisplayName(user: User): string {
  if (user.name) return user.name
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim()
  }
  return 'User'
}

function getUserInitials(user: User): string {
  const name = getUserDisplayName(user)
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function StudentLessonPage({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId: bookingId } = use(params)
  const [lessonData, setLessonData] = useState<LessonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLessonData()
  }, [bookingId])

  const fetchLessonData = async () => {
    try {
      const lessonRes = await fetch(`/api/lessons/${bookingId}`)
      const data = await lessonRes.json()

      if (!lessonRes.ok) {
        throw new Error(data.error || 'Failed to fetch lesson data')
      }

      setLessonData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#CEB466]"></div>
      </div>
    )
  }

  if (error || !lessonData) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Link
          href="/dashboard/my-lessons"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Lessons</span>
        </Link>
        <div className="glass-card p-6 rounded-2xl border border-red-500/30 text-red-300 text-sm">
          {error || 'Failed to load lesson data'}
        </div>
      </div>
    )
  }

  const { relationship } = lessonData
  const teacher = relationship.instructor
  const student = relationship.student
  const teacherDisplayName = getUserDisplayName(teacher)

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="glass-card-luxe p-6 sm:p-8 rounded-3xl border border-[#CEB466]/40 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4 relative z-10">
          <Link
            href="/dashboard/my-lessons"
            className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-xl shadow-lg shadow-[#CEB466]/20">
              {getUserInitials(teacher)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white font-luxury">
                  Coaching with {teacherDisplayName}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  Active
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Live Video Room & Real-time Collaborative Notes</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="glass-card-subtle px-4 py-2 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] uppercase text-gray-400 font-bold">Studio Status</span>
            <p className="text-xs font-bold text-emerald-400 mt-0.5">Ready for Class</p>
          </div>
        </div>
      </div>

      {/* Lesson Details Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card-subtle p-5 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center gap-2 text-gray-400">
            <Calendar className="w-4 h-4 text-[#CEB466]" />
            <span className="text-xs font-semibold uppercase tracking-wider">Coaching Journey Began</span>
          </div>
          <p className="text-lg font-bold text-white pt-1">{formatDate(relationship.created_at)}</p>
        </div>

        <div className="glass-card-subtle p-5 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center gap-2 text-gray-400">
            <Clock className="w-4 h-4 text-[#CEB466]" />
            <span className="text-xs font-semibold uppercase tracking-wider">Lesson Format</span>
          </div>
          <p className="text-lg font-bold text-white pt-1">Live 1-on-1 Studio Video & Audio Review</p>
        </div>
      </div>

      {/* Session View - Video + Notes */}
      <SessionView
        studentId={student.id}
        bookingId={bookingId}
        isAdmin={lessonData.isTeacher}
        currentUser={lessonData.currentUser}
      />
    </div>
  )
}
