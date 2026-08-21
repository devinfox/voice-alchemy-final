import Link from 'next/link'
import { GraduationCap, Lock, PlayCircle } from 'lucide-react'
import { courses, getCourseLessonCount } from '@/lib/courses'

export default function CoursesPage() {
  return (
    <div className="p-6 space-y-6">
      <section className="glass-card rounded-2xl border-white/[0.08] p-6">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#a855f7]/25">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          Courses
        </h1>
        <p className="text-slate-400 mt-2">
          Pick a course card to enter the class. Locked courses stay visible in your roadmap.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {courses.map((course) => {
          const lessonCount = getCourseLessonCount(course)

          const content = (
            <article
              className={`rounded-2xl border p-5 h-full transition-all ${
                course.isUnlocked
                  ? 'glass-card-subtle border-white/[0.1] hover:border-[#a855f7]/35 hover:bg-white/[0.06] cursor-pointer'
                  : 'border-white/[0.08] bg-white/[0.02] opacity-80 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    course.isUnlocked
                      ? 'bg-green-500/20 text-green-300 border-green-500/30'
                      : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
                  }`}
                >
                  {course.isUnlocked ? 'Unlocked' : 'Locked'}
                </span>
                {!course.isUnlocked && <Lock className="w-4 h-4 text-slate-500" />}
              </div>

              <h2 className="text-xl font-semibold text-white">{course.title}</h2>
              <p className="text-[#d8b4fe] text-sm mt-1">{course.subtitle}</p>
              <p className="text-slate-300 mt-3 text-sm leading-relaxed">{course.description}</p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.08]">
                  {lessonCount > 0 ? `${lessonCount} lessons` : 'Coming soon'}
                </span>
                <span className="px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.08]">{course.level}</span>
              </div>

              {course.isUnlocked && (
                <div className="mt-5 inline-flex items-center gap-2 text-sm text-[#e9d5ff]">
                  <PlayCircle className="w-4 h-4" />
                  Open class
                </div>
              )}
            </article>
          )

          if (course.isUnlocked) {
            return (
              <Link key={course.slug} href={`/dashboard/courses/${course.slug}`} className="block">
                {content}
              </Link>
            )
          }

          return (
            <div key={course.slug} aria-disabled className="block">
              {content}
            </div>
          )
        })}
      </section>
    </div>
  )
}
