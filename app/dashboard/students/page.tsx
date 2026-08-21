'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Users,
  Clock,
  Calendar,
  Bell,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Flame,
  Music,
  Zap,
  Target,
  Sparkles,
  Search,
  X,
  SortAsc,
  Send,
  CheckCircle2,
  AlertTriangle,
  Play,
  Video,
} from 'lucide-react'
import { SpotlightTour, SpotlightTriggerButton, SpotlightStep } from '@/components/spotlight-tour'

const teacherStudentsTourSteps: SpotlightStep[] = [
  {
    target: '[data-tour="teacher-student-roster"]',
    title: '1. Student Roster & AI Vocal Analytics',
    content: 'Review practice streak, pitch accuracy trends, and automated AI Coach insights for each enrolled vocalist.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="teacher-open-cockpit"]',
    title: '2. Live Lesson Classroom Cockpit',
    content: 'Click "Open Cockpit" to start your 1-on-1 HD live video lesson with collaborative note taking and recording archival.',
    placement: 'left',
  },
]

interface Student {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  avatar_url: string | null
  bio: string | null
}

interface Booking {
  id: string
  status: string
  lesson_day_of_week: number | null
  lesson_time: string | null
  lesson_duration_minutes: number | null
  lesson_timezone: string | null
  created_at: string
  updated_at: string
  student: Student
  student_id: string
}

interface StudentStats {
  studentId: string
  pitchTraining: {
    sessionsThisWeek: number
    sessionsTotal: number
    avgScore: number
    bestScore: number
    currentStreak: number
    lastSessionDate: string | null
    weeklyChange: number
  }
  rhythmTraining: {
    sessionsThisWeek: number
    sessionsTotal: number
    avgOnBeatPercent: number
    bestOnBeatPercent: number
    lastSessionDate: string | null
  }
  songTraining: {
    sessionsThisWeek: number
    sessionsTotal: number
    avgAccuracy: number
    uniqueSongs: number
    lastSessionDate: string | null
  }
  overallEngagement: 'high' | 'medium' | 'low' | 'inactive'
  aiInsight: string | null
}

function getStudentDisplayName(student: Student): string {
  if (student.name) return student.name
  if (student.first_name || student.last_name) {
    return `${student.first_name || ''} ${student.last_name || ''}`.trim()
  }
  return 'Student'
}

