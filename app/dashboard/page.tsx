import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import {
  Users,
  Video,
  Clock,
  Calendar,
  Sparkles,
  GraduationCap,
  Bell,
  CheckCircle2,
  BookOpen,
  Music,
  ArrowRight,
  TrendingUp,
  Zap,
  Flame,
  Search,
} from 'lucide-react'
import { calculateStreak } from '@/lib/training-stats'
import ModernPitchTrainer from '@/components/ModernPitchTrainer'
import RhythmTrainer from '@/components/RhythmTrainer'
import ScaleTrainer from '@/components/ScaleTrainer'
import { DashboardSpotlight } from '@/components/dashboard-spotlight'
import { SpotlightTriggerButton } from '@/components/spotlight-tour'

interface Teacher {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
}

interface Student {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
}

interface ActiveLesson {
  id: string
  lesson_day_of_week: number | null
  lesson_time: string | null
  lesson_duration_minutes: number | null
  instructor?: Teacher
  student?: Student
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatLessonDay(dayOfWeek: number | null | undefined): string | null {
  if (dayOfWeek === null || dayOfWeek === undefined) return null
  return DAY_NAMES[dayOfWeek] ?? null
}

function formatLessonClock(time: string | null | undefined): string | null {
  if (!time) return null
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

function formatWeeklySchedule(lesson: ActiveLesson): string {
  const day = formatLessonDay(lesson.lesson_day_of_week)
  const time = formatLessonClock(lesson.lesson_time)
  if (day !== null) {
    return `${day}s at ${time || 'TBD'}`
  }
  return time || 'Weekly Scheduled Lesson'
}

interface TrainingSessionSummary {
  tool: 'Pitch' | 'Rhythm' | 'Scales'
  sessionDate: string | null
  startedAt: string | null
  durationSeconds: number | null
  overallScore: number | null
}

interface CourseResume {
  title: string
  href: string
  detail: string
}

type DataRow = Record<string, unknown>

function getDisplayName(person?: Teacher | Student): string {
  if (!person) return 'Unknown'
  if (person.name) return person.name
  if (person.first_name || person.last_name) {
    return `${person.first_name || ''} ${person.last_name || ''}`.trim()
  }
  return 'User'
}

function getInitials(person?: Teacher | Student): string {
  const name = getDisplayName(person)
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function formatLessonTime(lesson?: ActiveLesson): string {
  if (!lesson) return 'No lesson scheduled'

  const day = formatLessonDay(lesson.lesson_day_of_week) || 'Next lesson'
  const time = formatLessonClock(lesson.lesson_time) || 'Time TBD'
  return `${day} · ${time}`
}

function getSessionTimestamp(session: TrainingSessionSummary): number {
  const rawDate = session.startedAt || session.sessionDate
  return rawDate ? new Date(rawDate).getTime() : 0
}

function formatSignedPercent(value: unknown): string | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  const rounded = Math.round(numeric)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

function getStringValue(row: DataRow, key: string): string | null {
  const value = row[key]
  return typeof value === 'string' ? value : null
}

function getNumberValue(row: DataRow, key: string): number | null {
  const value = row[key]
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getRows(data: unknown): DataRow[] {
  return Array.isArray(data) ? (data as DataRow[]) : []
}

function mapTrainingSessions(data: unknown, tool: TrainingSessionSummary['tool']): TrainingSessionSummary[] {
  return getRows(data).map((session) => ({
    tool,
    sessionDate: getStringValue(session, 'session_date'),
    startedAt: getStringValue(session, 'started_at'),
    durationSeconds: getNumberValue(session, 'duration_seconds'),
    overallScore: getNumberValue(session, 'overall_score'),
  }))
}

function getWeekStart(date = new Date()): string {
  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const diff = day === 0 ? -6 : 1 - day
  weekStart.setDate(weekStart.getDate() + diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart.toISOString().slice(0, 10)
}

export const metadata: Metadata = { title: 'Dashboard', description: 'Your Voice Alchemy Academy home: lessons, practice and progress at a glance.' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getCurrentUser()
  const isTeacher =
    profile?.role === 'teacher' ||
    profile?.role === 'instructor' ||
    profile?.role === 'admin'

  let activeLessons: ActiveLesson[] = []
  let practiceStreak = 0
  let bestRecentScore: number | null = null
  let weeklyTrainingDays = 0
  const weeklyToolCounts = {
    Pitch: 0,
    Rhythm: 0,
    Scales: 0,
  }
  let progressRows: { label: string; value: string }[] = []
  let courseResume: CourseResume | null = null

  if (isTeacher) {
    const { count: studentCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('instructor_id', profile?.id)
      .eq('status', 'confirmed')

    const { count: pendingCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('instructor_id', profile?.id)
      .eq('status', 'pending')

    // The live bookings table has no FK constraint on student_id, so a
    // PostgREST relationship embed fails silently — join in code instead.
    const { data: lessons } = await supabase
      .from('bookings')
      .select('id, student_id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone, created_at')
      .eq('instructor_id', profile?.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(3)

    const lessonStudentIds = [...new Set((lessons || []).map((l) => l.student_id).filter(Boolean))]
    let lessonStudentMap: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null }> = {}
    if (lessonStudentIds.length > 0) {
      const { data: lessonStudents } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name')
        .in('id', lessonStudentIds)
      if (lessonStudents) {
        lessonStudentMap = Object.fromEntries(lessonStudents.map((s) => [s.id, s]))
      }
    }

    activeLessons = (lessons || []).map((l) => ({
      ...l,
      student: lessonStudentMap[l.student_id] || null,
    }))

    const displayName = profile?.name || profile?.first_name || 'Vocalist'
    const stats = [
      { label: 'Active Students', value: studentCount || 0, href: '/dashboard/students' },
      { label: 'Pending Requests', value: pendingCount || 0, href: '/dashboard/students/requests' },
      { label: 'Active Lessons', value: activeLessons.length, href: '/dashboard/students' },
    ]
    const quickActions = [
      {
        label: 'Course Studio & Quizzes',
        href: '/dashboard/courses',
        icon: GraduationCap,
        desc: 'Build custom courses & lesson quizzes',
      },
      {
        label: 'My Students & Live Classes',
        href: '/dashboard/students',
        icon: Users,
        desc: 'Student CRM, live room & notes',
      },
      {
        label: 'Training Center & Reports',
        href: '/dashboard/training-center',
        icon: Music,
        desc: 'Pitch & rhythm metrics and AI insights',
      },
      {
        label: 'Pending Requests',
        href: '/dashboard/students/requests',
        icon: Bell,
        desc: 'Review inbound student applications',
      },
    ]

    return (
      <div className="space-y-6 sm:space-y-8 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <DashboardSpotlight isTeacher={isTeacher} userName={displayName} />

        <div data-tour="dashboard-welcome" className="glass-card-luxe p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border border-[#CEB466]/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#CEB466]/15 via-purple-500/10 to-transparent blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 relative z-10">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[10px] sm:text-xs font-semibold text-[#CEB466]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Voice Alchemy Master Dashboard</span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-luxury">
                Welcome back, {displayName}!
              </h1>
              <p className="text-xs sm:text-sm text-gray-300 max-w-xl leading-relaxed">
                Manage your student roster, review homework recordings, and launch your live studio classroom.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <SpotlightTriggerButton tourKey="teacher_dashboard_v4" label="How to" />

              <Link
                href="/dashboard/training-center"
                className="w-full sm:w-auto py-2.5 sm:py-3 px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold text-xs sm:text-sm shadow-xl shadow-[#CEB466]/20 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Zap className="w-4 h-4" />
                <span>Launch Training Center</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-white/[0.08] relative z-10">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-[#CEB466]/30 transition-all group active:scale-[0.98]"
              >
                <span className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                  {stat.label}
                </span>
                <p className="text-xl sm:text-2xl font-bold text-white font-mono mt-0.5 group-hover:text-[#CEB466] transition-colors">
                  {stat.value}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {activeLessons.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 font-luxury">
                <Video className="w-5 h-5 text-[#CEB466]" />
                <span>Go to Class & Live Studio</span>
              </h2>
              <span className="text-xs text-gray-400">
                {activeLessons.length} confirmed lesson{activeLessons.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeLessons.map((lesson) => {
                const person = lesson.student
                const lessonPath = `/dashboard/students/${lesson.id}`

                return (
                  <div
                    key={lesson.id}
                    className="glass-card-subtle p-5 rounded-3xl border border-[#CEB466]/30 hover:border-[#CEB466]/60 transition-all space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-sm shadow-md shadow-[#CEB466]/15">
                            {getInitials(person)}
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-base">{getDisplayName(person)}</h3>
                            <p className="text-xs text-gray-400">Student</p>
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                          {lesson.lesson_duration_minutes || 60} Min
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-[#CEB466] font-medium pt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatWeeklySchedule(lesson)}</span>
                      </div>
                    </div>

                    <Link
                      href={lessonPath}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#CEB466]/20 transition-all"
                    >
                      <Video className="w-4 h-4" />
                      <span>Enter Live Classroom</span>
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div data-tour="dashboard-practice-arena" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2 font-luxury">
                <Music className="w-6 h-6 text-[#CEB466]" />
                <span>Interactive Practice Arena</span>
              </h2>
              <p className="text-xs text-gray-400">
                Real-time Aubio pitch detector, interactive scale matching, and rhythm tap game.
              </p>
            </div>

            <Link
              href="/dashboard/training-center"
              className="text-xs font-semibold text-[#CEB466] hover:text-[#e0c97d] flex items-center gap-1 transition-colors"
            >
              <span>Full Arena View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="h-full transition-transform duration-300 hover:-translate-y-1">
              <ModernPitchTrainer variant="card" />
            </div>
            <div className="h-full transition-transform duration-300 hover:-translate-y-1">
              <RhythmTrainer variant="card" />
            </div>
            <div className="h-full transition-transform duration-300 hover:-translate-y-1">
              <ScaleTrainer variant="card" />
            </div>
          </div>
        </div>

        <div data-tour="dashboard-quick-actions" className="space-y-4">
          <h2 className="text-xl font-bold text-white font-luxury">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => {
              const tourAttr =
                action.href === '/dashboard/courses'
                  ? 'dashboard-courses-link'
                  : action.href === '/dashboard/training-center'
                    ? 'dashboard-reports-link'
                    : action.href === '/dashboard/students'
                      ? 'dashboard-lessons-link'
                      : undefined

              return (
                <Link
                  key={action.label}
                  href={action.href}
                  data-tour={tourAttr}
                  className="glass-card-subtle p-5 rounded-3xl border border-white/10 hover:border-[#CEB466]/40 transition-all hover:scale-[1.02] flex flex-col justify-between space-y-3 group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] shadow-md shadow-[#CEB466]/15 group-hover:scale-110 transition-transform">
                    <action.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base group-hover:text-[#CEB466] transition-colors">
                      {action.label}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{action.desc}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {stats.every((s) => s.value === 0) && (
          <div className="glass-card-luxe p-6 sm:p-8 rounded-3xl border border-[#CEB466]/30 space-y-3">
            <div className="flex items-center gap-2 text-[#CEB466]">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white font-luxury">Getting Started</h3>
            </div>

            <div className="space-y-2 text-xs sm:text-sm text-gray-300">
              <p>Welcome to Voice Alchemy Academy! Here is your quick start checklist:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-400">
                <li>Students discover your profile and request live coaching</li>
                <li>Review and approve student bookings in Pending Requests</li>
                <li>Set up a recurring weekly lesson schedule</li>
                <li>Launch live video lessons with collaborative note-taking</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    )
  } else {
    // Same FK-less live table: join instructor profiles in code.
    const { data: lessons } = await supabase
      .from('bookings')
      .select('id, instructor_id, lesson_day_of_week, lesson_time, lesson_duration_minutes, lesson_timezone, created_at')
      .eq('student_id', profile?.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(3)

    const lessonInstructorIds = [...new Set((lessons || []).map((l) => l.instructor_id).filter(Boolean))]
    let lessonInstructorMap: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null }> = {}
    if (lessonInstructorIds.length > 0) {
      const { data: lessonInstructors } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name')
        .in('id', lessonInstructorIds)
      if (lessonInstructors) {
        lessonInstructorMap = Object.fromEntries(lessonInstructors.map((i) => [i.id, i]))
      }
    }

    activeLessons = (lessons || []).map((l) => ({
      ...l,
      instructor: lessonInstructorMap[l.instructor_id] || null,
    }))
  }

  const weekStart = getWeekStart()
  const [
    pitchSessionsResult,
    rhythmSessionsResult,
    scaleSessionsResult,
    pitchProgressResult,
    rhythmProgressResult,
    scaleProgressResult,
    enrollmentResult,
    teacherCoursesResult,
  ] = await Promise.all([
    supabase
      .from('pitch_training_sessions')
      .select('session_date, started_at, duration_seconds, overall_score')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false })
      .limit(30),
    supabase
      .from('rhythm_training_sessions')
      .select('session_date, started_at, duration_seconds, overall_score')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false })
      .limit(30),
    supabase
      .from('scale_training_sessions')
      .select('session_date, started_at, duration_seconds, overall_score')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false })
      .limit(30),
    supabase
      .from('pitch_training_weekly_progress')
      .select('avg_target_accuracy, avg_pitch_accuracy, target_accuracy_change, pitch_accuracy_change')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('rhythm_training_weekly_progress')
      .select('avg_on_beat_percent, on_beat_percent_change')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('scale_training_weekly_progress')
      .select('avg_pitch_accuracy, pitch_accuracy_change')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    isTeacher
      ? Promise.resolve({ data: null })
      : supabase
          .from('course_enrollments')
          .select('id, course_id, enrolled_at, course:courses(id, title, description)')
          .eq('student_id', user.id)
          .order('enrolled_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
    isTeacher
      ? supabase
          .from('courses')
          .select('id, title, description, created_at')
          .eq('instructor_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const pitchSessions = mapTrainingSessions(pitchSessionsResult.data, 'Pitch')
  const rhythmSessions = mapTrainingSessions(rhythmSessionsResult.data, 'Rhythm')
  const scaleSessions = mapTrainingSessions(scaleSessionsResult.data, 'Scales')
  const allTrainingSessions = [...pitchSessions, ...rhythmSessions, ...scaleSessions]
    .sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a))

  const weeklyDays = new Set<string>()
  allTrainingSessions.forEach((session) => {
    if (session.sessionDate && session.sessionDate >= weekStart) {
      weeklyDays.add(session.sessionDate)
      weeklyToolCounts[session.tool] += 1
    }
  })
  weeklyTrainingDays = weeklyDays.size

  practiceStreak = calculateStreak(
    allTrainingSessions.map((s) => s.sessionDate).filter((d): d is string => Boolean(d))
  )
  const recentScores = allTrainingSessions
    .map((s) => s.overallScore)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s))
  bestRecentScore = recentScores.length > 0 ? Math.round(Math.max(...recentScores)) : null

  // Per-tool latest score for the practice hub: sessions arrive newest-first,
  // but re-sort by timestamp since started_at is more precise than session_date.
  const nowMs = Date.now()
  const toolScores = [
    { tool: 'Pitch' as const, sessions: pitchSessions },
    { tool: 'Rhythm' as const, sessions: rhythmSessions },
    { tool: 'Scales' as const, sessions: scaleSessions },
  ].map(({ tool, sessions }) => {
    const latest = [...sessions].sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a))[0]
    const timestamp = latest ? getSessionTimestamp(latest) : 0
    const daysAgo = timestamp > 0 ? Math.max(0, Math.floor((nowMs - timestamp) / 86_400_000)) : null
    const score =
      latest && typeof latest.overallScore === 'number' && Number.isFinite(latest.overallScore)
        ? Math.max(0, Math.min(100, Math.round(latest.overallScore)))
        : null
    return { tool, score, daysAgo }
  })

  const pitchProgress = (pitchProgressResult.data || {}) as DataRow
  const rhythmProgress = (rhythmProgressResult.data || {}) as DataRow
  const scaleProgress = (scaleProgressResult.data || {}) as DataRow
  const pitchChange =
    formatSignedPercent(pitchProgress.target_accuracy_change) ||
    formatSignedPercent(pitchProgress.pitch_accuracy_change)
  const rhythmChange = formatSignedPercent(rhythmProgress.on_beat_percent_change)
  const scaleChange = formatSignedPercent(scaleProgress.pitch_accuracy_change)

  progressRows = [
    pitchChange ? { label: 'Pitch accuracy', value: pitchChange } : null,
    rhythmChange ? { label: 'Rhythm', value: rhythmChange } : null,
    scaleChange ? { label: 'Scale pitch', value: scaleChange } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row))

  const enrollment = (enrollmentResult.data || {}) as DataRow
  const enrolledCourse = enrollment.course
  const teacherCourse = teacherCoursesResult.data as DataRow | null
  if (isTeacher && teacherCourse) {
    courseResume = {
      title: getStringValue(teacherCourse, 'title') || 'Course',
      href: '/dashboard/courses',
      detail: 'Teacher course',
    }
  } else if (!isTeacher && enrolledCourse) {
    const courseRow = Array.isArray(enrolledCourse)
      ? enrolledCourse[0] as DataRow | undefined
      : enrolledCourse as DataRow
    const enrolledAt = getStringValue(enrollment, 'enrolled_at')
    courseResume = {
      title: courseRow ? getStringValue(courseRow, 'title') || 'Course' : 'Course',
      href: '/dashboard/courses',
      detail: enrolledAt
        ? `Enrolled ${new Date(enrolledAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}`
        : 'Enrolled',
    }
  }

  const displayName = profile?.name || profile?.first_name || 'Vocalist'
  const nextLesson = activeLessons[0]
  const lessonPerson = isTeacher ? nextLesson?.student : nextLesson?.instructor
  const lessonPath = nextLesson
    ? isTeacher
      ? `/dashboard/students/${nextLesson.id}`
      : `/dashboard/my-lessons/${nextLesson.id}`
    : isTeacher
      ? '/dashboard/students'
      : '/dashboard/my-lessons'
  const nextLessonName = nextLesson ? getDisplayName(lessonPerson) : null

  return (
    <div className="relative space-y-4 sm:space-y-5 p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full bg-[#a855f7]/15 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute top-[26rem] -left-24 h-72 w-72 rounded-full bg-[#CEB466]/10 blur-[110px]" />
      <DashboardSpotlight isTeacher={isTeacher} userName={displayName} />

      <header
        data-tour="dashboard-welcome"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#CEB466]/30 bg-[#CEB466]/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#CEB466]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </div>
          <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl font-luxury">
            Today
          </h1>
          <p className="mt-1 text-sm text-gray-300">
            Welcome back, {displayName}. Here is what matters next.
          </p>
        </div>
        <SpotlightTriggerButton
          tourKey={isTeacher ? 'teacher_dashboard_v4' : 'student_dashboard_v4'}
          label="How to"
        />
      </header>

      <section
        data-tour="dashboard-practice-arena"
        className="glass-card-luxe relative overflow-hidden rounded-2xl p-5 shadow-2xl shadow-black/30 sm:rounded-3xl sm:p-6"
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#a855f7]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-56 rounded-full bg-[#CEB466]/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] text-[#171229] shadow-lg shadow-[#CEB466]/30">
                <Music className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CEB466]">
                  Today
                </p>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">
                  Continue your training
                </h2>
              </div>
            </div>

            {/* Gamified practice stats — all real session data */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  practiceStreak > 0
                    ? 'border-[#CEB466]/40 bg-[#CEB466]/15 text-[#CEB466]'
                    : 'border-white/10 bg-white/[0.05] text-gray-400'
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                <span>{practiceStreak > 0 ? `${practiceStreak}-day streak` : 'Start a streak today'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-gray-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>{weeklyTrainingDays}/7 days this week</span>
              </span>
              {bestRecentScore !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a855f7]/35 bg-[#a855f7]/12 px-3 py-1.5 text-xs font-bold text-[#d8b4fe]">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Best score {bestRecentScore}%</span>
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#CEB466]">
                Latest scores
              </p>
              {toolScores.map(({ tool, score, daysAgo }) => {
                const isNever = daysAgo === null
                const isStale = daysAgo !== null && daysAgo > 7
                const barPercent = isNever || isStale ? 0 : score ?? 0
                const when =
                  daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`
                return (
                  <div key={tool} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-gray-200">{tool}</span>
                      {isNever ? (
                        <span className="font-semibold text-[#CEB466]">
                          Try out the {tool} trainer!
                        </span>
                      ) : isStale ? (
                        <span className="text-gray-400">
                          0% · not done in {daysAgo} days
                        </span>
                      ) : (
                        <span className="text-gray-300">
                          <span className="font-bold text-white">{score ?? 0}%</span> · {when}
                        </span>
                      )}
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#CEB466] to-[#f2dc8d]"
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <Link
            href="/dashboard/training-center"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#CEB466] px-5 py-3 text-sm font-bold text-[#171229] shadow-xl shadow-[#CEB466]/20 transition hover:bg-[#e0c97d] active:scale-[0.98] sm:w-auto"
          >
            <TrendingUp className="h-4 w-4" />
            <span>View Progress</span>
          </Link>
        </div>

        {/* The tools themselves, front and center */}
        <div className="relative mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-full transition-transform duration-300 hover:-translate-y-1">
            <ModernPitchTrainer variant="card" />
          </div>
          <div className="h-full transition-transform duration-300 hover:-translate-y-1">
            <RhythmTrainer variant="card" />
          </div>
          <div className="h-full transition-transform duration-300 hover:-translate-y-1">
            <ScaleTrainer variant="card" />
          </div>
        </div>
      </section>

      <section
        data-tour="dashboard-lessons-link"
        className="glass-card-subtle rounded-2xl border border-white/[0.09] p-5 sm:rounded-3xl sm:p-6 transition-colors duration-300 hover:border-[#CEB466]/30"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CEB466]">
                  Next lesson
                </p>
                {nextLesson && (
                  <Link
                    href={lessonPath}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#CEB466]/45 px-3 py-2 text-xs font-bold text-[#CEB466] transition hover:bg-[#CEB466]/12 active:scale-[0.98] sm:hidden"
                  >
                    <Video className="h-3.5 w-3.5" />
                    <span>Go to Class</span>
                  </Link>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-lg font-bold text-white sm:text-xl">
                <Calendar className="h-5 w-5 text-[#CEB466]" />
                <span>{formatLessonTime(nextLesson)}</span>
              </div>
            </div>

            {nextLesson && nextLessonName ? (
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] text-sm font-black text-[#171229]">
                  {getInitials(lessonPerson)}
                </div>
                <div>
                  <p className="font-bold text-white">{nextLessonName}</p>
                  <p className="text-xs text-gray-400">
                    {isTeacher ? 'Student' : 'Voice coach'}
                  </p>
                </div>
              </div>
            ) : isTeacher ? (
              <p className="max-w-md text-sm text-gray-400">
                Confirmed lessons will appear here when they are scheduled.
              </p>
            ) : (
              <p className="max-w-md text-sm text-gray-400">
                You don&apos;t have a voice coach yet. A 1:1 coach turns your practice
                scores into a plan — pick one and request your first lesson.
              </p>
            )}
          </div>

          {nextLesson ? (
            <Link
              href={lessonPath}
              className="hidden min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#CEB466]/45 px-5 py-3 text-sm font-bold text-[#CEB466] transition hover:bg-[#CEB466]/12 active:scale-[0.98] sm:inline-flex"
            >
              <Video className="h-4 w-4" />
              <span>Go to Class</span>
            </Link>
          ) : (
            !isTeacher && (
              <Link
                href="/dashboard/find-teacher"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#CEB466] px-5 py-3 text-sm font-bold text-[#171229] shadow-xl shadow-[#CEB466]/20 transition hover:bg-[#e0c97d] active:scale-[0.98]"
              >
                <Search className="h-4 w-4" />
                <span>Find Your Coach</span>
              </Link>
            )
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="glass-card-subtle rounded-2xl border border-white/[0.09] p-5 sm:rounded-3xl sm:p-6 transition-colors duration-300 hover:border-[#CEB466]/30">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CEB466]">
            Your week
          </p>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-4xl font-black text-white">{weeklyTrainingDays}</span>
            <span className="pb-1 text-lg font-bold text-gray-400">
              training day{weeklyTrainingDays === 1 ? '' : 's'} this week
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {([
              { label: 'Pitch', color: '#a855f7' },
              { label: 'Rhythm', color: '#34d399' },
              { label: 'Scales', color: '#CEB466' },
            ] as const).map(({ label, color }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3"
              >
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2.5 text-gray-200">
                    <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />
                    {label}
                  </span>
                  <span className="font-mono text-xs text-gray-400">
                    {weeklyToolCounts[label]} session{weeklyToolCounts[label] === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, weeklyToolCounts[label] * 20)}%`,
                      background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                    }}
                  />
                </div>
              </div>
            ))}
            {weeklyTrainingDays === 0 && (
              <p className="text-xs text-gray-400">
                This week will update after you save training sessions.
              </p>
            )}
          </div>
        </section>

        <section
          data-tour="dashboard-reports-link"
          className="glass-card-subtle rounded-2xl border border-white/[0.09] p-5 sm:rounded-3xl sm:p-6 transition-colors duration-300 hover:border-[#CEB466]/30"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CEB466]">
              Progress
            </p>
            <TrendingUp className="h-5 w-5 text-emerald-300" />
          </div>
          {progressRows.length > 0 ? (
            <div className="mt-5 space-y-3">
              {progressRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3"
                >
                  <span className="text-sm font-semibold text-gray-200">{row.label}</span>
                  <span className={`text-lg font-black ${
                    row.value.startsWith('-') ? 'text-rose-300' : 'text-emerald-300'
                  }`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3 text-sm text-gray-400">
              Progress changes will appear after you have enough saved practice data.
            </p>
          )}
          <Link
            href="/dashboard/training-center"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15 active:scale-[0.98]"
          >
            <span>View Progress</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          {!isTeacher && activeLessons.length === 0 && (
            <Link
              href="/dashboard/find-teacher"
              className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#CEB466]/35 bg-[#CEB466]/10 px-4 py-2.5 text-xs font-bold text-[#CEB466] transition hover:bg-[#CEB466]/18"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Work on these numbers with a coach</span>
            </Link>
          )}
        </section>
      </div>

      <section
        data-tour="dashboard-courses-link"
        className="glass-card-subtle rounded-2xl border border-white/[0.09] p-5 sm:rounded-3xl sm:p-6 transition-colors duration-300 hover:border-[#CEB466]/30"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#CEB466]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CEB466]">
                Resume
              </p>
              <h2 className="mt-1 truncate text-lg font-bold text-white sm:text-xl">
                {courseResume?.title || (isTeacher ? 'No active course yet' : 'No course enrollment yet')}
              </h2>
              <p className="text-sm text-gray-400">
                {courseResume?.detail || (isTeacher ? 'Create a course to see it here.' : 'Enroll in a course to see it here.')}
              </p>
            </div>
          </div>

          <Link
            href={courseResume?.href || '/dashboard/courses'}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#CEB466] px-5 py-3 text-sm font-bold text-[#171229] shadow-xl shadow-[#CEB466]/15 transition hover:bg-[#e0c97d] active:scale-[0.98]"
          >
            <span>{courseResume ? 'Continue' : 'View Courses'}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
