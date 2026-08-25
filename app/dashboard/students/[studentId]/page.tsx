'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Settings,
  Sparkles,
  Flame,
  CheckCircle2,
  MessageCircle,
  Mic,
  Music,
  BarChart3,
  NotebookPen,
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

interface ToolStats {
  sessionsThisWeek: number
  sessionsTotal: number
  avgScore: number | null
  bestScore: number | null
  lastSessionDate: string | null
}

interface TrainingData {
  studentId: string
  pitch: ToolStats & { weeklyChange: number | null }
  rhythm: ToolStats
  scale: ToolStats
  lastPracticedDate: string | null
  daysSincePractice: number | null
  currentStreak: number
  sessionsThisWeek: number
  blendedScore: number | null
  activity14d: number[]
  engagement: 'high' | 'medium' | 'low' | 'inactive'
  insight: string | null
  recentSessions: {
    tool: 'pitch' | 'rhythm' | 'scale'
    sessionDate: string
    createdAt: string | null
    score: number | null
    durationSeconds: number | null
    detail: string | null
  }[]
  notes: {
    count: number
    latest: { endedAt: string; excerpt: string } | null
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

function lastPracticedLabel(days: number | null): { label: string; tone: 'good' | 'neutral' | 'warn' } {
  if (days === null) return { label: 'Never', tone: 'neutral' }
  if (days === 0) return { label: 'Today', tone: 'good' }
  if (days === 1) return { label: 'Yesterday', tone: 'good' }
  if (days <= 7) return { label: `${days} days ago`, tone: 'neutral' }
  return { label: `${days} days ago`, tone: 'warn' }
}

function formatSessionDate(dateStr: string, createdAt: string | null): string {
  let d: Date
  if (createdAt) {
    d = new Date(createdAt)
  } else {
    const [y, m, day] = dateStr.split('-').map(Number)
    d = new Date(y, m - 1, day)
  }
  const today = new Date()
  const diffDays = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000
  )
  const time = createdAt
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null
  const dayLabel =
    diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return time ? `${dayLabel} · ${time}` : dayLabel
}

const TOOL_META: Record<'pitch' | 'rhythm' | 'scale', { label: string; color: string; metric: string }> = {
  pitch: { label: 'Pitch Trainer', color: '#d8b4fe', metric: 'Avg accuracy' },
  rhythm: { label: 'Rhythm Trainer', color: '#6ee7b7', metric: 'On-beat' },
  scale: { label: 'Scale Trainer', color: '#e2c974', metric: 'Accuracy' },
}

function ToolRow({
  tool,
  stats,
  gradient,
}: {
  tool: 'pitch' | 'rhythm' | 'scale'
  stats: ToolStats
  gradient: string
}) {
  const meta = TOOL_META[tool]
  const hasData = stats.sessionsTotal > 0
  const last = stats.lastSessionDate ? lastPracticedLabel(daysBetween(stats.lastSessionDate)) : null
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-3 sm:gap-5 items-center">
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${meta.color}26` }}
        >
          {tool === 'pitch' && <Mic className="w-4 h-4" style={{ color: meta.color }} />}
          {tool === 'rhythm' && <Music className="w-4 h-4" style={{ color: meta.color }} />}
          {tool === 'scale' && <BarChart3 className="w-4 h-4" style={{ color: meta.color }} />}
        </span>
        <div>
          <p className="text-[13px] font-bold text-white">{meta.label}</p>
          <p className="text-[10px] text-gray-500">
            {hasData
              ? `${stats.sessionsTotal} session${stats.sessionsTotal === 1 ? '' : 's'} · 30d${last ? ` · ${last.label.toLowerCase()}` : ''}`
              : 'No sessions in the last 30 days'}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{meta.metric}</span>
          <span className="text-[11px] font-extrabold font-mono" style={{ color: hasData ? meta.color : '#6b7280' }}>
            {hasData && stats.avgScore !== null
              ? `${Math.round(stats.avgScore)}%${stats.bestScore !== null ? ` · best ${Math.round(stats.bestScore)}%` : ''}`
              : '—'}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
          {hasData && stats.avgScore !== null && (
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, stats.avgScore))}%`, background: gradient }}
            />
          )}
        </div>
      </div>
      <span className="text-[11px] font-mono text-gray-400 sm:text-right">
        {stats.sessionsThisWeek} this wk
      </span>
    </div>
  )
}

function daysBetween(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today.getTime() - then.getTime()) / 86400000))
}

