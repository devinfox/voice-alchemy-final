import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// POST /api/lessons/[relationshipId]/recordings/presign - Get a presigned URL for direct upload
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { filename, contentType = 'video/webm' } = body

    // Verify booking exists, is confirmed, and user has access
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id, status')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.status !== 'confirmed') {
      return NextResponse.json(
        { error: 'Recording upload only allowed for confirmed bookings' },
        { status: 400 }
      )
    }

    // Check if user is the instructor (host)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()

    const isInstructor = booking.instructor_id === user.id || profile?.role === 'admin'
    if (!isInstructor) {
      return NextResponse.json(
        { error: 'Only the instructor can upload recordings' },
        { status: 403 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Create admin client for storage
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Generate unique filename
    const timestamp = Date.now()
    const safeFilename = filename || `lesson-${bookingId}-${timestamp}.webm`
    const storagePath = `${bookingId}/${safeFilename}`

    // Create a signed upload URL (valid for 10 minutes)
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('lesson-recordings')
      .createSignedUploadUrl(storagePath)

    if (uploadError) {
      console.error('Error creating signed upload URL:', uploadError)
      return NextResponse.json(
        { error: 'Failed to create upload URL', details: uploadError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      uploadUrl: uploadData.signedUrl,
      token: uploadData.token,
      storagePath,
      bookingId,
      studentId: booking.student_id,
      contentType,
    })
  } catch (error) {
    console.error('Error in POST /api/lessons/[relationshipId]/recordings/presign:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
