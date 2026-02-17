'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Clock, Calendar, Bell, ChevronRight, TrendingUp, TrendingDown, Flame, Music, Zap, Target, Sparkles } from 'lucide-react'

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

function getEngagementColor(engagement: string): string {
  switch (engagement) {
    case 'high': return 'text-green-400'
    case 'medium': return 'text-blue-400'
    case 'low': return 'text-amber-400'
    case 'inactive': return 'text-gray-500'
    default: return 'text-gray-400'
  }
}

function getEngagementBg(engagement: string): string {
  switch (engagement) {
    case 'high': return 'bg-green-500/20 border-green-500/30'
    case 'medium': return 'bg-blue-500/20 border-blue-500/30'
    case 'low': return 'bg-amber-500/20 border-amber-500/30'
    case 'inactive': return 'bg-gray-500/20 border-gray-500/30'
    default: return 'bg-gray-500/20 border-gray-500/30'
  }
}

function StudentStatsCard({ stats }: { stats: StudentStats }) {
  const totalSessionsThisWeek = stats.pitchTraining.sessionsThisWeek + stats.rhythmTraining.sessionsThisWeek + stats.songTraining.sessionsThisWeek

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      {/* Engagement Badge & AI Insight */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${getEngagementBg(stats.overallEngagement)}`}>
          {stats.overallEngagement === 'high' && <Flame className="w-3 h-3 text-green-400" />}
          {stats.overallEngagement === 'medium' && <Zap className="w-3 h-3 text-blue-400" />}
          {stats.overallEngagement === 'low' && <Clock className="w-3 h-3 text-amber-400" />}
          {stats.overallEngagement === 'inactive' && <Clock className="w-3 h-3 text-gray-500" />}
          <span className={getEngagementColor(stats.overallEngagement)}>
            {stats.overallEngagement === 'high' && 'Active'}
            {stats.overallEngagement === 'medium' && 'Practicing'}
            {stats.overallEngagement === 'low' && 'Light Activity'}
            {stats.overallEngagement === 'inactive' && 'Inactive'}
          </span>
        </div>
        {stats.pitchTraining.currentStreak > 0 && (
          <div className="flex items-center gap-1 text-xs text-orange-400">
            <Flame className="w-3 h-3" />
            <span>{stats.pitchTraining.currentStreak} day streak</span>
          </div>
        )}
      </div>

      {/* AI Insight */}
      {stats.aiInsight && (
        <div className="flex items-start gap-2 mb-3 p-2 bg-[#CEB466]/10 border border-[#CEB466]/20 rounded-lg">
          <Sparkles className="w-4 h-4 text-[#CEB466] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-300 leading-relaxed">{stats.aiInsight}</p>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Pitch Training */}
        <div className="bg-black/20 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
            <Target className="w-3 h-3" />
            <span className="text-[10px] font-medium uppercase">Pitch</span>
          </div>
          <p className="text-lg font-bold text-white">{stats.pitchTraining.sessionsThisWeek}</p>
          <p className="text-[10px] text-gray-500">this week</p>
          {stats.pitchTraining.avgScore > 0 && (
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className="text-xs text-gray-400">{stats.pitchTraining.avgScore}%</span>
              {stats.pitchTraining.weeklyChange !== 0 && (
                <span className={`text-[10px] flex items-center ${stats.pitchTraining.weeklyChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.pitchTraining.weeklyChange > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Rhythm Training */}
        <div className="bg-black/20 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-amber-400 mb-1">
            <Zap className="w-3 h-3" />
            <span className="text-[10px] font-medium uppercase">Rhythm</span>
          </div>
          <p className="text-lg font-bold text-white">{stats.rhythmTraining.sessionsThisWeek}</p>
          <p className="text-[10px] text-gray-500">this week</p>
          {stats.rhythmTraining.avgOnBeatPercent > 0 && (
            <p className="text-xs text-gray-400 mt-1">{stats.rhythmTraining.avgOnBeatPercent}% on-beat</p>
          )}
        </div>

        {/* Song Training */}
        <div className="bg-black/20 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-blue-400 mb-1">
            <Music className="w-3 h-3" />
            <span className="text-[10px] font-medium uppercase">Songs</span>
          </div>
          <p className="text-lg font-bold text-white">{stats.songTraining.sessionsThisWeek}</p>
          <p className="text-[10px] text-gray-500">this week</p>
          {stats.songTraining.uniqueSongs > 0 && (
            <p className="text-xs text-gray-400 mt-1">{stats.songTraining.uniqueSongs} songs</p>
          )}
        </div>
      </div>

      {/* Total Sessions This Week */}
      <div className="mt-2 text-center">
        <span className="text-xs text-gray-500">
          {totalSessionsThisWeek} total session{totalSessionsThisWeek !== 1 ? 's' : ''} this week
          {stats.pitchTraining.sessionsTotal + stats.rhythmTraining.sessionsTotal + stats.songTraining.sessionsTotal > 0 && (
            <> ({stats.pitchTraining.sessionsTotal + stats.rhythmTraining.sessionsTotal + stats.songTraining.sessionsTotal} all time)</>
          )}
        </span>
      </div>
    </div>
  )
}

