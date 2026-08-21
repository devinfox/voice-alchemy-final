'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState, useRef } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  PlayCircle,
  PauseCircle,
  Music,
  FileText,
  Paperclip,
  Download,
  Repeat,
  Sparkles,
  Layers,
  Check,
  FileMusic,
  Mic,
} from 'lucide-react'
import {
  getCourseBySlug,
  parseVideoEmbedUrl,
  type Course,
  type CourseLesson,
} from '@/lib/courses'

interface LessonPointer {
  sectionId: string
  sectionTitle: string
  lesson: CourseLesson
  index: number
}

function getProgressKey(slug: string) {
  return `course-progress:${slug}`
}

function getPracticeCheckKey(slug: string, lessonId: string) {
  return `course-practice:${slug}:${lessonId}`
}

export default function CoursePlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [course, setCourse] = useState<Course | null>(() => getCourseBySlug(slug) || null)
  const [isLoading, setIsLoading] = useState(!course)

  // Fetch course from API if not matched statically or for dynamic teacher courses
  useEffect(() => {
    async function loadCourse() {
      try {
        const res = await fetch(`/api/courses/${slug}`)
        if (res.ok) {
          const data = await res.json()
          if (data.course) {
            setCourse(data.course)
          }
        }
      } catch (err) {
        console.error('Failed to load dynamic course:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadCourse()
  }, [slug])

  const lessonPointers = useMemo<LessonPointer[]>(() => {
    if (!course || !course.sections) return []
    return course.sections.flatMap((section) =>
      (section.lessons || []).map((lesson, idx) => ({
        sectionId: section.id,
        sectionTitle: section.title,
        lesson,
        index: idx,
      }))
    )
  }, [course])

  const defaultExpanded = useMemo<Record<string, boolean>>(() => {
    if (!course || !course.sections) return {}
    return Object.fromEntries(course.sections.map((section, idx) => [section.id, idx === 0]))
  }, [course])

  const defaultLessonId = course?.sections?.[0]?.lessons?.[0]?.id ?? ''

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(defaultExpanded)
  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    if (!course || typeof window === 'undefined') return defaultLessonId
    try {
      const saved = localStorage.getItem(getProgressKey(course.slug))
      if (!saved) return defaultLessonId
      const parsed = JSON.parse(saved) as { activeLessonId?: string }
      return parsed.activeLessonId || defaultLessonId
    } catch {
      return defaultLessonId
    }
  })

  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>(() => {
    if (!course || typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(getProgressKey(course.slug))
      if (!saved) return []
      const parsed = JSON.parse(saved) as { completedLessonIds?: string[] }
      return parsed.completedLessonIds || []
    } catch {
      return []
    }
  })

  // Synchronize defaults if course finishes loading asynchronously
  useEffect(() => {
    if (course && !activeLessonId && course.sections?.[0]?.lessons?.[0]?.id) {
      setActiveLessonId(course.sections[0].lessons[0].id)
      setExpandedSections(Object.fromEntries(course.sections.map((s, i) => [s.id, i === 0])))
    }
  }, [course, activeLessonId])

  // Save progress to local storage
  useEffect(() => {
    if (!course) return
    localStorage.setItem(
      getProgressKey(course.slug),
      JSON.stringify({ completedLessonIds, activeLessonId })
    )
  }, [course, completedLessonIds, activeLessonId])

  // Active Lesson Pointer
  const activePointer =
    lessonPointers.find((item) => item.lesson.id === activeLessonId) || lessonPointers[0]
  const activeLesson = activePointer?.lesson
  const activeLessonIndex = lessonPointers.findIndex((item) => item.lesson.id === activeLesson?.id)
  const totalLessons = lessonPointers.length
  const completedCount = completedLessonIds.length
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  // Interactive singer practice checkboxes for the current lesson
  const [checkedPracticeIndices, setCheckedPracticeIndices] = useState<number[]>([])

  useEffect(() => {
    if (!course || !activeLesson) return
    try {
      const saved = localStorage.getItem(getPracticeCheckKey(course.slug, activeLesson.id))
      setCheckedPracticeIndices(saved ? JSON.parse(saved) : [])
    } catch {
      setCheckedPracticeIndices([])
    }
  }, [course, activeLesson])

  const togglePracticeCheck = (idx: number) => {
    if (!course || !activeLesson) return
    const updated = checkedPracticeIndices.includes(idx)
      ? checkedPracticeIndices.filter((i) => i !== idx)
      : [...checkedPracticeIndices, idx]
    setCheckedPracticeIndices(updated)
    localStorage.setItem(getPracticeCheckKey(course.slug, activeLesson.id), JSON.stringify(updated))
  }

  // Audio Player State for Vocal Drill
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [isLoopingAudio, setIsLoopingAudio] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Reset audio state when changing lesson
    setIsPlayingAudio(false)
    setAudioProgress(0)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [activeLessonId])

  const togglePlayAudio = () => {
    if (!audioRef.current) return
    if (isPlayingAudio) {
      audioRef.current.pause()
      setIsPlayingAudio(false)
    } else {
      audioRef.current.play()
      setIsPlayingAudio(true)
    }
  }

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioProgress(audioRef.current.currentTime)
      setAudioDuration(audioRef.current.duration || 0)
    }
  }

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = val
      setAudioProgress(val)
    }
  }

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec === 0) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // Navigation handlers
  const goToLesson = (lessonId: string) => setActiveLessonId(lessonId)

  const markComplete = () => {
    if (!activeLesson) return
    setCompletedLessonIds((prev) =>
      prev.includes(activeLesson.id) ? prev : [...prev, activeLesson.id]
    )
  }

  const goNext = () => {
    if (activeLessonIndex < 0 || activeLessonIndex >= lessonPointers.length - 1) return
    setActiveLessonId(lessonPointers[activeLessonIndex + 1].lesson.id)
  }

  const goPrev = () => {
    if (activeLessonIndex <= 0) return
    setActiveLessonId(lessonPointers[activeLessonIndex - 1].lesson.id)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="glass-card rounded-2xl border-white/[0.08] p-12 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400">Loading masterclass curriculum...</p>
        </div>
      </div>
    )
  }

  if (!course || !course.isUnlocked) {
    return (
      <div className="p-6">
        <div className="glass-card rounded-2xl border-white/[0.08] p-8 text-center space-y-3">
          <p className="text-slate-300 font-medium">This course is not available yet.</p>
          <Link
            href="/dashboard/courses"
            className="inline-flex items-center gap-2 mt-4 text-[#d8b4fe] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Courses
          </Link>
        </div>
      </div>
    )
  }

  const videoParsed = activeLesson?.videoUrl ? parseVideoEmbedUrl(activeLesson.videoUrl) : null

  return (
    <div className="p-6 space-y-6">
      {/* Course Banner Header */}
      <section className="glass-card rounded-2xl border-white/[0.08] p-6">
        <Link
          href="/dashboard/courses"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Courses
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mt-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#d8b4fe] uppercase tracking-wider">
                {course.category}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-xs text-slate-400">{course.level}</span>
            </div>
            <h1 className="text-3xl font-bold text-white mt-1">{course.title}</h1>
            <p className="text-[#d8b4fe] mt-1">{course.subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-right">
              <p className="text-[11px] text-slate-500">Instructor</p>
              <p className="text-sm font-semibold text-white">{course.instructor}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500 text-xs">Total Modules</p>
            <p className="text-white font-semibold">{course.sections?.length || 0}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500 text-xs">Total Lessons</p>
            <p className="text-white font-semibold">{totalLessons}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500 text-xs">Completed</p>
            <p className="text-white font-semibold">
              {completedCount} of {totalLessons}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-slate-500 text-xs">Progress</p>
            <p className="text-white font-semibold">{progressPercent}%</p>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#a855f7] to-[#7c3aed] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </section>

      {/* Main Studio Viewport */}
      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        {/* Left Column: Lesson Player & Content */}
        <div className="space-y-6">
          {/* Lesson Header Title Card */}
          <div className="glass-card rounded-2xl border-white/[0.08] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-[#d8b4fe]">
                  {activePointer?.sectionTitle} • Lesson {activeLessonIndex + 1} of {totalLessons}
                </span>
                <h2 className="text-2xl font-bold text-white mt-1">
                  {activeLesson?.title || 'Lesson Overview'}
                </h2>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.05] border border-white/[0.08] text-slate-300 flex items-center gap-1.5 shrink-0">
                <Clock3 className="w-3.5 h-3.5" />
                {activeLesson?.duration || '10 min'}
              </span>
            </div>

            {activeLesson?.summary && (
              <p className="text-slate-300 mt-3 text-sm leading-relaxed">{activeLesson.summary}</p>
            )}
          </div>

          {/* Video Player (If video exists) */}
          {activeLesson?.videoUrl && videoParsed && (
            <div className="glass-card rounded-2xl border-white/[0.08] overflow-hidden">
              <div className="aspect-video w-full bg-black relative">
                {videoParsed.provider === 'direct' ? (
                  <video
                    src={activeLesson.videoUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <iframe
                    src={videoParsed.embedUrl}
                    title={activeLesson.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                )}
              </div>
            </div>
          )}

          {/* Vocal Audio Drill & Backing Track Player */}
          {activeLesson?.audioDrill?.audioUrl && (
            <div className="glass-card rounded-2xl border-[#a855f7]/30 bg-gradient-to-br from-[#a855f7]/15 via-slate-900 to-black p-6 space-y-4 shadow-xl">
              <audio
                ref={audioRef}
                src={activeLesson.audioDrill.audioUrl}
                loop={isLoopingAudio}
                onTimeUpdate={handleAudioTimeUpdate}
                onLoadedMetadata={handleAudioTimeUpdate}
                onEnded={() => {
                  if (!isLoopingAudio) setIsPlayingAudio(false)
                }}
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#a855f7]/30">
                    <Music className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {activeLesson.audioDrill.title || 'Vocal Exercise Audio Drill'}
                    </h3>
                    <p className="text-xs text-slate-400">Interactive Sing-Along Backing Track</p>
                  </div>
                </div>

                {/* Vocal badges */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {activeLesson.audioDrill.targetKey && (
                    <span className="px-2.5 py-1 rounded-lg bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#d8b4fe] font-semibold">
                      🎵 {activeLesson.audioDrill.targetKey}
                    </span>
                  )}
                  {activeLesson.audioDrill.scaleType && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-200">
                      🎼 {activeLesson.audioDrill.scaleType}
                    </span>
                  )}
                  {activeLesson.audioDrill.bpm && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-200">
                      ⏱️ {activeLesson.audioDrill.bpm} BPM
                    </span>
                  )}
                  {activeLesson.audioDrill.range && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-200">
                      🎙️ {activeLesson.audioDrill.range}
                    </span>
                  )}
                </div>
              </div>

              {/* Audio Controls Bar */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlayAudio}
                    className="p-3 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white shadow-lg shadow-[#a855f7]/30 hover:scale-105 transition-transform"
                  >
                    {isPlayingAudio ? (
                      <PauseCircle className="w-6 h-6" />
                    ) : (
                      <PlayCircle className="w-6 h-6" />
                    )}
                  </button>

                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={audioDuration || 100}
                      value={audioProgress}
                      onChange={handleAudioSeek}
                      className="w-full accent-[#a855f7] cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>{formatSeconds(audioProgress)}</span>
                      <span>{formatSeconds(audioDuration)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsLoopingAudio(!isLoopingAudio)}
                    className={`p-2 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                      isLoopingAudio
                        ? 'bg-[#a855f7]/30 border-[#a855f7]/50 text-white'
                        : 'border-white/[0.08] text-slate-400 hover:text-white'
                    }`}
                  >
                    <Repeat className="w-4 h-4" />
                    <span className="hidden sm:inline">Loop Drill</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lesson Breakdown Text & Instruction */}
          {activeLesson?.body && activeLesson.body.length > 0 && (
            <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#d8b4fe]" />
                Lesson Breakdown & Mechanics
              </h3>
              <div className="space-y-3 text-slate-300 text-sm leading-relaxed">
                {activeLesson.body.map((paragraph, pIdx) => (
                  <p key={pIdx}>{paragraph}</p>
                ))}
              </div>
            </div>
          )}

          {/* Key Takeaways */}
          {activeLesson?.keyPoints && activeLesson.keyPoints.length > 0 && (
            <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#d8b4fe]" />
                Key Concepts & Rules
              </h3>
              <ul className="space-y-2.5">
                {activeLesson.keyPoints.map((point, kIdx) => (
                  <li key={kIdx} className="text-sm text-slate-300 flex items-start gap-2.5">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-[#a855f7] shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Interactive Singer Practice Checklist */}
          {activeLesson?.practice && activeLesson.practice.length > 0 && (
            <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Mic className="w-5 h-5 text-[#d8b4fe]" />
                  Vocal Practice Assignments
                </h3>
                <span className="text-xs text-slate-400">
                  {checkedPracticeIndices.length}/{activeLesson.practice.length} Completed
                </span>
              </div>

              <div className="space-y-2">
                {activeLesson.practice.map((drill, prIdx) => {
                  const isChecked = checkedPracticeIndices.includes(prIdx)

                  return (
                    <button
                      key={prIdx}
                      type="button"
                      onClick={() => togglePracticeCheck(prIdx)}
                      className={`w-full p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                        isChecked
                          ? 'bg-green-500/10 border-green-500/30 text-slate-200'
                          : 'bg-white/[0.02] border-white/[0.08] text-slate-300 hover:border-white/[0.15]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                          isChecked
                            ? 'bg-green-500 border-green-400 text-black'
                            : 'border-white/30 bg-white/[0.05]'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <span className={`text-sm ${isChecked ? 'line-through text-slate-400' : ''}`}>
                        {drill}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Downloadable Resources & Sheet Music */}
          {activeLesson?.attachments && activeLesson.attachments.length > 0 && (
            <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-[#d8b4fe]" />
                Downloadable Sheet Music & Resources
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeLesson.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-[#a855f7]/40 flex items-center justify-between gap-3 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <FileMusic className="w-5 h-5 text-[#d8b4fe] shrink-0" />
                      <span className="text-sm font-medium text-white truncate group-hover:text-[#d8b4fe]">
                        {att.name}
                      </span>
                    </div>
                    <Download className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Lesson Navigation Buttons Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={goPrev}
              disabled={activeLessonIndex <= 0}
              className="px-4 py-2.5 rounded-xl glass-button text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous Lesson
            </button>

            <button
              onClick={markComplete}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white font-semibold text-sm shadow-lg shadow-[#a855f7]/25 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Lesson Complete
            </button>

            <button
              onClick={goNext}
              disabled={activeLessonIndex >= lessonPointers.length - 1}
              className="px-4 py-2.5 rounded-xl glass-button text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next Lesson
            </button>
          </div>
        </div>

        {/* Right Sticky Sidebar: Course Curriculum */}
        <aside className="glass-card-subtle rounded-2xl border-white/[0.08] p-5 h-fit xl:sticky xl:top-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#d8b4fe]" />
                Curriculum
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {totalLessons} lessons • {completedCount} completed
              </p>
            </div>
            <span className="text-xs font-bold text-[#d8b4fe] bg-[#a855f7]/20 px-2.5 py-1 rounded-full border border-[#a855f7]/40">
              {progressPercent}%
            </span>
          </div>

          <div className="space-y-2.5 max-h-[650px] overflow-y-auto pr-1">
            {course.sections.map((section) => {
              const isOpen = expandedSections[section.id] ?? false
              const completedInSection = (section.lessons || []).filter((lesson) =>
                completedLessonIds.includes(lesson.id)
              ).length

              return (
                <div
                  key={section.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedSections((prev) => ({ ...prev, [section.id]: !isOpen }))
                    }
                    className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{section.title}</p>
                      <p className="text-xs text-slate-400">
                        {completedInSection}/{section.lessons?.length || 0} completed
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-white/[0.08]">
                      {(section.lessons || []).map((lesson) => {
                        const isActive = activeLessonId === lesson.id
                        const isComplete = completedLessonIds.includes(lesson.id)

                        return (
                          <button
                            key={lesson.id}
                            onClick={() => goToLesson(lesson.id)}
                            className={`w-full px-3.5 py-2.5 text-left border-b last:border-b-0 border-white/[0.06] transition-colors ${
                              isActive ? 'bg-[#a855f7]/20 border-l-2 border-l-[#a855f7]' : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              {isComplete ? (
                                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                              ) : (
                                <Circle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p
                                  className={`text-sm ${
                                    isActive ? 'text-[#e9d5ff] font-semibold' : 'text-slate-200'
                                  }`}
                                >
                                  {lesson.title}
                                </p>
                                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                  <Clock3 className="w-3 h-3" />
                                  <span>{lesson.duration}</span>
                                  {lesson.format === 'video' && <span className="text-blue-400">• Video</span>}
                                  {lesson.format === 'audio_drill' && <span className="text-purple-400">• Vocal Drill</span>}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>
      </section>
    </div>
  )
}