function getStudentInitials(student: Student): string {
  const name = getStudentDisplayName(student)
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatRecurringSchedule(dayOfWeek: number | null, time: string | null): string {
  if (dayOfWeek === null || !time) return 'Not scheduled'
  const day = DAYS_OF_WEEK[dayOfWeek] || 'Unknown'
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `Every ${day} at ${hour12}:${minutes} ${ampm}`
}

function getNextLessonText(dayOfWeek: number | null, time: string | null): { text: string; isToday: boolean; isSoon: boolean } {
  if (dayOfWeek === null || !time) return { text: '', isToday: false, isSoon: false }

  const now = new Date()
  const currentDay = now.getDay()
  const [hours, minutes] = time.split(':').map(Number)

  let daysUntil = dayOfWeek - currentDay
  if (daysUntil < 0) daysUntil += 7

  if (daysUntil === 0) {
    const lessonMinutes = hours * 60 + minutes
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    if (lessonMinutes <= currentMinutes) {
      daysUntil = 7
    }
  }

  const isToday = daysUntil === 0
  const isSoon = daysUntil <= 1

  if (isToday) {
    const hour12 = hours % 12 || 12
    const ampm = hours >= 12 ? 'PM' : 'AM'
    return { text: `Today at ${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`, isToday: true, isSoon: true }
  } else if (daysUntil === 1) {
    const hour12 = hours % 12 || 12
    const ampm = hours >= 12 ? 'PM' : 'AM'
    return { text: `Tomorrow at ${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`, isToday: false, isSoon: true }
  } else {
    return { text: `${DAYS_OF_WEEK[dayOfWeek]}`, isToday: false, isSoon: false }
  }
}

const STUDENTS_PER_PAGE = 8

export default function StudentsPage() {
  const [students, setStudents] = useState<Booking[]>([])
  const [studentStats, setStudentStats] = useState<Record<string, StudentStats>>({})
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<'schedule' | 'name' | 'recent'>('schedule')
  const [filterRetention, setFilterRetention] = useState<'all' | 'active' | 'improving' | 'at_risk'>('all')
  const [sentActionIds, setSentActionIds] = useState<string[]>([])

  useEffect(() => {
    fetchStudents(page, searchQuery, sortBy)
    fetchPendingCount()
  }, [page, searchQuery, sortBy])

  useEffect(() => {
    if (students.length > 0) {
      fetchStudentStats()
    }
  }, [students])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        setSearchQuery(searchInput)
        setPage(1)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, searchQuery])

  const fetchStudents = useCallback(async (pageNum: number, search: string, sort: string) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: STUDENTS_PER_PAGE.toString(),
        sortBy: sort,
      })
      if (search) {
        params.set('search', search)
      }

      const response = await fetch(`/api/teachers/students?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch students')
      }

      setStudents(data.students || [])
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1)
        setTotal(data.pagination.total || 0)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStudentStats = async () => {
    try {
      setStatsLoading(true)
      const response = await fetch('/api/teachers/students/stats')
      const data = await response.json()

      if (response.ok && data.stats) {
        setStudentStats(data.stats)
      }
    } catch (err) {
      console.error('Failed to fetch student stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }

  const fetchPendingCount = async () => {
    try {
      const response = await fetch('/api/teachers/pending-requests')
      const data = await response.json()
      if (response.ok) {
        setPendingCount(data.requests?.length || 0)
      }
    } catch {
      // Ignore errors
    }
  }

  const handleQuickNudge = (studentId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSentActionIds((prev) => [...prev, studentId])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#CEB466]"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 text-red-400 p-6 rounded-2xl">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Teacher Roster Spotlight Tour */}
      <SpotlightTour tourKey="teacher_roster_v4" steps={teacherStudentsTourSteps} />

      {/* Header & CRM Command Overview */}
      <div className="glass-card-luxe p-6 sm:p-8 rounded-3xl border border-[#CEB466]/40 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-xs font-semibold text-[#CEB466] mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>High-Density Student CRM</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white font-luxury">
              Student Directory & Retention Control
            </h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1">
              Monitor practice velocity, intonation trends, homework status, and execute 1-click re-engagement actions.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <SpotlightTriggerButton tourKey="teacher_roster_v4" label="How to" />
            {pendingCount > 0 && (
              <Link
                href="/dashboard/students/requests"
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#171229] font-bold rounded-2xl shadow-lg shadow-amber-500/20 text-xs sm:text-sm transition-all"
              >
                <Bell className="w-4 h-4" />
                <span>{pendingCount} Pending Request{pendingCount !== 1 ? 's' : ''}</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search students by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-10 py-3 glass-input text-xs sm:text-sm"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('')
                setSearchQuery('')
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'All Roster' },
            { id: 'active', label: 'Active Practicing' },
            { id: 'improving', label: 'Improving (+Score)' },
            { id: 'at_risk', label: 'At Risk (<1 session)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterRetention(tab.id as typeof filterRetention)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filterRetention === tab.id
                  ? 'bg-[#CEB466] text-[#171229] shadow-md shadow-[#CEB466]/20'
                  : 'glass-card-subtle text-gray-300 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Student Command Cards */}
      <div data-tour="teacher-student-roster" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {students.map((booking, idx) => {
          const stats = studentStats[booking.student_id]
          const nextLesson = getNextLessonText(booking.lesson_day_of_week, booking.lesson_time)
          const isSent = sentActionIds.includes(booking.student_id)
          const isAtRisk = stats && (stats.overallEngagement === 'low' || stats.overallEngagement === 'inactive')
          const isImproving = stats && stats.pitchTraining.weeklyChange > 0

          return (
            <div
              key={booking.id}
              className={`glass-card-subtle p-5 rounded-3xl border transition-all space-y-4 flex flex-col justify-between ${
                isAtRisk
                  ? 'border-amber-500/30 bg-amber-500/[0.03]'
                  : isImproving
                  ? 'border-emerald-500/30 bg-emerald-500/[0.02]'
                  : 'border-white/[0.08] hover:border-[#CEB466]/40'
              }`}
            >
              {/* Top Row: Avatar + Name + Tier */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      {booking.student.avatar_url ? (
                        <img
                          src={booking.student.avatar_url}
                          alt={getStudentDisplayName(booking.student)}
                          className="w-12 h-12 rounded-2xl object-cover ring-2 ring-white/10"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-base shadow-md shadow-[#CEB466]/20">
                          {getStudentInitials(booking.student)}
                        </div>
                      )}
                      {stats && stats.pitchTraining.currentStreak > 0 && (
                        <div className="absolute -bottom-1 -right-1 bg-amber-500 rounded-full p-0.5 shadow">
                          <Flame className="w-3 h-3 text-[#171229]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/students/${booking.id}`}
                        className="font-bold text-white text-base hover:text-[#CEB466] transition-colors truncate block"
                      >
                        {getStudentDisplayName(booking.student)}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span className="capitalize">{booking.status}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {nextLesson.text}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Detected Vocal Trends / Metric Bar */}
                {stats && (
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-black/20 border border-white/[0.04] text-center">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-gray-400">Pitch Score</span>
                      <p className="text-sm font-bold text-white font-mono mt-0.5">
                        {stats.pitchTraining.avgScore > 0 ? `${stats.pitchTraining.avgScore}%` : '--'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-gray-400">Sessions</span>
                      <p className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                        {stats.pitchTraining.sessionsThisWeek} this wk
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-gray-400">Streak</span>
                      <p className="text-sm font-bold text-[#CEB466] font-mono mt-0.5">
                        {stats.pitchTraining.currentStreak} days
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Insight Snippet */}
                {stats?.aiInsight && (
                  <div className="p-3 rounded-xl bg-[#CEB466]/10 border border-[#CEB466]/20 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#CEB466] shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-200 leading-relaxed">{stats.aiInsight}</p>
                  </div>
                )}
              </div>

              {/* 1-Click Action Bar */}
              <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  onClick={(e) => handleQuickNudge(booking.student_id, e)}
                  disabled={isSent}
                  className="flex-1 py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/15 border border-white/10 text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSent ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Sent!</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 text-[#CEB466]" />
                      <span>1-Click Nudge</span>
                    </>
                  )}
                </button>

                <Link
                  href={`/dashboard/students/${booking.id}`}
                  data-tour={idx === 0 ? 'teacher-open-cockpit' : undefined}
                  className="py-2 px-4 rounded-xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Open Cockpit</span>
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