const STUDENTS_PER_PAGE = 6

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

  useEffect(() => {
    fetchStudents(page)
    fetchPendingCount()
  }, [page])

  useEffect(() => {
    if (students.length > 0) {
      fetchStudentStats()
    }
  }, [students])

  const fetchStudents = async (pageNum: number) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/teachers/students?page=${pageNum}&limit=${STUDENTS_PER_PAGE}`)
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
  }

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
      // Ignore errors for pending count
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Students</h1>
          <p className="text-gray-400 mt-1">Manage your students and track their progress</p>
        </div>
        {pendingCount > 0 && (
          <Link
            href="/dashboard/students/requests"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span>
              {pendingCount} Pending Request{pendingCount !== 1 ? 's' : ''}
            </span>
          </Link>
        )}
      </div>

      {/* Summary Stats */}
      {students.length > 0 && !statsLoading && Object.keys(studentStats).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <Flame className="w-5 h-5" />
              <span className="text-sm font-medium">Active</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {Object.values(studentStats).filter(s => s.overallEngagement === 'high').length}
            </p>
            <p className="text-xs text-gray-500">students practicing regularly</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 text-amber-400 mb-2">
              <Clock className="w-5 h-5" />
              <span className="text-sm font-medium">Need Attention</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {Object.values(studentStats).filter(s => s.overallEngagement === 'low' || s.overallEngagement === 'inactive').length}
            </p>
            <p className="text-xs text-gray-500">students with low activity</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 text-purple-400 mb-2">
              <Target className="w-5 h-5" />
              <span className="text-sm font-medium">Pitch Sessions</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {Object.values(studentStats).reduce((sum, s) => sum + s.pitchTraining.sessionsThisWeek, 0)}
            </p>
            <p className="text-xs text-gray-500">total this week</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <TrendingUp className="w-5 h-5" />
              <span className="text-sm font-medium">Improving</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {Object.values(studentStats).filter(s => s.pitchTraining.weeklyChange > 0).length}
            </p>
            <p className="text-xs text-gray-500">students showing growth</p>
          </div>
        </div>
      )}

      {/* Students Count */}
      {total > 0 && (
        <div className="text-sm text-gray-400">
          Showing {((page - 1) * STUDENTS_PER_PAGE) + 1}-{Math.min(page * STUDENTS_PER_PAGE, total)} of {total} students
        </div>
      )}

      {/* Students Grid */}
      {students.length === 0 && !loading ? (
        <div className="text-center py-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
          <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No students yet</h3>
          <p className="text-gray-400">Students can find you and request to join your lessons.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {students.map((booking) => {
            const stats = studentStats[booking.student_id]

            return (
              <div
                key={booking.id}
                className="group bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <Link href={`/dashboard/students/${booking.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {getStudentInitials(booking.student)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                          {getStudentDisplayName(booking.student)}
                        </h3>
                        {booking.student.bio && (
                          <p className="text-sm text-gray-400 line-clamp-1">{booking.student.bio}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                  </div>

                  <div className="mt-4 space-y-2">
                    {booking.lesson_day_of_week !== null && booking.lesson_time ? (
                      <>
                        <div className="flex items-center gap-2 text-sm text-gray-300">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span>{formatRecurringSchedule(booking.lesson_day_of_week, booking.lesson_time)}</span>
                        </div>
                        {booking.lesson_duration_minutes && (
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Clock className="w-4 h-4 text-gray-500" />
                            <span>{booking.lesson_duration_minutes} minutes</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-400">
                        <Clock className="w-4 h-4" />
                        <span>Schedule not set</span>
                      </div>
                    )}
                  </div>
                </Link>

                {/* Student Stats Section */}
                {statsLoading ? (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-center gap-2 py-4">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                      <span className="text-xs text-gray-500">Loading practice data...</span>
                    </div>
                  </div>
                ) : stats ? (
                  <StudentStatsCard stats={stats} />
                ) : (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-500 text-center py-2">No practice data available yet</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-10 h-10 rounded-lg transition-colors ${
                  pageNum === page
                    ? 'bg-[#CEB466] text-[#171229] font-bold'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
