import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BUCKET_NAME = 'course-media'

async function ensureBucketExists(admin: SupabaseClient) {
  try {
    const { data: buckets } = await admin.storage.listBuckets()
    const found = buckets?.some((b) => b.name === BUCKET_NAME)
    if (!found) {
      await admin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 250 * 1024 * 1024, // 250MB limit
      })
    }
  } catch {
    // Ignore error if bucket creation fails or exists
  }
}

// POST /api/courses/upload - Upload course media (thumbnail, audio drill, video, pdf)
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
        { error: 'Only teachers and admins can upload course assets' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const purpose = (formData.get('purpose') as string) || 'general' // 'thumbnail' | 'audio_drill' | 'video' | 'attachment'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    await ensureBucketExists(admin)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const originalName = file.name || 'file'
    const ext = originalName.split('.').pop()?.toLowerCase() || 'bin'
    const uniqueName = `${purpose}/${user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`

    let targetBucket = BUCKET_NAME
    let { error } = await admin.storage.from(targetBucket).upload(uniqueName, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

    // Fallback to email-attachments or lesson-recordings if bucket was missing
    if (error && error.message.includes('Bucket not found')) {
      targetBucket = 'email-attachments'
      const fallbackResult = await admin.storage.from(targetBucket).upload(uniqueName, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })
      error = fallbackResult.error
    }

    if (error) {
      console.error('[Course Upload] Storage error:', error)
      return NextResponse.json({ error: 'Failed to upload asset: ' + error.message }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = admin.storage.from(targetBucket).getPublicUrl(uniqueName)
    let publicUrl = urlData?.publicUrl

    // If bucket is private, generate a long-lived signed URL
    if (!publicUrl || publicUrl.includes('null')) {
      const { data: signedData } = await admin.storage
        .from(targetBucket)
        .createSignedUrl(uniqueName, 60 * 60 * 24 * 365) // 1 year
      publicUrl = signedData?.signedUrl || ''
    }

    return NextResponse.json({
      url: publicUrl,
      fileName: originalName,
      fileType: file.type,
      sizeBytes: buffer.length,
      storagePath: uniqueName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File upload failed'
    console.error('[Course Upload] Handler error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
