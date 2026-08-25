'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Users,
  Clock,
  Bell,
  ChevronRight,
  ChevronLeft,
  Flame,
  Sparkles,
  Search,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  MessageCircle,
  PlayCircle,
} from 'lucide-react'
import { SpotlightTour, SpotlightTriggerButton, SpotlightStep } from '@/components/spotlight-tour'

const teacherStudentsTourSteps: SpotlightStep[] = [
  {
    target: '[data-tour="teacher-student-roster"]',
    title: '1. Your Students',
    content: 'See your students and a quick view of how their practice is going.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="teacher-open-cockpit"]',
    title: '2. Open a Lesson',
    content: 'Tap "Open Studio" to start a live lesson, take notes, and save the session.',
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

interface RosterEntry {
  id: string
  status: string | null
  lesson_day_of_week: number | null
  lesson_time: string | null
  lesson_duration_minutes: number | null
  student: Student | null
}

interface ToolStats {
  sessionsThisWeek: number
  sessionsTotal: number
  avgScore: number | null
  bestScore: number | null
  lastSessionDate: string | null
}

interface StudentStats {
  studentId: string
  pitch: ToolStats & { weeklyChange: number | null }
  rhythm: ToolStats
  scale: ToolStats
  lastPracticedDate: string | null
  daysSincePractice: number | null
  currentStreak: number
  sessionsThisWeek: number
  activity14d: number[]
  engagement: 'high' | 'medium' | 'low' | 'inactive'
  insight: string | null
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PAGE_SIZE = 9

function getStudentDisplayName(student: Student | null): string {
  if (!student) return 'Student'
  if (student.name) return student.name
  const combined = `${student.first_name || ''} ${student.last_name || ''}`.trim()
  return combined || 'Student'
}

function getStudentInitials(student: Student | null): string {
  const name = getStudentDisplayName(student)
  const parts = name.split(' ').filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatNextLesson(dayOfWeek: number | null, time: string | null): string {
  if (dayOfWeek === null || !time) return 'No lesson scheduled'
  const [hoursStr, minutes] = time.split(':')
  const hour = parseInt(hoursStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${DAYS_OF_WEEK[dayOfWeek].slice(0, 3)} ${hour12}:${minutes} ${ampm}`
}

function practiceStatus(stats: StudentStats | undefined): {
  label: string
  tone: 'good' | 'neutral' | 'warn' | 'none'
} {
  if (!stats || stats.daysSincePractice === null) {
    return { label: 'No practice data yet', tone: 'none' }
  }
  const d = stats.daysSincePractice
  if (d === 0) return { label: 'Practiced today', tone: 'good' }
  if (d === 1) return { label: 'Practiced yesterday', tone: 'good' }
  if (d <= 7) return { label: `Practiced ${d} days ago`, tone: 'neutral' }
  return { label: `${d} days since practice`, tone: 'warn' }
}

function isAtRisk(stats: StudentStats | undefined): boolean {
  if (!stats) return false
  return (
    stats.daysSincePractice !== null &&
    (stats.daysSincePractice > 7 || stats.engagement === 'low' || stats.engagement === 'inactive')
  )
}

function openChatWith(student: Student | null, draft?: string) {
  if (!student) return
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
        draft,
      },
    })
  )
}

function RingGauge({ value, muted }: { value: number | null; muted?: boolean }) {
  const circumference = 2 * Math.PI * 31
  const filled = value !== null ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div className="relative w-[76px] h-[76px] shrink-0">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r="31" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        {value !== null && (
          <circle
            cx="38"
            cy="38"
            r="31"
            fill="none"
            stroke={muted ? '#8b86a3' : '#a855f7'}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(filled / 100) * circumference} ${circumference}`}
            transform="rotate(-90 38 38)"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[17px] font-extrabold font-mono ${value === null ? 'text-gray-500' : 'text-white'}`}>
          {value !== null ? Math.round(value) : '—'}
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500">Pitch</span>
      </div>
    </div>
  )
}

function MeterBar({ label, value, gradient }: { label: string; value: number | null; gradient: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
        <span className="text-[10.5px] font-bold font-mono text-gray-300">
          {value !== null ? `${Math.round(value)}%` : '—'}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        {value !== null && (
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: gradient }}
          />
        )}
      </div>
    </div>
  )
}

function ActivitySparkline({ activity, warn }: { activity: number[]; warn?: boolean }) {
  const max = Math.max(1, ...activity)
  const points = activity
    .map((count, i) => {
      const x = 2 + (i * 112) / Math.max(1, activity.length - 1)
      const y = 23 - (count / max) * 19
      return `${x},${y}`
    })
    .join(' ')
  const last = points.split(' ').pop()?.split(',') || ['114', '23']
  return (
    <svg width="118" height="26" viewBox="0 0 118 26" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={warn ? '#f0b35c' : '#a855f7'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={warn ? '#fcd9a4' : '#e9d5ff'} />
    </svg>
  )
}

type FilterKey = 'all' | 'week' | 'risk' | 'inactive'
type SortKey = 'practiced' | 'name' | 'lesson'

export default function StudentsPage() {
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [stats, setStats] = useState<Record<string, StudentStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sortBy, setSortBy] = useState<SortKey>('practiced')
  const [page, setPage] = useState(1)
  const [pendingCount, setPendingCount] = useState(0)
  const [checkInSentFor, setCheckInSentFor] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [rosterRes, statsRes] = await Promise.all([
          fetch('/api/teachers/students?limit=100&sortBy=name'),
          fetch('/api/teachers/students/stats'),
        ])
        const rosterData = await rosterRes.json()
        const statsData = await statsRes.json()
        if (!rosterRes.ok) throw new Error(rosterData.error || 'Failed to load students')
        if (!statsRes.ok) throw new Error(statsData.error || 'Failed to load practice stats')
        if (cancelled) return
        setRoster(rosterData.students || [])
        setStats(statsData.stats || {})
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load students')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    fetch('/api/teachers/pending-requests')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPendingCount(data.requests?.length || 0)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const withStats = useMemo(
    () =>
      roster.map((entry) => ({
        entry,
        stats: entry.student ? stats[entry.student.id] : undefined,
      })),
    [roster, stats]
  )

  const counts = useMemo(() => {
    const practicedToday = withStats.filter((s) => s.stats?.daysSincePractice === 0).length
    const practicedThisWeek = withStats.filter((s) => (s.stats?.sessionsThisWeek ?? 0) > 0).length
    const atRisk = withStats.filter((s) => isAtRisk(s.stats)).length
    const inactive = withStats.filter((s) => !s.stats || s.stats.daysSincePractice === null || s.stats.engagement === 'inactive').length
    const pitchAvgs = withStats
      .map((s) => s.stats?.pitch.avgScore)
      .filter((v): v is number => v !== null && v !== undefined)
    const rosterAvgPitch =
      pitchAvgs.length > 0 ? Math.round(pitchAvgs.reduce((a, b) => a + b, 0) / pitchAvgs.length) : null
    return { practicedToday, practicedThisWeek, atRisk, inactive, rosterAvgPitch }
  }, [withStats])

  const filtered = useMemo(() => {
    let list = withStats
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((s) => getStudentDisplayName(s.entry.student).toLowerCase().includes(q))
    }
    if (filter === 'week') list = list.filter((s) => (s.stats?.sessionsThisWeek ?? 0) > 0)
    if (filter === 'risk') list = list.filter((s) => isAtRisk(s.stats))
    if (filter === 'inactive')
      list = list.filter((s) => !s.stats || s.stats.daysSincePractice === null || s.stats.engagement === 'inactive')

    const sorted = [...list]
    if (sortBy === 'practiced') {
      sorted.sort((a, b) => {
        const da = a.stats?.daysSincePractice
        const db = b.stats?.daysSincePractice
        if (da === null || da === undefined) return db === null || db === undefined ? 0 : 1
        if (db === null || db === undefined) return -1
        return da - db
      })
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => getStudentDisplayName(a.entry.student).localeCompare(getStudentDisplayName(b.entry.student)))
    } else if (sortBy === 'lesson') {
      const minutesUntil = (e: RosterEntry) => {
        if (e.lesson_day_of_week === null || !e.lesson_time) return Number.MAX_SAFE_INTEGER
        const now = new Date()
        const [h, m] = e.lesson_time.split(':').map(Number)
        let days = e.lesson_day_of_week - now.getDay()
        if (days < 0 || (days === 0 && h * 60 + m <= now.getHours() * 60 + now.getMinutes())) days += 7
        return days * 1440 + h * 60 + m - (now.getHours() * 60 + now.getMinutes())
      }
      sorted.sort((a, b) => minutesUntil(a.entry) - minutesUntil(b.entry))
    }
    return sorted
  }, [withStats, search, filter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleCheckIn = (student: Student | null) => {
    if (!student) return
    openChatWith(
      student,
      `Hey ${getStudentDisplayName(student).split(' ')[0]}! I noticed it's been a little while since your last practice session — how's everything going? Even a short 10-minute warmup this week would be a great reset. I'm here if anything's in the way!`
    )
    setCheckInSentFor(student.id)
    setTimeout(() => setCheckInSentFor(null), 2500)
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto">
      <SpotlightTour tourKey="teacher_roster_v4" steps={teacherStudentsTourSteps} />

      {/* Header */}
      <section className="glass-card-luxe rounded-2xl sm:rounded-3xl border border-[#CEB466]/40 p-4 sm:p-6 md:p-7 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466] mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>Voice Alchemy · Coaching</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">My Students</h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1 max-w-2xl">
              Live practice performance across your roster — pulled from each student&apos;s training sessions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SpotlightTriggerButton tourKey="teacher_roster_v4" label="How to" />
            <Link
              href="/dashboard/students/requests"
              className="relative flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors"
            >
              <Bell className="w-3.5 h-3.5 text-[#CEB466]" />
              <span>Requests</span>
              {pendingCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[#CEB466] text-[#171229] text-[10px] font-extrabold leading-none">
                  {pendingCount}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10">
              <Search className="w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search students…"
                className="bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none w-36 sm:w-44"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pulse strip */}
      {!loading && !error && roster.length > 0 && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass-card-subtle rounded-2xl border border-white/[0.1] p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Active Students</p>
              <p className="text-2xl font-bold text-white font-mono mt-0.5">{roster.length}</p>
            </div>
            <Users className="w-5 h-5 text-[#CEB466]" />
          </div>
          <div className="glass-card-subtle rounded-2xl border border-white/[0.1] p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Practiced Today</p>
              <p className="text-2xl font-bold text-emerald-400 font-mono mt-0.5">{counts.practicedToday}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="glass-card-subtle rounded-2xl border border-white/[0.1] p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Roster Avg Pitch</p>
              <p className="text-2xl font-bold text-white font-mono mt-0.5">
                {counts.rosterAvgPitch !== null ? `${counts.rosterAvgPitch}%` : '—'}
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-[#a855f7]" />
          </div>
          <div
            className={`glass-card-subtle rounded-2xl p-4 flex items-center justify-between border ${
              counts.atRisk > 0 ? 'border-amber-500/40' : 'border-white/[0.1]'
            }`}
          >
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${counts.atRisk > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                Need Attention
              </p>
              <p className={`text-2xl font-bold font-mono mt-0.5 ${counts.atRisk > 0 ? 'text-amber-400' : 'text-white'}`}>
                {counts.atRisk}
              </p>
            </div>
            <AlertTriangle className={`w-5 h-5 ${counts.atRisk > 0 ? 'text-amber-400' : 'text-gray-600'}`} />
          </div>
        </section>
      )}

      {/* Filters + sort */}
      {!loading && !error && roster.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'all', label: `All (${roster.length})` },
                { key: 'week', label: `Practiced this week (${counts.practicedThisWeek})` },
                { key: 'risk', label: `At risk (${counts.atRisk})`, warn: true },
                { key: 'inactive', label: `Inactive (${counts.inactive})` },
              ] as { key: FilterKey; label: string; warn?: boolean }[]
            ).map((pill) => (
              <button
                key={pill.key}
                onClick={() => {
                  setFilter(pill.key)
                  setPage(1)
                }}
                className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                  filter === pill.key
                    ? 'bg-[#CEB466] text-[#171229] shadow-md shadow-[#CEB466]/20'
                    : pill.warn
                      ? 'bg-white/[0.04] text-amber-400/90 border border-amber-500/30 hover:bg-white/[0.08]'
                      : 'bg-white/[0.04] text-gray-300 border border-white/10 hover:bg-white/[0.08]'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10">
            <span className="text-[11px] text-gray-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-transparent text-[11.5px] font-bold text-white focus:outline-none cursor-pointer [&>option]:bg-[#1b1233]"
            >
              <option value="practiced">Last practiced</option>
              <option value="name">Name</option>
              <option value="lesson">Next lesson</option>
            </select>
          </div>
        </section>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#CEB466]" />
        </div>
      )}

      {!loading && error && (
        <div className="glass-card p-6 rounded-2xl border border-red-500/30 text-red-300 text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold shrink-0"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && roster.length === 0 && (
        <div className="glass-card p-10 rounded-2xl border border-white/[0.08] text-center">
          <p className="text-gray-300 text-sm">No students yet. Approved lesson requests will show up here.</p>
        </div>
      )}

      {/* Student cards */}
      {!loading && !error && pageItems.length > 0 && (
        <section data-tour="teacher-student-roster" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pageItems.map(({ entry, stats: s }, idx) => {
            const student = entry.student
            const status = practiceStatus(s)
            const risk = isAtRisk(s)
            const hasBooking = !entry.id.startsWith('profile-')
            const hasData = !!s && s.daysSincePractice !== null

            return (
              <div
                key={entry.id}
                className={`glass-card-subtle rounded-3xl p-5 flex flex-col gap-3.5 border transition-all duration-300 hover:bg-white/[0.05] ${
                  risk ? 'border-amber-500/35' : 'border-white/[0.1]'
                }`}
              >
                {/* Identity row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-extrabold text-sm shrink-0">
                      {getStudentInitials(student)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{getStudentDisplayName(student)}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            status.tone === 'good'
                              ? 'bg-emerald-400'
                              : status.tone === 'warn'
                                ? 'bg-amber-400'
                                : status.tone === 'neutral'
                                  ? 'bg-gray-300'
                                  : 'bg-gray-600'
                          }`}
                        />
                        <span
                          className={`text-[10.5px] font-semibold truncate ${
                            status.tone === 'good'
                              ? 'text-emerald-400'
                              : status.tone === 'warn'
                                ? 'text-amber-400'
                                : 'text-gray-400'
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  {risk ? (
                    <span className="px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-[9.5px] font-extrabold text-amber-400 tracking-wide shrink-0">
                      AT RISK
                    </span>
                  ) : (
                    s && s.currentStreak > 0 && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 shrink-0">
                        <Flame className="w-3 h-3 text-[#CEB466]" />
                        <span className="text-[10px] font-extrabold text-[#CEB466] font-mono">{s.currentStreak}d</span>
                      </span>
                    )
                  )}
                </div>

                {/* Meters */}
                {hasData && s ? (
                  <div className="grid grid-cols-[76px_1fr] gap-3.5 items-center">
                    <RingGauge value={s.pitch.avgScore} muted={risk} />
                    <div className="flex flex-col gap-2.5">
                      <MeterBar
                        label="Rhythm"
                        value={s.rhythm.avgScore}
                        gradient="linear-gradient(90deg, #34d399, #6ee7b7)"
                      />
                      <MeterBar
                        label="Scales"
                        value={s.scale.avgScore}
                        gradient="linear-gradient(90deg, #CEB466, #e2c974)"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[76px_1fr] gap-3.5 items-center">
                    <RingGauge value={null} />
                    <p className="text-[11.5px] text-gray-500 leading-relaxed">
                      No training sessions yet. Stats appear the first time they practice.
                    </p>
                  </div>
                )}

                {/* Activity + trend */}
                {hasData && s && (
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">14-day activity</span>
                      <ActivitySparkline activity={s.activity14d} warn={risk} />
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={`text-[11px] font-bold font-mono ${
                          s.sessionsThisWeek > 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {s.sessionsThisWeek} session{s.sessionsThisWeek === 1 ? '' : 's'} this wk
                        {s.pitch.weeklyChange !== null &&
                          ` ${s.pitch.weeklyChange >= 0 ? '▲' : '▼'} ${Math.abs(s.pitch.weeklyChange).toFixed(0)}%`}
                      </span>
                      <span className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatNextLesson(entry.lesson_day_of_week, entry.lesson_time)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/[0.07] mt-auto">
                  {risk && student ? (
                    <button
                      onClick={() => handleCheckIn(student)}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[11.5px] font-extrabold hover:bg-amber-500/25 transition-colors"
                    >
                      {checkInSentFor === student.id ? 'Chat opened ✓' : 'Send Check-in'}
                    </button>
                  ) : hasBooking ? (
                    <Link
                      href={`/dashboard/students/${entry.id}`}
                      data-tour={idx === 0 ? 'teacher-open-cockpit' : undefined}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] to-[#e2c974] text-[#171229] text-[11.5px] font-extrabold text-center hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>Open Studio</span>
                    </Link>
                  ) : (
                    <span className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-gray-500 text-[11.5px] font-semibold text-center">
                      No lesson relationship
                    </span>
                  )}
                  {risk && hasBooking && (
                    <Link
                      href={`/dashboard/students/${entry.id}`}
                      data-tour={idx === 0 ? 'teacher-open-cockpit' : undefined}
                      className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-gray-300 text-[11.5px] font-semibold hover:bg-white/[0.1] transition-colors"
                    >
                      Open Studio
                    </Link>
                  )}
                  {!risk && student && (
                    <button
                      onClick={() => openChatWith(student)}
                      className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-gray-300 text-[11.5px] font-semibold hover:bg-white/[0.1] transition-colors flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Message</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {!loading && !error && roster.length > 0 && filtered.length === 0 && (
        <div className="glass-card p-8 rounded-2xl border border-white/[0.08] text-center">
          <p className="text-gray-400 text-sm">No students match this filter.</p>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && filtered.length > PAGE_SIZE && (
        <section className="flex items-center justify-between">
          <span className="text-[11.5px] text-gray-500">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length} students
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-[11.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold ${
                  p === safePage
                    ? 'bg-[#CEB466] text-[#171229]'
                    : 'bg-white/[0.04] border border-white/10 text-gray-300 hover:bg-white/[0.08]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-[11.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* Coaching signals (from real deltas) */}
      {!loading && !error && pageItems.some(({ stats: s }) => s?.insight) && (
        <section className="glass-card-subtle rounded-2xl border border-white/[0.08] p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Sparkles className="w-3.5 h-3.5 text-[#CEB466]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#CEB466]">Coaching Signals</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {pageItems
              .filter(({ stats: s }) => s?.insight)
              .slice(0, 4)
              .map(({ entry, stats: s }) => (
                <p key={entry.id} className="text-[11.5px] text-gray-300 leading-relaxed">
                  <span className="font-bold text-white">{getStudentDisplayName(entry.student)}:</span> {s!.insight}
                </p>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
