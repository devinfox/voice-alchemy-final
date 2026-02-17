import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import Link from 'next/link'
import { Users, BookOpen, Search, Bell, Video, Calendar, Clock } from 'lucide-react'
import ModernPitchTrainer from '@/components/ModernPitchTrainer'
import SongPitchTrainer from '@/components/SongPitchTrainer'
import RhythmTrainer from '@/components/RhythmTrainer'

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
  scheduled_at: string | null
  duration_minutes: number | null
  instructor?: Teacher
  student?: Student
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
        scheduled_at,
        duration_minutes,
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
        scheduled_at,
        duration_minutes,
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

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {displayName}!
        </h1>
        <p className="text-gray-400 mt-2">
          {isTeacher
            ? 'Manage your students and lessons'
            : 'Continue your voice lessons'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6 hover:bg-white/10 hover:border-white/20 transition-all"
          >
            <p className="text-sm text-gray-400">{stat.label}</p>
            <p className="text-3xl font-bold text-white mt-2">{stat.value}</p>
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

                  {lesson.scheduled_at && (
                    <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span>
                        {new Date(lesson.scheduled_at).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}

                  {lesson.duration_minutes && (
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{lesson.duration_minutes} minutes</span>
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
              className={`bg-gradient-to-br ${action.color} rounded-xl p-6 hover:scale-105 transition-transform`}
            >
              <action.icon className="w-8 h-8 text-[#171229] mb-3" />
              <p className="text-lg font-semibold text-[#171229]">{action.label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Practice Tools */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Practice Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ModernPitchTrainer variant="card" />
          <RhythmTrainer variant="card" />
          <SongPitchTrainer variant="card" />
        </div>
      </div>

      {/* Getting Started Guide for new users */}
      {stats.every(s => s.value === 0) && (
        <div className="bg-gradient-to-br from-[#CEB466]/20 to-[#9c8644]/10 backdrop-blur-sm rounded-xl border border-[#CEB466]/30 p-6">
          <h2 className="text-xl font-semibold text-white mb-2">Getting Started</h2>
          {isTeacher ? (
            <div className="text-gray-300 space-y-2">
              <p>Welcome to Voice Lesson Studio! Here&apos;s how to get started:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-400">
                <li>Students will find you and request to join your lessons</li>
                <li>Review and approve student requests from the pending requests page</li>
                <li>Set up a lesson schedule for each student</li>
                <li>Start video lessons and take collaborative notes together</li>
              </ol>
            </div>
          ) : (
            <div className="text-gray-300 space-y-2">
              <p>Welcome to Voice Lesson Studio! Here&apos;s how to get started:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-400">
                <li>Use &quot;Find Teacher&quot; to search for voice teachers</li>
                <li>Request to join a teacher&apos;s lessons</li>
                <li>Once approved, you&apos;ll see your scheduled lessons</li>
                <li>Join video lessons and collaborate on notes with your teacher</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
