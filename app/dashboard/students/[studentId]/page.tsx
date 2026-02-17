'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock, Settings } from 'lucide-react'
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
    lesson_day_of_week: number | null
    lesson_time: string | null
    lesson_duration_minutes: number | null
    lesson_timezone: string | null
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

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatRecurringSchedule(dayOfWeek: number | null, time: string | null): string {
  if (dayOfWeek === null || !time) return 'Not scheduled'
  const dayName = DAYS_OF_WEEK[dayOfWeek]
  // Format time from HH:MM:SS to readable format
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `Every ${dayName} at ${hour12}:${minutes} ${ampm}`
}

export default function StudentLessonPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId: bookingId } = use(params)
  const [lessonData, setLessonData] = useState<LessonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    dayOfWeek: null as number | null,
    time: '',
    duration: 60,
  })

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

      // Pre-fill schedule form if schedule exists
      if (data.relationship.lesson_day_of_week !== null || data.relationship.lesson_time) {
        setScheduleForm({
          dayOfWeek: data.relationship.lesson_day_of_week,
          time: data.relationship.lesson_time ? data.relationship.lesson_time.slice(0, 5) : '',
          duration: data.relationship.lesson_duration_minutes || 60,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSchedule = async () => {
    if (!lessonData) return

    try {
      const response = await fetch(`/api/teachers/${bookingId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonDayOfWeek: scheduleForm.dayOfWeek,
          lessonTime: scheduleForm.time || null,
          durationMinutes: scheduleForm.duration,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update schedule')
      }

      setShowScheduleModal(false)
      fetchLessonData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule')
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
          href="/dashboard/students"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to students
        </Link>
        <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
          {error || 'Failed to load lesson data'}
        </div>
      </div>
    )
  }

  const { relationship } = lessonData
  const student = relationship.student

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/students" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
              {getUserInitials(student)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{getUserDisplayName(student)}</h1>
              {student.name && (student.first_name || student.last_name) && (
                <p className="text-gray-400">
                  {student.first_name} {student.last_name}
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowScheduleModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Schedule</span>
        </button>
      </div>

      {/* Schedule Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recurring Schedule Card */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-gray-400 mb-3">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">Weekly Schedule</span>
          </div>
          {relationship.lesson_day_of_week !== null && relationship.lesson_time ? (
            <p className="text-xl font-semibold text-white">
              {formatRecurringSchedule(relationship.lesson_day_of_week, relationship.lesson_time)}
            </p>
          ) : (
            <p className="text-amber-400">No schedule set</p>
          )}
        </div>

        {/* Duration Card */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-gray-400 mb-3">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Lesson Duration</span>
          </div>
          <p className="text-xl font-semibold text-white">{relationship.lesson_duration_minutes || 60} minutes</p>
        </div>
      </div>

      {/* Session View - Video + Notes + Archive */}
      <SessionView studentId={student.id} bookingId={bookingId} isAdmin={true} currentUser={lessonData.currentUser} />

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Set Weekly Lesson Schedule</h3>
            <p className="text-gray-400 text-sm mb-4">Set a recurring weekly lesson time</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Day of Week</label>
                <select
                  value={scheduleForm.dayOfWeek ?? ''}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a day...</option>
                  {DAYS_OF_WEEK.map((day, index) => (
                    <option key={index} value={index}>{day}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Time</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Duration</label>
                <select
                  value={scheduleForm.duration}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, duration: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                  <option value={120}>120 minutes</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSchedule}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
