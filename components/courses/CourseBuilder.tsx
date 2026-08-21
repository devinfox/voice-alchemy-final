'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import {
  GraduationCap,
  Sparkles,
  Layers,
  Video,
  Music,
  FileText,
  Paperclip,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  CheckCircle2,
  Save,
  ArrowRight,
  ArrowLeft,
  Mic,
  AlertCircle,
  Check,
  X,
  FileMusic,
} from 'lucide-react'
import {
  VOCAL_COURSE_CATEGORIES,
  VOCAL_KEYS,
  VOCAL_SCALE_TYPES,
  type Course,
  type CourseSection,
  type CourseLesson,
  type LessonFormat,
  type LessonAttachment,
} from '@/lib/courses'

interface CourseBuilderProps {
  initialCourse?: Partial<Course>
  onSaveComplete?: (savedCourse: Course) => void
  onCancel?: () => void
}

export function CourseBuilder({ initialCourse, onSaveComplete, onCancel }: CourseBuilderProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [activeSectionIdx, setActiveSectionIdx] = useState<number>(0)
  const [activeLessonIdx, setActiveLessonIdx] = useState<number>(0)
  const [uploadingField, setUploadingField] = useState<string | null>(null)

  // Step 1: Course Info
  const [title, setTitle] = useState(initialCourse?.title || '')
  const [subtitle, setSubtitle] = useState(initialCourse?.subtitle || '')
  const [description, setDescription] = useState(initialCourse?.description || '')
  const [category, setCategory] = useState(initialCourse?.category || VOCAL_COURSE_CATEGORIES[0])
  const [level, setLevel] = useState<Course['level']>(initialCourse?.level || 'Beginner')
  const [thumbnailUrl, setThumbnailUrl] = useState(initialCourse?.thumbnailUrl || '')
  const [previewVideoUrl, setPreviewVideoUrl] = useState(initialCourse?.previewVideoUrl || '')
  const [isFree, setIsFree] = useState(initialCourse?.isFree ?? true)
  const [price, setPrice] = useState(initialCourse?.price || 0)
  const [estimatedDuration, setEstimatedDuration] = useState(initialCourse?.estimatedDuration || '2 hours')

  // Outcomes & Requirements
  const [whatYouWillLearn, setWhatYouWillLearn] = useState<string[]>(
    initialCourse?.whatYouWillLearn && initialCourse.whatYouWillLearn.length > 0
      ? initialCourse.whatYouWillLearn
      : ['']
  )
  const [requirements, setRequirements] = useState<string[]>(
    initialCourse?.requirements && initialCourse.requirements.length > 0
      ? initialCourse.requirements
      : ['Quiet practice space', 'Headphones & recording device']
  )

  // Step 2: Curriculum
  const [sections, setSections] = useState<CourseSection[]>(
    initialCourse?.sections && initialCourse.sections.length > 0
      ? initialCourse.sections
      : [
          {
            id: 'section-1',
            title: 'Module 1: Foundations & Breath Alignment',
            description: 'Core breath support, vocal tract acoustics, and healthy phonation onset.',
            lessons: [
              {
                id: 'lesson-1-1',
                title: 'Introduction & Anatomy of the Singing Voice',
                duration: '10 min',
                format: 'hybrid',
                summary: 'Welcome to the course. Learn the mechanical foundation of strain-free tone.',
                body: [
                  'Welcome! In this lesson we establish the core principles of vocal efficiency.',
                  'Singing without strain requires balanced subglottic pressure and relaxed vocal fold vibration.',
                ],
                keyPoints: [
                  'Never sing through throat constriction or pain',
                  'Support is airflow management, not muscle squeezing',
                ],
                practice: [
                  'Record a 30-second speaking to singing phrase baseline',
                  'Perform 3 sets of 10-second silent inhalation exercises',
                ],
              },
            ],
          },
        ]
  )

  // Step 3: Publish status
  const [isPublished, setIsPublished] = useState(initialCourse?.isPublished ?? false)

  // File Upload Helper
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [activeUploadContext, setActiveUploadContext] = useState<{
    purpose: string
    sectionIdx?: number
    lessonIdx?: number
    field?: string
  } | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeUploadContext) return

    try {
      setUploadingField(activeUploadContext.purpose)
      setErrorMsg(null)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('purpose', activeUploadContext.purpose)

      const res = await fetch('/api/courses/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      if (activeUploadContext.purpose === 'thumbnail') {
        setThumbnailUrl(data.url)
      } else if (activeUploadContext.purpose === 'preview_video') {
        setPreviewVideoUrl(data.url)
      } else if (
        activeUploadContext.sectionIdx !== undefined &&
        activeUploadContext.lessonIdx !== undefined
      ) {
        const sIdx = activeUploadContext.sectionIdx
        const lIdx = activeUploadContext.lessonIdx
        const targetLesson = { ...sections[sIdx].lessons[lIdx] }

        if (activeUploadContext.field === 'videoUrl') {
          targetLesson.videoUrl = data.url
        } else if (activeUploadContext.field === 'audioDrill') {
          targetLesson.audioDrill = {
            ...targetLesson.audioDrill,
            audioUrl: data.url,
            title: targetLesson.audioDrill?.title || file.name.replace(/\.[^/.]+$/, ''),
          }
        } else if (activeUploadContext.field === 'attachment') {
          const newAtt: LessonAttachment = {
            id: `att-${Date.now()}`,
            name: file.name,
            url: data.url,
            fileType: file.type.includes('pdf') ? 'pdf' : file.type.includes('audio') ? 'audio' : 'sheet_music',
            sizeBytes: data.sizeBytes,
          }
          targetLesson.attachments = [...(targetLesson.attachments || []), newAtt]
        }

        const updatedSections = [...sections]
        updatedSections[sIdx].lessons[lIdx] = targetLesson
        setSections(updatedSections)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'File upload failed'
      console.error('File upload error:', err)
      setErrorMsg(message)
    } finally {
      setUploadingField(null)
      setActiveUploadContext(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const triggerUpload = (context: {
    purpose: string
    sectionIdx?: number
    lessonIdx?: number
    field?: string
  }) => {
    setActiveUploadContext(context)
    fileInputRef.current?.click()
  }

  // Section & Lesson Helpers
  const addSection = () => {
    const newSecNum = sections.length + 1
    const newSection: CourseSection = {
      id: `section-${Date.now()}`,
      title: `Module ${newSecNum}: Untitled Module`,
      description: '',
      lessons: [
        {
          id: `lesson-${Date.now()}-1`,
          title: 'Lesson 1',
          duration: '10 min',
          format: 'hybrid',
          summary: '',
          body: [''],
          keyPoints: [''],
          practice: [''],
        },
      ],
    }
    setSections([...sections, newSection])
    setActiveSectionIdx(sections.length)
    setActiveLessonIdx(0)
  }

  const removeSection = (idx: number) => {
    if (sections.length <= 1) {
      alert('A course must have at least one module/section.')
      return
    }
    const updated = sections.filter((_, i) => i !== idx)
    setSections(updated)
    setActiveSectionIdx(Math.max(0, idx - 1))
    setActiveLessonIdx(0)
  }

  const moveSection = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === sections.length - 1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const updated = [...sections]
    const temp = updated[idx]
    updated[idx] = updated[targetIdx]
    updated[targetIdx] = temp
    setSections(updated)
    setActiveSectionIdx(targetIdx)
  }

  const addLesson = (sectionIdx: number) => {
    const s = sections[sectionIdx]
    const newLessonNum = s.lessons.length + 1
    const newLesson: CourseLesson = {
      id: `lesson-${Date.now()}`,
      title: `Lesson ${newLessonNum}: New Vocal Drill`,
      duration: '12 min',
      format: 'hybrid',
      summary: '',
      body: [''],
      keyPoints: [''],
      practice: [''],
    }
    const updatedSections = [...sections]
    updatedSections[sectionIdx].lessons = [...s.lessons, newLesson]
    setSections(updatedSections)
    setActiveLessonIdx(updatedSections[sectionIdx].lessons.length - 1)
  }

  const removeLesson = (sectionIdx: number, lessonIdx: number) => {
    const s = sections[sectionIdx]
    if (s.lessons.length <= 1) {
      alert('A section must have at least one lesson.')
      return
    }
    const updatedLessons = s.lessons.filter((_, i) => i !== lessonIdx)
    const updatedSections = [...sections]
    updatedSections[sectionIdx].lessons = updatedLessons
    setSections(updatedSections)
    setActiveLessonIdx(Math.max(0, lessonIdx - 1))
  }

  const moveLesson = (sectionIdx: number, lessonIdx: number, direction: 'up' | 'down') => {
    const lessons = sections[sectionIdx].lessons
    if (direction === 'up' && lessonIdx === 0) return
    if (direction === 'down' && lessonIdx === lessons.length - 1) return
    const targetIdx = direction === 'up' ? lessonIdx - 1 : lessonIdx + 1
    const updatedLessons = [...lessons]
    const temp = updatedLessons[lessonIdx]
    updatedLessons[lessonIdx] = updatedLessons[targetIdx]
    updatedLessons[targetIdx] = temp
    const updatedSections = [...sections]
    updatedSections[sectionIdx].lessons = updatedLessons
    setSections(updatedSections)
    setActiveLessonIdx(targetIdx)
  }

  // Active lesson editor access
  const currentSection = sections[activeSectionIdx] || sections[0]
  const currentLesson = currentSection?.lessons?.[activeLessonIdx] || currentSection?.lessons?.[0]

  const updateCurrentLesson = (patch: Partial<CourseLesson>) => {
    if (!currentSection || !currentLesson) return
    const updatedSections = [...sections]
    updatedSections[activeSectionIdx].lessons[activeLessonIdx] = {
      ...currentLesson,
      ...patch,
    }
    setSections(updatedSections)
  }

  // Save handler (Draft or Published)
  const handleSaveCourse = async (publishFlag?: boolean) => {
    if (!title.trim()) {
      setErrorMsg('Course title is required.')
      setCurrentStep(1)
      return
    }

    try {
      setIsSaving(true)
      setErrorMsg(null)
      setSuccessMsg(null)

      const willPublish = publishFlag !== undefined ? publishFlag : isPublished

      const payload = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        category,
        level,
        thumbnailUrl: thumbnailUrl.trim() || undefined,
        previewVideoUrl: previewVideoUrl.trim() || undefined,
        isFree,
        price: isFree ? 0 : price,
        whatYouWillLearn: whatYouWillLearn.filter((x) => x.trim().length > 0),
        requirements: requirements.filter((x) => x.trim().length > 0),
        sections,
        isPublished: willPublish,
        estimatedDuration,
      }

      let res: Response
      if (initialCourse?.id && !initialCourse.id.startsWith('seed-')) {
        // Update
        res = await fetch(`/api/courses/${initialCourse.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        // Create
        res = await fetch('/api/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save course')

      setSuccessMsg(
        willPublish
          ? '🎉 Course published successfully! Singers can now enroll.'
          : '✓ Course draft saved successfully.'
      )
      setIsPublished(willPublish)

      if (onSaveComplete && data.course) {
        onSaveComplete(data.course)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save course'
      console.error('Save course error:', err)
      setErrorMsg(message)
    } finally {
      setIsSaving(false)
    }
  }

  // Quick vocal outcomes suggestion helper
  const addQuickOutcome = (suggestion: string) => {
    if (!whatYouWillLearn.includes(suggestion)) {
      const filtered = whatYouWillLearn.filter((x) => x.trim().length > 0)
      setWhatYouWillLearn([...filtered, suggestion])
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Hidden file input for media uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*,application/pdf"
        onChange={handleFileUpload}
      />

      {/* Top Header Bar */}
      <header className="glass-card rounded-2xl border-white/[0.08] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#a855f7]/25 shrink-0">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                {title ? title : 'Course Creator Studio'}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isPublished
                    ? 'bg-green-500/20 text-green-300 border-green-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {isPublished ? 'Published' : 'Draft'}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Teacher Studio • Craft video lessons, audio drills, and vocal exercises
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl glass-button text-sm"
            >
              Back
            </button>
          )}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveCourse(false)}
            className="px-4 py-2 rounded-xl glass-button text-sm flex items-center gap-2 hover:border-[#a855f7]/50 disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-slate-300" />
            Save Draft
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveCourse(true)}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white text-sm font-semibold shadow-lg shadow-[#a855f7]/25 flex items-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {isPublished ? 'Update Course' : 'Publish Course'}
          </button>
        </div>
      </header>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/10 text-green-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3-Step Wizard Navigation */}
      <div className="grid grid-cols-3 gap-2 glass-card-subtle p-2 rounded-2xl border-white/[0.08]">
        <button
          onClick={() => setCurrentStep(1)}
          className={`py-3 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2.5 transition-all ${
            currentStep === 1
              ? 'bg-gradient-to-r from-[#a855f7]/30 to-[#7c3aed]/20 text-white border border-[#a855f7]/40 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          <span className="w-6 h-6 rounded-full bg-white/[0.1] text-xs flex items-center justify-center font-bold">
            1
          </span>
          <span>Course Overview & Media</span>
        </button>

        <button
          onClick={() => setCurrentStep(2)}
          className={`py-3 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2.5 transition-all ${
            currentStep === 2
              ? 'bg-gradient-to-r from-[#a855f7]/30 to-[#7c3aed]/20 text-white border border-[#a855f7]/40 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          <span className="w-6 h-6 rounded-full bg-white/[0.1] text-xs flex items-center justify-center font-bold">
            2
          </span>
          <span>Curriculum & Vocal Drills</span>
        </button>

        <button
          onClick={() => setCurrentStep(3)}
          className={`py-3 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2.5 transition-all ${
            currentStep === 3
              ? 'bg-gradient-to-r from-[#a855f7]/30 to-[#7c3aed]/20 text-white border border-[#a855f7]/40 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          <span className="w-6 h-6 rounded-full bg-white/[0.1] text-xs flex items-center justify-center font-bold">
            3
          </span>
          <span>Review & Live Preview</span>
        </button>
      </div>

      {/* STEP 1: Course Info & Media */}
      {currentStep === 1 && (
        <section className="space-y-6">
          <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#d8b4fe]" />
              Basic Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-200">
                  Course Title <span className="text-[#a855f7]">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Mix Voice & Register Transition Mastery"
                  className="w-full px-4 py-3 glass-input rounded-xl text-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-200">Subtitle / Tagline</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g., Bridge the vocal break smoothly without strain or flipping"
                  className="w-full px-4 py-3 glass-input rounded-xl text-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-200">
                  Detailed Course Description
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide an overview of the curriculum, vocal methodology, and who this course is best suited for..."
                  className="w-full px-4 py-3 glass-input rounded-xl text-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Vocal Specialization</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 glass-select rounded-xl text-white bg-slate-900/90"
                >
                  {VOCAL_COURSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Difficulty Level</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as Course['level'])}
                  className="w-full px-4 py-3 glass-select rounded-xl text-white bg-slate-900/90"
                >
                  <option value="Beginner">Beginner (Foundations & Pitch)</option>
                  <option value="Intermediate">Intermediate (Mix Voice & Agility)</option>
                  <option value="Advanced">Advanced (Belting & Complex Ornaments)</option>
                  <option value="All Levels">All Levels</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Estimated Duration</label>
                <input
                  type="text"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value)}
                  placeholder="e.g. 2.5 hours"
                  className="w-full px-4 py-3 glass-input rounded-xl text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Course Access & Pricing</label>
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={isFree}
                      onChange={() => setIsFree(true)}
                      className="accent-[#a855f7]"
                    />
                    <span className="text-sm text-slate-200">Free for Academy Students</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!isFree}
                      onChange={() => setIsFree(false)}
                      className="accent-[#a855f7]"
                    />
                    <span className="text-sm text-slate-200">Premium ($ USD)</span>
                  </label>
                </div>
                {!isFree && (
                  <div className="pt-2">
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      placeholder="Course price in USD"
                      className="w-full px-4 py-2.5 glass-input rounded-xl text-white"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Media: Cover Thumbnail & Preview Video */}
          <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Video className="w-5 h-5 text-[#d8b4fe]" />
              Course Cover & Preview Video
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Thumbnail */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-200">Cover Thumbnail</label>
                <div className="border border-dashed border-white/[0.15] rounded-2xl p-4 bg-white/[0.02] flex flex-col items-center justify-center min-h-[180px] relative overflow-hidden">
                  {thumbnailUrl ? (
                    <div className="w-full space-y-2">
                      <div className="relative w-full h-36 rounded-xl overflow-hidden border border-white/[0.1]">
                        <Image
                          src={thumbnailUrl}
                          alt="Course cover"
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Cover Image Loaded</span>
                        <button
                          type="button"
                          onClick={() => setThumbnailUrl('')}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-300 font-medium">
                        Upload Course Cover (16:9 recommended)
                      </p>
                      <button
                        type="button"
                        onClick={() => triggerUpload({ purpose: 'thumbnail' })}
                        disabled={uploadingField === 'thumbnail'}
                        className="px-3 py-1.5 rounded-lg glass-button text-xs font-semibold"
                      >
                        {uploadingField === 'thumbnail' ? 'Uploading...' : 'Browse Image'}
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="Or paste external image URL"
                  className="w-full px-3 py-2 text-xs glass-input rounded-lg text-slate-300"
                />
              </div>

              {/* Preview Video */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-200">Intro / Preview Video Trailer</label>
                <div className="border border-dashed border-white/[0.15] rounded-2xl p-4 bg-white/[0.02] flex flex-col items-center justify-center min-h-[180px]">
                  <Video className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs text-slate-300 font-medium text-center">
                    Video Trailer (YouTube, Vimeo, Loom, or direct upload)
                  </p>
                  <button
                    type="button"
                    onClick={() => triggerUpload({ purpose: 'preview_video' })}
                    disabled={uploadingField === 'preview_video'}
                    className="mt-2 px-3 py-1.5 rounded-lg glass-button text-xs font-semibold"
                  >
                    {uploadingField === 'preview_video' ? 'Uploading...' : 'Upload Video File'}
                  </button>
                </div>
                <input
                  type="text"
                  value={previewVideoUrl}
                  onChange={(e) => setPreviewVideoUrl(e.target.value)}
                  placeholder="Or paste YouTube / Vimeo / Loom link"
                  className="w-full px-3 py-2 text-xs glass-input rounded-lg text-slate-300"
                />
              </div>
            </div>
          </div>

          {/* Learning Outcomes & Requirements */}
          <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#d8b4fe]" />
              Learning Outcomes & Prerequisites
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-200">
                  What You Will Learn (Core Takeaways)
                </label>
                <button
                  type="button"
                  onClick={() => setWhatYouWillLearn([...whatYouWillLearn, ''])}
                  className="text-xs text-[#d8b4fe] hover:text-white flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Outcome
                </button>
              </div>

              {/* Quick suggestions for vocal teachers */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="text-slate-400 self-center">Suggestions:</span>
                {[
                  'SOVT Phonation & Easy Onset',
                  'Mix Voice & Passagio Navigation',
                  'Pitch Centering with Drone Sa',
                  'Breath Pacing & Rib Expansion',
                  'Safe Meend & Murki Pop Adaptation',
                ].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => addQuickOutcome(sug)}
                    className="px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-[#a855f7]/40 hover:text-white"
                  >
                    + {sug}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {whatYouWillLearn.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#a855f7] shrink-0" />
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const updated = [...whatYouWillLearn]
                        updated[idx] = e.target.value
                        setWhatYouWillLearn(updated)
                      }}
                      placeholder={`Outcome #${idx + 1}`}
                      className="w-full px-3 py-2 text-sm glass-input rounded-xl text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setWhatYouWillLearn(whatYouWillLearn.filter((_, i) => i !== idx))
                      }
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/[0.08]">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-200">
                  Prerequisites & Required Tools
                </label>
                <button
                  type="button"
                  onClick={() => setRequirements([...requirements, ''])}
                  className="text-xs text-[#d8b4fe] hover:text-white flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Requirement
                </button>
              </div>

              <div className="space-y-2">
                {requirements.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#a855f7] shrink-0" />
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const updated = [...requirements]
                        updated[idx] = e.target.value
                        setRequirements(updated)
                      }}
                      placeholder={`Requirement #${idx + 1}`}
                      className="w-full px-3 py-2 text-sm glass-input rounded-xl text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setRequirements(requirements.filter((_, i) => i !== idx))}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white font-semibold flex items-center gap-2 shadow-lg shadow-[#a855f7]/25"
            >
              Continue to Curriculum Builder
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Curriculum & Vocal Drills Builder */}
      {currentStep === 2 && (
        <section className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          {/* Left Navigation: Modules & Lessons Manager */}
          <aside className="space-y-4">
            <div className="glass-card rounded-2xl border-white/[0.08] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#d8b4fe]" />
                  Curriculum Structure
                </h3>
                <button
                  type="button"
                  onClick={addSection}
                  className="px-2.5 py-1 rounded-lg bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#d8b4fe] hover:text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Module
                </button>
              </div>

              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
                {sections.map((section, sIdx) => {
                  const isSecActive = activeSectionIdx === sIdx

                  return (
                    <div
                      key={section.id}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        isSecActive
                          ? 'border-[#a855f7]/50 bg-white/[0.06]'
                          : 'border-white/[0.08] bg-white/[0.02]'
                      }`}
                    >
                      {/* Section Header */}
                      <div className="p-3 bg-white/[0.02] flex items-center justify-between gap-2 border-b border-white/[0.06]">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSectionIdx(sIdx)
                            setActiveLessonIdx(0)
                          }}
                          className="text-left font-semibold text-sm text-white truncate flex-1 hover:text-[#d8b4fe]"
                        >
                          {section.title || `Module ${sIdx + 1}`}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveSection(sIdx, 'up')}
                            disabled={sIdx === 0}
                            className="p-1 text-slate-500 hover:text-white disabled:opacity-20"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(sIdx, 'down')}
                            disabled={sIdx === sections.length - 1}
                            className="p-1 text-slate-500 hover:text-white disabled:opacity-20"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSection(sIdx)}
                            className="p-1 text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Lesson list inside module */}
                      <div className="p-2 space-y-1">
                        {section.lessons.map((lesson, lIdx) => {
                          const isLessActive = isSecActive && activeLessonIdx === lIdx

                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => {
                                setActiveSectionIdx(sIdx)
                                setActiveLessonIdx(lIdx)
                              }}
                              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                                isLessActive
                                  ? 'bg-[#a855f7]/25 text-white font-medium border border-[#a855f7]/40'
                                  : 'text-slate-300 hover:bg-white/[0.04]'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                {lesson.format === 'video' ? (
                                  <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                ) : lesson.format === 'audio_drill' ? (
                                  <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                )}
                                <span className="truncate">{lesson.title || `Lesson ${lIdx + 1}`}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 shrink-0">
                                {lesson.duration || '10m'}
                              </span>
                            </button>
                          )
                        })}

                        <button
                          type="button"
                          onClick={() => addLesson(sIdx)}
                          className="w-full mt-2 py-1.5 px-2 rounded-lg border border-dashed border-white/[0.15] text-[11px] text-slate-400 hover:text-white hover:border-[#a855f7]/50 flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Lesson to Module
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>

          {/* Right Editor: Active Lesson Details */}
          <main className="space-y-6">
            {currentLesson && (
              <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-6">
                {/* Module & Lesson Header Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
                  <div>
                    <span className="text-xs font-semibold text-[#d8b4fe] uppercase tracking-wider">
                      Editing Module {activeSectionIdx + 1} • Lesson {activeLessonIdx + 1}
                    </span>
                    <h2 className="text-2xl font-bold text-white mt-1">
                      {currentLesson.title || 'Untitled Lesson'}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveLesson(activeSectionIdx, activeLessonIdx, 'up')}
                      disabled={activeLessonIdx === 0}
                      className="px-3 py-1.5 rounded-lg glass-button text-xs flex items-center gap-1 disabled:opacity-20"
                    >
                      <ChevronUp className="w-3.5 h-3.5" /> Move Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLesson(activeSectionIdx, activeLessonIdx, 'down')}
                      disabled={activeLessonIdx === currentSection.lessons.length - 1}
                      className="px-3 py-1.5 rounded-lg glass-button text-xs flex items-center gap-1 disabled:opacity-20"
                    >
                      <ChevronDown className="w-3.5 h-3.5" /> Move Down
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLesson(activeSectionIdx, activeLessonIdx)}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Lesson
                    </button>
                  </div>
                </div>

                {/* Module Title & Description */}
                <div className="glass-card-subtle rounded-xl p-4 border-white/[0.06] space-y-3">
                  <span className="text-xs font-semibold text-slate-400">Module Settings</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={currentSection.title}
                      onChange={(e) => {
                        const updated = [...sections]
                        updated[activeSectionIdx].title = e.target.value
                        setSections(updated)
                      }}
                      placeholder="Module Title"
                      className="w-full px-3 py-2 text-sm glass-input rounded-lg text-white"
                    />
                    <input
                      type="text"
                      value={currentSection.description || ''}
                      onChange={(e) => {
                        const updated = [...sections]
                        updated[activeSectionIdx].description = e.target.value
                        setSections(updated)
                      }}
                      placeholder="Module Description / Focus"
                      className="w-full px-3 py-2 text-sm glass-input rounded-lg text-white"
                    />
                  </div>
                </div>

                {/* Lesson Title & Duration */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Lesson Title</label>
                    <input
                      type="text"
                      value={currentLesson.title}
                      onChange={(e) => updateCurrentLesson({ title: e.target.value })}
                      placeholder="e.g. 5-Tone SOVT Siren & Cord Closure"
                      className="w-full px-4 py-2.5 glass-input rounded-xl text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Duration</label>
                    <input
                      type="text"
                      value={currentLesson.duration}
                      onChange={(e) => updateCurrentLesson({ duration: e.target.value })}
                      placeholder="e.g. 15 min"
                      className="w-full px-4 py-2.5 glass-input rounded-xl text-white"
                    />
                  </div>
                </div>

                {/* Format Selector: Video only, Text only, Audio Drill, Hybrid */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Lesson Content Format</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      {
                        key: 'hybrid',
                        label: '✨ Hybrid Multimedia',
                        desc: 'Video + Audio Drills + Text + Drills',
                      },
                      { key: 'video', label: '🎬 Video Lesson', desc: 'Primary video lecture / demo' },
                      {
                        key: 'audio_drill',
                        label: '🎵 Vocal Audio Drill',
                        desc: 'Backing track & scale practice',
                      },
                      {
                        key: 'text',
                        label: '📝 Text & Theory',
                        desc: 'Anatomy, rubrics & guide',
                      },
                    ].map((fmt) => (
                      <button
                        key={fmt.key}
                        type="button"
                        onClick={() => updateCurrentLesson({ format: fmt.key as LessonFormat })}
                        className={`p-3 rounded-xl text-left border transition-all ${
                          (currentLesson.format || 'hybrid') === fmt.key
                            ? 'bg-[#a855f7]/20 border-[#a855f7]/50 text-white shadow-sm'
                            : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white'
                        }`}
                      >
                        <p className="text-xs font-semibold">{fmt.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{fmt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Media (If hybrid or video) */}
                {(currentLesson.format === 'video' ||
                  currentLesson.format === 'hybrid' ||
                  !currentLesson.format) && (
                  <div className="glass-card-subtle rounded-xl p-4 border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-blue-400" />
                        Lesson Coaching Video
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          triggerUpload({
                            purpose: 'lesson_video',
                            sectionIdx: activeSectionIdx,
                            lessonIdx: activeLessonIdx,
                            field: 'videoUrl',
                          })
                        }
                        disabled={uploadingField === 'lesson_video'}
                        className="px-3 py-1 rounded-lg glass-button text-xs flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingField === 'lesson_video' ? 'Uploading...' : 'Upload Video File'}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={currentLesson.videoUrl || ''}
                      onChange={(e) => updateCurrentLesson({ videoUrl: e.target.value })}
                      placeholder="Paste YouTube, Vimeo, Loom, or direct MP4/WebM video URL..."
                      className="w-full px-4 py-2.5 text-sm glass-input rounded-xl text-white placeholder-slate-500"
                    />
                  </div>
                )}

                {/* Vocal Audio Drill & Backing Track (If audio_drill or hybrid) */}
                {(currentLesson.format === 'audio_drill' ||
                  currentLesson.format === 'hybrid' ||
                  !currentLesson.format) && (
                  <div className="glass-card-subtle rounded-xl p-4 border-[#a855f7]/25 bg-gradient-to-br from-[#a855f7]/10 to-transparent space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#a855f7]/30 flex items-center justify-center">
                          <Music className="w-4 h-4 text-[#d8b4fe]" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white">
                            Vocal Audio Drill / Backing Track
                          </h4>
                          <p className="text-[11px] text-slate-400">
                            Provide audio guide, scale keys, BPM, and singer range targets
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          triggerUpload({
                            purpose: 'audio_drill',
                            sectionIdx: activeSectionIdx,
                            lessonIdx: activeLessonIdx,
                            field: 'audioDrill',
                          })
                        }
                        disabled={uploadingField === 'audio_drill'}
                        className="px-3 py-1 rounded-lg bg-[#a855f7]/25 border border-[#a855f7]/40 text-[#d8b4fe] hover:text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingField === 'audio_drill' ? 'Uploading...' : 'Upload Audio Track'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-300">Drill / Audio Track Title</label>
                        <input
                          type="text"
                          value={currentLesson.audioDrill?.title || ''}
                          onChange={(e) =>
                            updateCurrentLesson({
                              audioDrill: { ...currentLesson.audioDrill, audioUrl: currentLesson.audioDrill?.audioUrl || '', title: e.target.value },
                            })
                          }
                          placeholder="e.g. 5-Tone Descending Scale in F# Minor"
                          className="w-full px-3 py-2 text-xs glass-input rounded-lg text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-slate-300">Audio Track URL (MP3/WAV/AAC)</label>
                        <input
                          type="text"
                          value={currentLesson.audioDrill?.audioUrl || ''}
                          onChange={(e) =>
                            updateCurrentLesson({
                              audioDrill: { ...currentLesson.audioDrill, audioUrl: e.target.value },
                            })
                          }
                          placeholder="Paste audio URL or click upload above"
                          className="w-full px-3 py-2 text-xs glass-input rounded-lg text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-slate-300">Target Vocal Key</label>
                        <select
                          value={currentLesson.audioDrill?.targetKey || VOCAL_KEYS[0]}
                          onChange={(e) =>
                            updateCurrentLesson({
                              audioDrill: { ...currentLesson.audioDrill, audioUrl: currentLesson.audioDrill?.audioUrl || '', targetKey: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 text-xs glass-select rounded-lg text-white bg-slate-900"
                        >
                          {VOCAL_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-slate-300">Scale / Pattern Type</label>
                        <select
                          value={currentLesson.audioDrill?.scaleType || VOCAL_SCALE_TYPES[0]}
                          onChange={(e) =>
                            updateCurrentLesson({
                              audioDrill: { ...currentLesson.audioDrill, audioUrl: currentLesson.audioDrill?.audioUrl || '', scaleType: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 text-xs glass-select rounded-lg text-white bg-slate-900"
                        >
                          {VOCAL_SCALE_TYPES.map((sc) => (
                            <option key={sc} value={sc}>
                              {sc}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-slate-300">Tempo (BPM)</label>
                        <input
                          type="number"
                          min="40"
                          max="220"
                          value={currentLesson.audioDrill?.bpm || 80}
                          onChange={(e) =>
                            updateCurrentLesson({
                              audioDrill: { ...currentLesson.audioDrill, audioUrl: currentLesson.audioDrill?.audioUrl || '', bpm: Number(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 text-xs glass-input rounded-lg text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-slate-300">Vocal Range Target</label>
                        <input
                          type="text"
                          value={currentLesson.audioDrill?.range || ''}
                          onChange={(e) =>
                            updateCurrentLesson({
                              audioDrill: { ...currentLesson.audioDrill, audioUrl: currentLesson.audioDrill?.audioUrl || '', range: e.target.value },
                            })
                          }
                          placeholder="e.g. A3 - E5 / Mid-Mix"
                          className="w-full px-3 py-2 text-xs glass-input rounded-lg text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Lesson Summary & In-Depth Text Breakdown */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Lesson Summary / Concept Overview
                    </label>
                    <input
                      type="text"
                      value={currentLesson.summary}
                      onChange={(e) => updateCurrentLesson({ summary: e.target.value })}
                      placeholder="Brief 1-2 sentence core idea of this lesson..."
                      className="w-full px-4 py-2.5 text-sm glass-input rounded-xl text-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">
                        In-Depth Lesson Breakdown (Instruction & Vocal Mechanics)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentLesson({ body: [...(currentLesson.body || []), ''] })
                        }
                        className="text-xs text-[#d8b4fe] hover:text-white flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Paragraph
                      </button>
                    </div>

                    <div className="space-y-2">
                      {currentLesson.body.map((para, pIdx) => (
                        <div key={pIdx} className="flex items-start gap-2">
                          <textarea
                            rows={3}
                            value={para}
                            onChange={(e) => {
                              const updatedBody = [...currentLesson.body]
                              updatedBody[pIdx] = e.target.value
                              updateCurrentLesson({ body: updatedBody })
                            }}
                            placeholder={`Paragraph ${pIdx + 1}: Explain vocal cues, mouth shapes, sensation adjustments...`}
                            className="w-full px-3 py-2 text-sm glass-input rounded-xl text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updatedBody = currentLesson.body.filter((_, i) => i !== pIdx)
                              updateCurrentLesson({ body: updatedBody })
                            }}
                            className="text-slate-500 hover:text-red-400 p-1 mt-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Key Takeaways & Practice Assignments */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/[0.08]">
                  {/* Key Points */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">
                        Key Points (Bullet Highlights)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentLesson({
                            keyPoints: [...(currentLesson.keyPoints || []), ''],
                          })
                        }
                        className="text-xs text-[#d8b4fe] hover:text-white flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Point
                      </button>
                    </div>
                    <div className="space-y-2">
                      {currentLesson.keyPoints.map((point, kIdx) => (
                        <div key={kIdx} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#a855f7] shrink-0" />
                          <input
                            type="text"
                            value={point}
                            onChange={(e) => {
                              const updated = [...currentLesson.keyPoints]
                              updated[kIdx] = e.target.value
                              updateCurrentLesson({ keyPoints: updated })
                            }}
                            placeholder={`Key point #${kIdx + 1}`}
                            className="w-full px-3 py-2 text-xs glass-input rounded-lg text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = currentLesson.keyPoints.filter((_, i) => i !== kIdx)
                              updateCurrentLesson({ keyPoints: updated })
                            }}
                            className="text-slate-500 hover:text-red-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vocal Practice Assignments */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">
                        Vocal Practice Assignments (Singer Homework)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentLesson({
                            practice: [...(currentLesson.practice || []), ''],
                          })
                        }
                        className="text-xs text-[#d8b4fe] hover:text-white flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Drill
                      </button>
                    </div>
                    <div className="space-y-2">
                      {currentLesson.practice.map((item, prIdx) => (
                        <div key={prIdx} className="flex items-center gap-2">
                          <Mic className="w-3.5 h-3.5 text-[#d8b4fe] shrink-0" />
                          <input
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const updated = [...currentLesson.practice]
                              updated[prIdx] = e.target.value
                              updateCurrentLesson({ practice: updated })
                            }}
                            placeholder={`e.g. 5 rounds of SOVT straw slides on 30s intervals`}
                            className="w-full px-3 py-2 text-xs glass-input rounded-lg text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = currentLesson.practice.filter((_, i) => i !== prIdx)
                              updateCurrentLesson({ practice: updated })
                            }}
                            className="text-slate-500 hover:text-red-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Downloadable Resources & Sheet Music */}
                <div className="space-y-3 pt-4 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-[#d8b4fe]" />
                      <label className="text-xs font-medium text-slate-200">
                        Downloadable Resources, PDF Guides & Sheet Music
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        triggerUpload({
                          purpose: 'attachment',
                          sectionIdx: activeSectionIdx,
                          lessonIdx: activeLessonIdx,
                          field: 'attachment',
                        })
                      }
                      disabled={uploadingField === 'attachment'}
                      className="px-3 py-1 rounded-lg glass-button text-xs flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingField === 'attachment' ? 'Uploading...' : 'Upload PDF / Resource'}
                    </button>
                  </div>

                  {currentLesson.attachments && currentLesson.attachments.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {currentLesson.attachments.map((att, aIdx) => (
                        <div
                          key={att.id || aIdx}
                          className="p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileMusic className="w-4 h-4 text-[#d8b4fe] shrink-0" />
                            <span className="text-xs text-white truncate font-medium">{att.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = currentLesson.attachments?.filter((_, i) => i !== aIdx)
                              updateCurrentLesson({ attachments: updated })
                            }}
                            className="text-slate-500 hover:text-red-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      No attachments added yet. Upload PDFs, warm-up charts, or stems.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2.5 rounded-xl glass-button text-sm flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Overview
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white font-semibold flex items-center gap-2 shadow-lg shadow-[#a855f7]/25"
              >
                Proceed to Review & Publish
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </main>
        </section>
      )}

      {/* STEP 3: Review & Live Preview */}
      {currentStep === 3 && (
        <section className="space-y-6">
          {/* Pre-Flight Checklist */}
          <div className="glass-card rounded-2xl border-white/[0.08] p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  Pre-Flight Course Verification
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Review completeness and publish settings before launching to academy students
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveCourse(false)}
                  className="px-4 py-2 rounded-xl glass-button text-sm"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveCourse(true)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white text-sm font-semibold shadow-lg shadow-[#a855f7]/25 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {isPublished ? 'Save Published Changes' : 'Publish Course Live'}
                </button>
              </div>
            </div>

            {/* Checklist Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-1">
                <p className="text-xs text-slate-400">Total Curriculum Modules</p>
                <p className="text-2xl font-bold text-white">{sections.length}</p>
                <p className="text-xs text-green-400">✓ Modules structured</p>
              </div>

              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-1">
                <p className="text-xs text-slate-400">Total Lessons</p>
                <p className="text-2xl font-bold text-white">
                  {sections.reduce((acc, s) => acc + s.lessons.length, 0)}
                </p>
                <p className="text-xs text-[#d8b4fe]">
                  {sections.reduce((acc, s) => acc + s.lessons.length, 0) > 0
                    ? '✓ Lessons ready'
                    : 'Add lessons'}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-1">
                <p className="text-xs text-slate-400">Access Tier</p>
                <p className="text-2xl font-bold text-white">{isFree ? 'Free Access' : `$${price}`}</p>
                <p className="text-xs text-slate-300">{category}</p>
              </div>
            </div>

            {/* Summary card */}
            <div className="glass-card-subtle rounded-xl p-5 border-white/[0.08] space-y-4">
              <h3 className="text-base font-semibold text-white">Course Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
                <div>
                  <span className="text-slate-500 block text-xs">Title</span>
                  <span className="text-white font-medium">{title || 'Untitled'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Subtitle</span>
                  <span className="text-white font-medium">{subtitle || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Level & Specialization</span>
                  <span className="text-white font-medium">
                    {level} • {category}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Cover Media</span>
                  <span className="text-white font-medium">
                    {thumbnailUrl ? 'Custom Image Attached' : 'Default Gradient Theme'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2.5 rounded-xl glass-button text-sm flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Curriculum
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
