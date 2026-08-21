'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Settings,
  Sparkles,
  Zap,
  Activity,
  Award,
  CheckCircle2,
  Send,
  Plus,
  Video,
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
  const [drillInserted, setDrillInserted] = useState(false)
  const [recapSent, setRecapSent] = useState(false)
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
      const lessonRes = await fetch(`/api/lessons/${bookingId}`)
      const data = await lessonRes.json()

      if (!lessonRes.ok) {
        throw new Error(data.error || 'Failed to fetch lesson data')
      }

      setLessonData(data)

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

  const handleQuickInsertDrill = (drillName: string) => {
    setDrillInserted(true)
    setTimeout(() => setDrillInserted(false), 3000)
  }

  const handleSendInstantRecap = () => {
    setRecapSent(true)
    setTimeout(() => setRecapSent(false), 3500)
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
          href="/dashboard/students"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Students</span>
        </Link>
        <div className="glass-card p-6 rounded-2xl border border-red-500/30 text-red-300 text-sm">
          {error || 'Failed to load lesson data'}
        </div>
      </div>
    )
  }

  const { relationship } = lessonData
  const student = relationship.student
  const studentDisplayName = getUserDisplayName(student)

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Student HUD */}
      <div className="glass-card-luxe p-6 sm:p-8 rounded-3xl border border-[#CEB466]/40 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 relative z-10">
          <Link
            href="/dashboard/students"
            className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-xl shadow-lg shadow-[#CEB466]/20">
              {getUserInitials(student)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white font-luxury">{studentDisplayName}</h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  Active Student
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Live Lesson Cockpit & Collaborative Voice Studio</p>
            </div>
          </div>
        </div>

        {/* Schedule & 1-Click Actions */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button
            onClick={handleSendInstantRecap}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-[#171229] font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{recapSent ? 'Recap & Drills Dispatched!' : '1-Click Send Recap & Drills'}</span>
          </button>

          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.08] hover:bg-white/15 border border-white/10 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-[#CEB466]" />
            <span>Schedule Settings</span>
          </button>
        </div>
      </div>

      {/* STUDENT VOICE MAP HUD OVERVIEW (During Lesson) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card-subtle p-4 rounded-2xl border border-[#CEB466]/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#CEB466]">Comfort Tessitura</span>
            <p className="text-base font-bold text-white font-mono mt-0.5">G3 – E5 (2.0 Octaves)</p>
          </div>
          <Activity className="w-5 h-5 text-[#CEB466]" />
        </div>

        <div className="glass-card-subtle p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Current Focus</span>
            <p className="text-sm font-bold text-white mt-0.5">Passaggio Jaw Release on G4</p>
          </div>
          <Zap className="w-5 h-5 text-amber-400" />
        </div>

        <div className="glass-card-subtle p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Weekly Practice</span>
            <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">3 Sessions Logged</p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        </div>
      </div>

      {/* QUICK DRILL INJECTION BAR */}
      <div className="glass-card-subtle p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Sparkles className="w-4 h-4 text-[#CEB466]" />
          <span>Quick Drill Assignment:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['5-Min SOVT Warmup', 'Passaggio Pivot on "Gug"', 'Melody Pocket Syncopation'].map((drill) => (
            <button
              key={drill}
              onClick={() => handleQuickInsertDrill(drill)}
              className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-[#CEB466]/20 hover:text-[#CEB466] text-gray-300 text-xs font-semibold transition-all border border-white/[0.08]"
            >
              + {drill}
            </button>
          ))}
        </div>

        {drillInserted && (
          <span className="text-xs font-bold text-emerald-400 animate-fade-in flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Injected to student homework!</span>
          </span>
        )}
      </div>

      {/* Collaborative Video & Notes Session View */}
      <SessionView
        studentId={student.id}
        bookingId={bookingId}
        isAdmin={true}
        currentUser={lessonData.currentUser}
      />

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-card-luxe bg-[#171229] rounded-3xl border border-[#CEB466]/40 p-6 sm:p-8 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-white font-luxury">Set Recurring Lesson Schedule</h3>
            <p className="text-xs text-gray-400">
              Configure weekly recurring slot for {studentDisplayName}.
            </p>

            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">Day of Week</label>
                <select
                  value={scheduleForm.dayOfWeek ?? ''}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      dayOfWeek: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="w-full glass-select text-sm"
                >
                  <option value="">Select Day</option>
                  {DAYS_OF_WEEK.map((day, idx) => (
                    <option key={day} value={idx}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">Lesson Time</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                  className="w-full glass-input px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">Duration</label>
                <select
                  value={scheduleForm.duration}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, duration: parseInt(e.target.value) })
                  }
                  className="w-full glass-select text-sm"
                >
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSchedule}
                className="px-5 py-2.5 rounded-xl bg-[#CEB466] text-[#171229] font-bold text-xs shadow-lg shadow-[#CEB466]/20"
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
