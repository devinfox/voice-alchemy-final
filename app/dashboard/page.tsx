import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import {
  Users,
  Video,
  Clock,
  Calendar,
  Sparkles,
  Search,
  BookOpen,
  Music,
  GraduationCap,
  Bell,
  CheckCircle2,
  Flame,
  ArrowRight,
  Music2,
  Zap,
} from 'lucide-react'
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

interface BookingLesson {
  id: string
  lesson_day_of_week?: string | null
  lesson_time?: string | null
  lesson_duration_minutes?: number | null
  lesson_timezone?: string | null
  created_at?: string | null
  student?: Student | null
  instructor?: Teacher | null
}

interface ActiveLesson {
  id: string
  lesson_day_of_week: string | null
  lesson_time: string | null
  lesson_duration_minutes: number | null
  instructor?: Teacher
  student?: Student
}

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
  let stats: { label: string; value: number; href: string }[] = []
  let quickActions: {
    label: string
    href: string
    icon: any
    color: string
    desc: string
  }[] = []

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

    const { data: lessons } = await supabase
      .from('bookings')
      .select(`
        id,
        lesson_day_of_week,
        lesson_time,
        lesson_duration_minutes,
        lesson_timezone,
        created_at,
        student:student_id (id, first_name, last_name, name)
      `)
      .eq('instructor_id', profile?.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(3)

    activeLessons = (lessons || []).map((l) => ({
      ...l,
      student: Array.isArray(l.student) ? l.student[0] : l.student,
    }))

    stats = [
      { label: 'Active Students', value: studentCount || 0, href: '/dashboard/students' },
      { label: 'Pending Requests', value: pendingCount || 0, href: '/dashboard/students/requests' },
      { label: 'Today’s Lessons', value: activeLessons.length, href: '/dashboard/students' },
    ]

    quickActions = [
      {
        label: 'Course Studio & Quizzes',
        href: '/dashboard/courses',
        icon: GraduationCap,
        color: 'from-[#CEB466] to-[#9c8644]',
        desc: 'Build custom courses & lesson quizzes',
      },
      {
        label: 'My Students & Live Classes',
        href: '/dashboard/students',
        icon: Users,
        color: 'from-[#e0c97d] to-[#CEB466]',
        desc: 'Student CRM, live room & notes',
      },
      {
        label: 'Training Center & Reports',
        href: '/dashboard/training-center',
        icon: Music,
        color: 'from-[#a855f7] to-[#7c3aed]',
        desc: 'Pitch & rhythm metrics and AI insights',
      },
      {
        label: 'Pending Requests',
        href: '/dashboard/students/requests',
        icon: Bell,
        color: 'from-[#9c8644] to-[#7d6b36]',
        desc: 'Review inbound student applications',
      },
    ]
  } else {
    const { count: teacherCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', profile?.id)
      .eq('status', 'confirmed')

    const { count: pendingCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', profile?.id)
      .eq('status', 'pending')

    const { data: lessons } = await supabase
      .from('bookings')
      .select(`
        id,
        lesson_day_of_week,
        lesson_time,
        lesson_duration_minutes,
        lesson_timezone,
        created_at,
        instructor:instructor_id (id, first_name, last_name, name)
      `)
      .eq('student_id', profile?.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(3)

    activeLessons = (lessons || []).map((l) => ({
      ...l,
      instructor: Array.isArray(l.instructor) ? l.instructor[0] : l.instructor,
    }))

    stats = [
      { label: 'My Coaches', value: teacherCount || 0, href: '/dashboard/my-lessons' },
      { label: 'Pending Bookings', value: pendingCount || 0, href: '/dashboard/my-lessons' },
      { label: 'Scheduled Lessons', value: activeLessons.length, href: '/dashboard/my-lessons' },
    ]

    quickActions = [
      {
        label: 'Training Center',
        href: '/dashboard/training-center',
        icon: Music,
        color: 'from-[#CEB466] to-[#9c8644]',
        desc: 'Gamified real-time pitch & scale training',
      },
      {
        label: 'Vocal Courses',
        href: '/dashboard/courses',
        icon: GraduationCap,
        color: 'from-[#a855f7] to-[#7c3aed]',
        desc: 'Masterclass curriculum & optional quizzes',
      },
      {
        label: 'My Lessons',
        href: '/dashboard/my-lessons',
        icon: BookOpen,
        color: 'from-[#e0c97d] to-[#CEB466]',
        desc: 'Live video classroom & coach notes',
      },
      {
        label: 'Find Teacher',
        href: '/dashboard/find-teacher',
        icon: Search,
        color: 'from-[#9c8644] to-[#7d6b36]',
        desc: 'Discover certified vocal coaches',
      },
    ]
  }

  const displayName = profile?.name || profile?.first_name || 'Vocalist'

  return (
    <div className="space-y-6 sm:space-y-8 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Real On-Page Spotlight Tour */}
      <DashboardSpotlight isTeacher={isTeacher} userName={displayName} />

      {/* Welcome Header */}
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
              {isTeacher
                ? 'Manage your student roster, review homework recordings, and launch your live studio classroom.'
                : 'Level up your voice with gamified pitch training, scale drills, and live 1-on-1 coaching.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <SpotlightTriggerButton
              tourKey={isTeacher ? 'teacher_dashboard_v4' : 'student_dashboard_v4'}
              label="How to"
            />

            <Link
              href="/dashboard/training-center"
              className="w-full sm:w-auto py-2.5 sm:py-3 px-4 sm:px-5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold text-xs sm:text-sm shadow-xl shadow-[#CEB466]/20 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Zap className="w-4 h-4" />
              <span>Launch Training Center</span>
            </Link>
          </div>
        </div>

        {/* Live Stats Row */}
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

      {/* Go to Class - Active Live Lessons */}
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
              const person = isTeacher ? lesson.student : lesson.instructor
              const lessonPath = isTeacher
                ? `/dashboard/students/${lesson.id}`
                : `/dashboard/my-lessons/${lesson.id}`

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
                          <p className="text-xs text-gray-400">
                            {isTeacher ? 'Student' : 'Voice Coach'}
                          </p>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                        {lesson.lesson_duration_minutes || 60} Min
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#CEB466] font-medium pt-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {lesson.lesson_day_of_week
                          ? `${lesson.lesson_day_of_week}s at ${lesson.lesson_time || 'TBD'}`
                          : lesson.lesson_time || 'Weekly Scheduled Lesson'}
                      </span>
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

      {/* GAMIFIED PRACTICE TOOLS (Modern Pitch Trainer, Rhythm Trainer, Scale Trainer) */}
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

        {/* 3 Gamey Interactive Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="glass-card-subtle p-5 rounded-3xl border border-white/10 shadow-xl">
            <ModernPitchTrainer variant="card" />
          </div>

          <div className="glass-card-subtle p-5 rounded-3xl border border-white/10 shadow-xl">
            <RhythmTrainer variant="card" />
          </div>

          <div className="glass-card-subtle p-5 rounded-3xl border border-white/10 shadow-xl">
            <ScaleTrainer variant="card" />
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div data-tour="dashboard-quick-actions" className="space-y-4">
        <h2 className="text-xl font-bold text-white font-luxury">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const tourAttr =
              action.href === '/dashboard/courses'
                ? 'dashboard-courses-link'
                : action.href === '/dashboard/training-center'
                ? 'dashboard-reports-link'
                : action.href === '/dashboard/my-lessons' || action.href === '/dashboard/students'
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

      {/* Getting Started Onboarding Card for New Users */}
      {stats.every((s) => s.value === 0) && (
        <div className="glass-card-luxe p-6 sm:p-8 rounded-3xl border border-[#CEB466]/30 space-y-3">
          <div className="flex items-center gap-2 text-[#CEB466]">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="text-lg font-bold text-white font-luxury">Getting Started</h3>
          </div>

          {isTeacher ? (
            <div className="space-y-2 text-xs sm:text-sm text-gray-300">
              <p>Welcome to Voice Alchemy Academy! Here is your quick start checklist:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-400">
                <li>Students discover your profile and request live coaching</li>
                <li>Review and approve student bookings in Pending Requests</li>
                <li>Set up a recurring weekly lesson schedule</li>
                <li>Launch live video lessons with collaborative note-taking</li>
              </ol>
            </div>
          ) : (
            <div className="space-y-2 text-xs sm:text-sm text-gray-300">
              <p>Welcome to Voice Alchemy Academy! Here is how to begin your vocal journey:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-400">
                <li>Explore &ldquo;Find Teacher&rdquo; to book lessons with a certified voice coach</li>
                <li>Practice daily in the interactive arena above (Pitch, Scale, Rhythm)</li>
                <li>Write original songs and record melody ideas in Songwriting</li>
                <li>Join live video lessons with real-time feedback</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
