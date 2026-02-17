'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
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
      // Fetch the lesson data directly using booking ID
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (error || !lessonData) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/my-lessons"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to my lessons
        </Link>
        <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
          {error || 'Failed to load lesson data'}
        </div>
      </div>
    )
  }

  const { relationship } = lessonData
  const teacher = relationship.instructor
  const student = relationship.student

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/my-lessons" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl">
            {getUserInitials(teacher)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Lessons with {getUserDisplayName(teacher)}</h1>
            {teacher.name && (teacher.first_name || teacher.last_name) && (
              <p className="text-gray-400">
                {teacher.first_name} {teacher.last_name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Lesson Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Relationship Started Card */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-gray-400 mb-3">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">Started</span>
          </div>
          <p className="text-xl font-semibold text-white">{formatDate(relationship.created_at)}</p>
        </div>

        {/* Status Card */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-gray-400 mb-3">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Status</span>
          </div>
          <p className="text-xl font-semibold text-green-400 capitalize">{relationship.status}</p>
        </div>
      </div>

      {/* Session View - Video + Notes + Archive */}
      {/* For students, isAdmin=false so they can't start/end class, only view */}
      <SessionView studentId={student.id} bookingId={bookingId} isAdmin={lessonData.isTeacher} currentUser={lessonData.currentUser} />
    </div>
  )
}
