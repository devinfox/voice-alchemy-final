import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { courses as defaultSeedCourses, slugify, type Course, type CourseSection } from '@/lib/courses'

export const dynamic = 'force-dynamic'

interface DbCourseRow {
  id: string
  slug?: string | null
  title?: string | null
  name?: string | null
  subtitle?: string | null
  description?: string | null
  category?: string | null
  level?: string | null
  thumbnail_url?: string | null
  preview_video_url?: string | null
  is_published?: boolean | null
  is_active?: boolean | null
  is_free?: boolean | null
  price?: number | null
  what_you_will_learn?: string[] | null
  requirements?: string[] | null
  curriculum?: CourseSection[] | null
  instructor_name?: string | null
  instructor_id?: string | null
  estimated_duration?: string | null
  created_at?: string | null
  updated_at?: string | null
  profiles?: {
    name?: string | null
    first_name?: string | null
    last_name?: string | null
    avatar_url?: string | null
  } | null
}

function mapDbRowToCourse(row: DbCourseRow): Course {
  const instructorName =
    row.instructor_name ||
    row.profiles?.name ||
    [row.profiles?.first_name, row.profiles?.last_name].filter(Boolean).join(' ') ||
    'Voice Alchemy Coach'

  const title = row.title || row.name || 'Untitled Vocal Course'
  const slug = row.slug || slugify(title) || row.id

  const sections = Array.isArray(row.curriculum) ? row.curriculum : []

  return {
    id: row.id,
    slug,
    title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    category: row.category || 'Vocal Technique & Foundations',
    level: (row.level as Course['level']) || 'Beginner',
    thumbnailUrl: row.thumbnail_url || undefined,
    previewVideoUrl: row.preview_video_url || undefined,
    isFree: row.is_free ?? true,
    isUnlocked: row.is_active ?? true,
    isPublished: row.is_published ?? true,
    instructor: instructorName,
    instructorId: row.instructor_id || undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Recently',
    whatYouWillLearn: Array.isArray(row.what_you_will_learn) ? row.what_you_will_learn : [],
    requirements: Array.isArray(row.requirements) ? row.requirements : [],
    sections,
    price: row.price ? Number(row.price) : 0,
    estimatedDuration: row.estimated_duration || undefined,
  }
}

// GET /api/courses - List courses with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const level = searchParams.get('level')
    const mineOnly = searchParams.get('mine') === 'true'

    const user = await getCurrentUser()
    const admin = getSupabaseAdmin()

    let query = admin
      .from('courses')
      .select('*, profiles:instructor_id(name, first_name, last_name, avatar_url)')
      .order('created_at', { ascending: false })

    if (mineOnly && user) {
      query = query.eq('instructor_id', user.id)
    } else if (!mineOnly) {
      // Public query: show published or active
      query = query.or('is_published.eq.true,is_active.eq.true')
    }

    if (category && category !== 'All') {
      query = query.eq('category', category)
    }

    if (level && level !== 'All') {
      query = query.eq('level', level)
    }

    const { data: dbCourses, error } = await query

    let resultCourses: Course[] = []

    if (!error && dbCourses && dbCourses.length > 0) {
      resultCourses = (dbCourses as DbCourseRow[]).map(mapDbRowToCourse)
    }

    // Merge default seed courses for public view if not in "mine only" mode
    if (!mineOnly) {
      for (const seed of defaultSeedCourses) {
        const alreadyExists = resultCourses.some(
          (c) => c.slug === seed.slug || c.id === seed.id
        )
        if (!alreadyExists) {
          if (
            (!category || category === 'All' || seed.category === category) &&
            (!level || level === 'All' || seed.level === level)
          ) {
            resultCourses.push(seed)
          }
        }
      }
    }

    return NextResponse.json({ courses: resultCourses })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch courses'
    console.error('[Courses API] GET error:', err)
    return NextResponse.json(
      { error: message, courses: defaultSeedCourses },
      { status: 500 }
    )
  }
}

// POST /api/courses - Create new course (Teacher/Instructor/Admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isTeacher =
      user.role === 'teacher' || user.role === 'instructor' || user.role === 'admin'
    if (!isTeacher) {
      return NextResponse.json(
        { error: 'Only instructors and admins can create courses' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      title,
      subtitle,
      description,
      category = 'Vocal Technique & Foundations',
      level = 'Beginner',
      thumbnailUrl,
      previewVideoUrl,
      isFree = true,
      price = 0,
      whatYouWillLearn = [],
      requirements = [],
      sections = [],
      isPublished = false,
      estimatedDuration,
    } = body

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Course title is required' }, { status: 400 })
    }

    let baseSlug = slugify(title)
    if (!baseSlug) baseSlug = `vocal-course-${Date.now()}`
    let finalSlug = baseSlug

    const admin = getSupabaseAdmin()

    // Ensure unique slug
    const { data: existingSlug } = await admin
      .from('courses')
      .select('id')
      .eq('slug', finalSlug)
      .limit(1)

    if (existingSlug && existingSlug.length > 0) {
      finalSlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`
    }

    const instructorName =
      user.name ||
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      'Voice Alchemy Coach'

    const insertPayload = {
      title: title.trim(),
      name: title.trim(),
      slug: finalSlug,
      subtitle: subtitle?.trim() || '',
      description: description?.trim() || '',
      category,
      level,
      thumbnail_url: thumbnailUrl || null,
      preview_video_url: previewVideoUrl || null,
      is_free: Boolean(isFree),
      is_active: true,
      is_published: Boolean(isPublished),
      price: Number(price) || 0,
      what_you_will_learn: Array.isArray(whatYouWillLearn) ? whatYouWillLearn : [],
      requirements: Array.isArray(requirements) ? requirements : [],
      curriculum: Array.isArray(sections) ? sections : [],
      instructor_name: instructorName,
      instructor_id: user.id,
      estimated_duration: estimatedDuration || null,
      updated_at: new Date().toISOString(),
    }

    const { data: newCourse, error } = await admin
      .from('courses')
      .insert(insertPayload)
      .select('*, profiles:instructor_id(name, first_name, last_name, avatar_url)')
      .single()

    if (error) {
      console.error('[Courses API] Insert error:', error)
      return NextResponse.json(
        { error: 'Failed to create course: ' + error.message },
        { status: 500 }
      )
    }

    const formatted = mapDbRowToCourse(newCourse as DbCourseRow)
    return NextResponse.json({ course: formatted }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create course'
    console.error('[Courses API] POST error:', err)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
