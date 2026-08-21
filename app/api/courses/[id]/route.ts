import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCourseBySlug, slugify, type Course, type CourseSection } from '@/lib/courses'

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

// GET /api/courses/[id] - Get course by id or slug
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // Try finding by UUID id or slug
    let query = admin
      .from('courses')
      .select('*, profiles:instructor_id(name, first_name, last_name, avatar_url)')

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (isUuid) {
      query = query.or(`id.eq.${id},slug.eq.${id}`)
    } else {
      query = query.eq('slug', id)
    }

    const { data: dbCourse } = await query.maybeSingle()

    if (dbCourse) {
      const course = mapDbRowToCourse(dbCourse as DbCourseRow)
      // Unpublished drafts are only visible to the course owner or an admin
      const canViewDraft = user.role === 'admin' || dbCourse.instructor_id === user.id
      if (!course.isPublished && !canViewDraft) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 })
      }
      return NextResponse.json({ course })
    }

    // Fallback to static seed course
    const seedCourse = getCourseBySlug(id)
    if (seedCourse) {
      return NextResponse.json({ course: seedCourse })
    }

    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch course'
    console.error('[Courses API] GET [id] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH / PUT /api/courses/[id] - Update course (Teacher/Admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // Fetch existing course to verify ownership
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    let checkQuery = admin.from('courses').select('*')
    if (isUuid) {
      checkQuery = checkQuery.or(`id.eq.${id},slug.eq.${id}`)
    } else {
      checkQuery = checkQuery.eq('slug', id)
    }

    const { data: existingCourse, error: fetchErr } = await checkQuery.maybeSingle()
    if (fetchErr || !existingCourse) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const isAdmin = user.role === 'admin'
    const isOwner = existingCourse.instructor_id === user.id

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You do not have permission to edit this course' }, { status: 403 })
    }

    const body = await request.json()
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.title !== undefined) {
      updatePayload.title = body.title.trim()
      updatePayload.name = body.title.trim()
    }
    if (body.subtitle !== undefined) updatePayload.subtitle = body.subtitle
    if (body.description !== undefined) updatePayload.description = body.description
    if (body.category !== undefined) updatePayload.category = body.category
    if (body.level !== undefined) updatePayload.level = body.level
    if (body.thumbnailUrl !== undefined) updatePayload.thumbnail_url = body.thumbnailUrl || null
    if (body.previewVideoUrl !== undefined) updatePayload.preview_video_url = body.previewVideoUrl || null
    if (body.isPublished !== undefined) updatePayload.is_published = Boolean(body.isPublished)
    if (body.isFree !== undefined) updatePayload.is_free = Boolean(body.isFree)
    if (body.price !== undefined) updatePayload.price = Number(body.price) || 0
    if (body.whatYouWillLearn !== undefined) updatePayload.what_you_will_learn = body.whatYouWillLearn
    if (body.requirements !== undefined) updatePayload.requirements = body.requirements
    if (body.sections !== undefined) updatePayload.curriculum = body.sections
    if (body.estimatedDuration !== undefined) updatePayload.estimated_duration = body.estimatedDuration

    const { data: updated, error: updateErr } = await admin
      .from('courses')
      .update(updatePayload)
      .eq('id', existingCourse.id)
      .select('*, profiles:instructor_id(name, first_name, last_name, avatar_url)')
      .single()

    if (updateErr) {
      console.error('[Courses API] Update error:', updateErr)
      return NextResponse.json({ error: 'Failed to update course: ' + updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ course: mapDbRowToCourse(updated as DbCourseRow) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update course'
    console.error('[Courses API] PATCH [id] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/courses/[id] - Delete course (Teacher/Admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // Fetch existing course
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    let checkQuery = admin.from('courses').select('id, instructor_id')
    if (isUuid) {
      checkQuery = checkQuery.or(`id.eq.${id},slug.eq.${id}`)
    } else {
      checkQuery = checkQuery.eq('slug', id)
    }

    const { data: existingCourse, error: fetchErr } = await checkQuery.maybeSingle()
    if (fetchErr || !existingCourse) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const isAdmin = user.role === 'admin'
    const isOwner = existingCourse.instructor_id === user.id

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You do not have permission to delete this course' }, { status: 403 })
    }

    const { error: deleteErr } = await admin.from('courses').delete().eq('id', existingCourse.id)
    if (deleteErr) {
      return NextResponse.json({ error: 'Failed to delete course: ' + deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deletedId: existingCourse.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete course'
    console.error('[Courses API] DELETE [id] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