export default function StudentLessonPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId: bookingId } = use(params)
  const [lessonData, setLessonData] = useState<LessonData | null>(null)
  const [training, setTraining] = useState<TrainingData | null>(null)
  const [trainingError, setTrainingError] = useState(false)
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
    fetchTraining()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fetchTraining = async () => {
    try {
      const res = await fetch(`/api/teachers/students/${bookingId}/training`)
      if (!res.ok) {
        setTrainingError(true)
        return
      }
      setTraining(await res.json())
    } catch {
      setTrainingError(true)
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

  const handleMessageStudent = () => {
    if (!lessonData) return
    const student = lessonData.relationship.student
    window.dispatchEvent(
      new CustomEvent('va-open-chat', {
        detail: {
          user: {
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            name: student.name,
            avatar_url: student.avatar_url,
          },
        },
      })
    )
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
  const lastPracticed = training ? lastPracticedLabel(training.daysSincePractice) : null

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="glass-card-luxe p-5 sm:p-7 rounded-3xl border border-[#CEB466]/40 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-white font-luxury">{studentDisplayName}</h1>
                {training && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                      training.engagement === 'high'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        : training.engagement === 'medium'
                          ? 'bg-[#CEB466]/15 text-[#CEB466] border-[#CEB466]/35'
                          : training.engagement === 'low'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                            : 'bg-white/[0.06] text-gray-400 border-white/15'
                    }`}
                  >
                    {training.engagement === 'high'
                      ? 'Thriving'
                      : training.engagement === 'medium'
                        ? 'Steady'
                        : training.engagement === 'low'
                          ? 'Needs a nudge'
                          : 'Inactive'}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatRecurringSchedule(relationship.lesson_day_of_week, relationship.lesson_time)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 relative z-10">
          <button
            onClick={handleMessageStudent}
            className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/15 border border-white/10 text-white text-xs font-semibold transition-colors flex items-center gap-2"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#CEB466]" />
            <span>Message</span>
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.08] hover:bg-white/15 border border-white/10 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-[#CEB466]" />
            <span>Schedule</span>
          </button>
        </div>
      </div>

      {/* Live practice vitals — real training data */}
      {training && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass-card-subtle p-4 rounded-2xl border border-white/[0.1]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Last Practiced</p>
            <p
              className={`text-lg font-bold mt-0.5 ${
                lastPracticed?.tone === 'good'
                  ? 'text-emerald-400'
                  : lastPracticed?.tone === 'warn'
                    ? 'text-amber-400'
                    : 'text-white'
              }`}
            >
              {lastPracticed?.label}
            </p>
            {training.lastPracticedDate && (
              <p className="text-[10px] text-gray-500 mt-0.5">
                {formatSessionDate(training.lastPracticedDate, null)}
              </p>
            )}
          </div>
          <div className="glass-card-subtle p-4 rounded-2xl border border-white/[0.1]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Practice Streak</p>
            <p className="text-lg font-bold text-[#CEB466] font-mono mt-0.5 flex items-center gap-1.5">
              {training.currentStreak > 0 && <Flame className="w-4 h-4" />}
              {training.currentStreak} day{training.currentStreak === 1 ? '' : 's'}
            </p>
          </div>
          <div className="glass-card-subtle p-4 rounded-2xl border border-white/[0.1]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Sessions This Week</p>
            <p className="text-lg font-bold text-white font-mono mt-0.5">
              {training.sessionsThisWeek}
              {training.pitch.weeklyChange !== null && (
                <span
                  className={`text-[11px] ml-2 ${training.pitch.weeklyChange >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}
                >
                  {training.pitch.weeklyChange >= 0 ? '▲' : '▼'} {Math.abs(training.pitch.weeklyChange).toFixed(0)}% pitch
                </span>
              )}
            </p>
          </div>
          <div className="glass-card-subtle p-4 rounded-2xl border border-white/[0.1]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Blended Score</p>
            <p className="text-lg font-bold text-[#d8b4fe] font-mono mt-0.5">
              {training.blendedScore !== null ? `${Math.round(training.blendedScore)}%` : '—'}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">Across practiced tools · 30d</p>
          </div>
        </div>
      )}

      {training && training.daysSincePractice === null && (
        <div className="glass-card-subtle rounded-2xl border border-white/[0.08] p-4 text-[12.5px] text-gray-400">
          {studentDisplayName.split(' ')[0]} hasn&apos;t logged any training sessions yet — stats will appear here the
          first time they practice in the Training Center.
        </div>
      )}

      {trainingError && (
        <div className="glass-card-subtle rounded-2xl border border-amber-500/30 p-4 text-[12.5px] text-amber-300">
          Couldn&apos;t load practice stats right now. The lesson tools below still work.
        </div>
      )}

      {/* Performance + notes row */}
      {training && training.daysSincePractice !== null && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
          {/* Tool performance + recent sessions */}
          <div className="space-y-4">
            <div className="glass-card-subtle rounded-3xl border border-white/[0.1] p-5">
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-lg font-bold text-white font-luxury">Tool Performance</h2>
                <span className="text-[10.5px] text-gray-500">Rolling 30 days</span>
              </div>
              <div className="space-y-2.5">
                <ToolRow tool="pitch" stats={training.pitch} gradient="linear-gradient(90deg, #a855f7, #d8b4fe)" />
                <ToolRow tool="rhythm" stats={training.rhythm} gradient="linear-gradient(90deg, #34d399, #6ee7b7)" />
                <ToolRow tool="scale" stats={training.scale} gradient="linear-gradient(90deg, #CEB466, #e2c974)" />
              </div>
            </div>

            {training.recentSessions.length > 0 && (
              <div className="glass-card-subtle rounded-3xl border border-white/[0.1] p-5">
                <h2 className="text-lg font-bold text-white font-luxury mb-3">Recent Sessions</h2>
                <div className="space-y-0.5">
                  <div className="grid grid-cols-[1.3fr_0.9fr_0.6fr_0.7fr] gap-3 px-2.5 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">When</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Tool</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Score</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Duration</span>
                  </div>
                  {training.recentSessions.map((session, idx) => (
                    <div
                      key={`${session.tool}-${session.createdAt || session.sessionDate}-${idx}`}
                      className={`grid grid-cols-[1.3fr_0.9fr_0.6fr_0.7fr] gap-3 px-2.5 py-2.5 rounded-xl items-center ${
                        idx % 2 === 0 ? 'bg-white/[0.03]' : ''
                      }`}
                    >
                      <span className="text-[12px] font-semibold text-white">
                        {formatSessionDate(session.sessionDate, session.createdAt)}
                      </span>
                      <span className="text-[12px]" style={{ color: TOOL_META[session.tool].color }}>
                        {TOOL_META[session.tool].label.replace(' Trainer', '')}
                        {session.detail ? ` · ${session.detail}` : ''}
                      </span>
                      <span className="text-[12px] font-extrabold font-mono text-white">
                        {session.score !== null ? `${Math.round(session.score)}%` : '—'}
                      </span>
                      <span className="text-[12px] font-mono text-gray-400">
                        {session.durationSeconds !== null ? `${Math.max(1, Math.round(session.durationSeconds / 60))} min` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: lesson + notes + signal */}
          <div className="space-y-4">
            <div className="glass-card-subtle rounded-3xl border border-[#CEB466]/30 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-white font-luxury">Next Lesson</h2>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="text-[11px] font-bold text-[#CEB466] hover:text-[#e2c974]"
                >
                  Edit
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-[#CEB466]" />
                </span>
                <div>
                  <p className="text-[13.5px] font-bold text-white">
                    {formatRecurringSchedule(relationship.lesson_day_of_week, relationship.lesson_time)}
                  </p>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {relationship.lesson_duration_minutes || 60} minutes
                    {relationship.lesson_timezone ? ` · ${relationship.lesson_timezone}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card-subtle rounded-3xl border border-white/[0.1] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-white font-luxury">Lesson Notes</h2>
                <span className="text-[11px] text-gray-500 flex items-center gap-1">
                  <NotebookPen className="w-3 h-3" />
                  {training.notes.count} archived
                </span>
              </div>
              {training.notes.latest ? (
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-3.5">
                  <p className="text-[10.5px] font-bold text-gray-500 mb-1.5">
                    {new Date(training.notes.latest.endedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · Most recent lesson
                  </p>
                  <p className="text-[12px] text-gray-300 leading-relaxed">
                    {training.notes.latest.excerpt}
                    {training.notes.latest.excerpt.length >= 220 ? '…' : ''}
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-gray-500">
                  No archived lesson notes yet — end a class below to create the first one.
                </p>
              )}
            </div>

            {training.insight && (
              <div className="rounded-3xl border border-[#a855f7]/35 p-5 bg-gradient-to-br from-[#a855f7]/10 to-white/[0.02]">
                <div className="flex items-start gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[#a855f7]/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-[#d8b4fe]" />
                  </span>
                  <div>
                    <p className="text-[10.5px] font-extrabold tracking-wider text-[#d8b4fe] uppercase mb-1">
                      Coaching Signal
                    </p>
                    <p className="text-[12px] text-gray-300 leading-relaxed">{training.insight}</p>
                  </div>
                </div>
              </div>
            )}

            {training.sessionsThisWeek > 0 && (
              <div className="glass-card-subtle rounded-3xl border border-white/[0.1] p-4 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-[11.5px] text-gray-400">
                  {training.sessionsThisWeek} practice session{training.sessionsThisWeek === 1 ? '' : 's'} logged this
                  week across all tools.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collaborative Video & Notes Session View */}
      <SessionView
        studentId={student.id}
        bookingId={bookingId}
        isAdmin={lessonData.isTeacher}
        currentUser={lessonData.currentUser}
      />

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-card-luxe modal-solid rounded-3xl border border-[#CEB466]/40 p-6 sm:p-8 w-full max-w-md space-y-4">
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
