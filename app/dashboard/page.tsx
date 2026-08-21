import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import Link from 'next/link'
import { Users, BookOpen, Search, Bell, Video, Calendar, Clock, Sparkles, GraduationCap, Music, ArrowRight, CheckCircle2 } from 'lucide-react'
import ModernPitchTrainer from '@/components/ModernPitchTrainer'
import RhythmTrainer from '@/components/RhythmTrainer'
import ScaleTrainer from '@/components/ScaleTrainer'
import ProfileCompletionCard from '@/components/ProfileCompletionCard'
import { TeacherInviteCard } from '@/components/teacher-invite-card'

interface Teacher {
  id: string,
  first_name: string | null,
  last_name: string | null,
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

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatRecurringSchedule(dayOfWeek: number | null, time: string | null): string | null {
  if (dayOfWeek === null || !time) return null
  const day = DAYS_OF_WEEK[dayOfWeek] || 'Unknown'
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `Every ${day} at ${hour12}:${minutes} ${ampm}`
}

function getDisplayName(person: Teacher | Student | undefined): string {
  if (!person) return 'Unknown'
  if (person.name) return person.name
  if (person.first_name || person.last_name) {
    return `${person.first_name || ''} ${person.last_name || ''}`.trim()
  }
  return 'Unknown'
}

function getInitials(person: Teacher | Student | undefined): string {
  const name = getDisplayName(person)
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getCurrentUser()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'instructor' || profile?.role === 'admin'

  // Get stats based on role
  let stats: { label: string; value: string | number; href: string }[] = []
  let quickActions: { label: string; href: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = []
  let activeLessons: ActiveLesson[] = []

  if (isTeacher) {
    // Fetch teacher stats using bookings table
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

    // Fetch active lessons for teacher
    const { data: lessons } = await supabase
      .from('bookings')
      .select(`
        id,
        lesson_day_of_week,
        lesson_time,
        lesson_duration_minutes,
        student:student_id (id, first_name, last_name, name)
      `)
      .eq('instructor_id', profile?.id)
      .eq('status', 'confirmed')
      .limit(3)

    activeLessons = (lessons || []).map((l) => ({
      ...l,
      student: Array.isArray(l.student) ? l.student[0] : l.student,
    }))

    stats = [
      { label: 'Active Students', value: studentCount || 0, href: '/dashboard/students' },
      { label: 'Pending Requests', value: pendingCount || 0, href: '/dashboard/students/requests' },
    ]

    quickActions = [
      { label: 'View Students', href: '/dashboard/students', icon: Users, color: 'from-[#CEB466] to-[#9c8644]' },
      { label: 'Pending Requests', href: '/dashboard/students/requests', icon: Bell, color: 'from-[#9c8644] to-[#7d6b36]' },
    ]
  } else {
    // Fetch student stats using bookings table
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

    // Fetch active lessons for student
    const { data: lessons } = await supabase
      .from('bookings')
      .select(`
        id,
        lesson_day_of_week,
        lesson_time,
        lesson_duration_minutes,
        instructor:instructor_id (id, first_name, last_name, name)
      `)
      .eq('student_id', profile?.id)
      .eq('status', 'confirmed')
      .limit(3)

    activeLessons = (lessons || []).map((l) => ({
      ...l,
      instructor: Array.isArray(l.instructor) ? l.instructor[0] : l.instructor,
    }))

    stats = [
      { label: 'My Teachers', value: teacherCount || 0, href: '/dashboard/my-lessons' },
      { label: 'Pending Requests', value: pendingCount || 0, href: '/dashboard/my-lessons' },
    ]

    quickActions = [
      { label: 'My Lessons', href: '/dashboard/my-lessons', icon: BookOpen, color: 'from-[#CEB466] to-[#9c8644]' },
      { label: 'Find Teacher', href: '/dashboard/find-teacher', icon: Search, color: 'from-[#9c8644] to-[#7d6b36]' },
    ]
  }

  const displayName = profile?.name || profile?.first_name || 'there'
  const needsProfileCompletion = !profile?.first_name || !profile?.last_name

  return (
    <div className="space-y-8">
      {needsProfileCompletion && <ProfileCompletionCard />}

      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {displayName}!
        </h1>
        <p className="text-gray-400 mt-2">
          {isTeacher
            ? 'Manage your studio, students, courses, and lessons'
            : 'Continue your vocal training and academy journey'}
        </p>
      </div>

      {/* Teacher Invite Engine */}
      {isTeacher && profile && (
        <TeacherInviteCard teacherId={profile.id} teacherName={displayName} />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6 hover:bg-white/10 hover:border-white/20 transition-all group"
          >
            <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">{stat.label}</p>
            <p className="text-3xl font-bold text-white mt-2 group-hover:text-[#CEB466] transition-colors">{stat.value}</p>
          </Link>
        ))}
      </div>

      {/* Go to Class - Active Lessons */}
      {activeLessons.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Video className="w-5 h-5 text-[#CEB466]" />
            Go to Class
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeLessons.map((lesson) => {
              const person = isTeacher ? lesson.student : lesson.instructor
              const lessonPath = isTeacher
                ? `/dashboard/students/${lesson.id}`
                : `/dashboard/my-lessons/${lesson.id}`

              return (
                <div
                  key={lesson.id}
                  className="bg-gradient-to-br from-[#CEB466]/10 to-[#9c8644]/10 backdrop-blur-sm rounded-xl border border-[#CEB466]/30 p-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold">
                      {getInitials(person)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{getDisplayName(person)}</h3>
                      <p className="text-sm text-gray-400">
                        {isTeacher ? 'Student' : 'Teacher'}
                      </p>
                    </div>
                  </div>

                  {formatRecurringSchedule(lesson.lesson_day_of_week, lesson.lesson_time) && (
                    <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span>{formatRecurringSchedule(lesson.lesson_day_of_week, lesson.lesson_time)}</span>
                    </div>
                  )}

                  {lesson.lesson_duration_minutes && (
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{lesson.lesson_duration_minutes} minutes</span>
                    </div>
                  )}

                  <Link
                    href={lessonPath}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-semibold rounded-lg transition-all"
                  >
                    <Video className="w-5 h-5" />
                    <span>Go to Class</span>
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`bg-gradient-to-br ${action.color} rounded-xl p-6 hover:scale-105 transition-transform shadow-lg`}
            >
              <action.icon className="w-8 h-8 text-[#171229] mb-3" />
              <p className="text-lg font-semibold text-[#171229]">{action.label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Practice Tools */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Music className="w-5 h-5 text-[#CEB466]" />
            Practice & Warmup Tools
          </h2>
          <Link
            href="/dashboard/training-center"
            className="text-xs font-semibold text-[#CEB466] hover:text-[#e0c97d] flex items-center gap-1 transition-colors"
          >
            <span>View Full Analytics</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ModernPitchTrainer variant="card" />
          <RhythmTrainer variant="card" />
          <ScaleTrainer variant="card" />
        </div>
      </div>

      {/* Getting Started Launchpad for new users */}
      {stats.every(s => s.value === 0) && (
        <div className="glass-card-gold rounded-2xl border border-[#CEB466]/40 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#CEB466]/20 flex items-center justify-center text-[#CEB466]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Getting Started Guide</h2>
              <p className="text-sm text-gray-300">Quick steps to get the most out of Voice Alchemy Academy</p>
            </div>
          </div>

          {isTeacher ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-black/30 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-[#CEB466]/20 text-[#CEB466] font-bold flex items-center justify-center text-sm mb-3">
                    1
                  </div>
                  <h3 className="font-semibold text-white mb-1">Invite Your Students</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Copy your studio link above to onboard your students in 1 tap.
                  </p>
                </div>
                <Link
                  href="/dashboard/students"
                  className="mt-4 text-xs font-semibold text-[#CEB466] hover:text-[#e0c97d] flex items-center gap-1"
                >
                  <span>View Student List</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="bg-black/30 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-[#CEB466]/20 text-[#CEB466] font-bold flex items-center justify-center text-sm mb-3">
                    2
                  </div>
                  <h3 className="font-semibold text-white mb-1">Create Video Courses</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Build modules and assign drills to all your students in the Course Studio.
                  </p>
                </div>
                <Link
                  href="/dashboard/courses/studio"
                  className="mt-4 text-xs font-semibold text-[#CEB466] hover:text-[#e0c97d] flex items-center gap-1"
                >
                  <span>Open Course Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="bg-black/30 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-[#CEB466]/20 text-[#CEB466] font-bold flex items-center justify-center text-sm mb-3">
                    3
                  </div>
                  <h3 className="font-semibold text-white mb-1">Live Classes & AI Notes</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Host WebRTC video lessons with live collaborative notes and AI recap transcripts.
                  </p>
                </div>
                <Link
                  href="/dashboard/training-center"
                  className="mt-4 text-xs font-semibold text-[#CEB466] hover:text-[#e0c97d] flex items-center gap-1"
                >
                  <span>Check Training Center</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-black/30 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-[#CEB466]/20 text-[#CEB466] font-bold flex items-center justify-center text-sm mb-3">
                    1
                  </div>
                  <h3 className="font-semibold text-white mb-1">Find Your Vocal Mentor</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Browse certified academy teachers and send a request for private lessons.
                  </p>
                </div>
                <Link
                  href="/dashboard/find-teacher"
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#CEB466] text-[#171229] font-bold text-xs hover:bg-[#e0c97d] transition-all w-fit"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Find a Teacher</span>
                </Link>
              </div>

              <div className="bg-black/30 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-[#CEB466]/20 text-[#CEB466] font-bold flex items-center justify-center text-sm mb-3">
                    2
                  </div>
                  <h3 className="font-semibold text-white mb-1">Academy Masterclasses</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Access self-paced video modules covering breath support, mix voice, and raga drills.
                  </p>
                </div>
                <Link
                  href="/dashboard/courses"
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 text-white font-semibold text-xs hover:bg-white/20 transition-all w-fit"
                >
                  <GraduationCap className="w-3.5 h-3.5 text-[#CEB466]" />
                  <span>Explore Courses</span>
                </Link>
              </div>

              <div className="bg-black/30 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-[#CEB466]/20 text-[#CEB466] font-bold flex items-center justify-center text-sm mb-3">
                    3
                  </div>
                  <h3 className="font-semibold text-white mb-1">Daily Vocal Drills</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Train pitch accuracy and rhythm consistency with instant Web Audio feedback.
                  </p>
                </div>
                <Link
                  href="/dashboard/training-center"
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 text-white font-semibold text-xs hover:bg-white/20 transition-all w-fit"
                >
                  <Music className="w-3.5 h-3.5 text-[#CEB466]" />
                  <span>Open Training Center</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
