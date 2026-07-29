import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/email-funnels/enrollments/[id] - Update enrollment status (approve/reject)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { status, action } = body

    // Look up the users table ID from auth_id (approved_by/rejected_by reference users.id, not auth.users.id)
    const { data: userProfile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    const usersTableId = userProfile?.id || user.id // Fallback to auth id if no profile found

    // Use service role for updates
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get current enrollment
    const { data: enrollment, error: fetchError } = await serviceClient
      .from('email_funnel_enrollments')
      .select('*, funnel:email_funnels(id, name, total_enrolled)')
      .eq('id', id)
      .single()

    if (fetchError || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    // Handle approval action
    if (action === 'approve') {
      // Update enrollment to active
      const { error: updateError } = await serviceClient
        .from('email_funnel_enrollments')
        .update({
          status: 'active',
          approved_at: new Date().toISOString(),
          approved_by: usersTableId,
        })
        .eq('id', id)

      if (updateError) {
        console.error('Error approving enrollment:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Increment funnel total_enrolled count
      if (enrollment.funnel) {
        await serviceClient
          .from('email_funnels')
          .update({ total_enrolled: (enrollment.funnel.total_enrolled || 0) + 1 })
          .eq('id', enrollment.funnel_id)
      }

      return NextResponse.json({
        success: true,
        message: 'Enrollment approved',
        enrollment_id: id
      })
    }

    // Handle rejection action
    if (action === 'reject') {
      const { error: updateError } = await serviceClient
        .from('email_funnel_enrollments')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: usersTableId,
        })
        .eq('id', id)

      if (updateError) {
        console.error('Error rejecting enrollment:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Enrollment rejected',
        enrollment_id: id
      })
    }

    // Handle direct status update
    if (status) {
      const updateData: Record<string, unknown> = { status }

      if (status === 'cancelled') {
        updateData.cancelled_at = new Date().toISOString()
      }

      const { error: updateError } = await serviceClient
        .from('email_funnel_enrollments')
        .update(updateData)
        .eq('id', id)

      if (updateError) {
        console.error('Error updating enrollment:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, enrollment_id: id })
    }

    return NextResponse.json({ error: 'No action or status provided' }, { status: 400 })
  } catch (error) {
    console.error('Error in PATCH /api/email-funnels/enrollments/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/email-funnels/enrollments/[id] - Get enrollment details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: enrollment, error } = await supabase
      .from('email_funnel_enrollments')
      .select(`
        *,
        funnel:email_funnels(id, name, description, tags),
        lead:leads(id, first_name, last_name, email)
      `)
      .eq('id', id)
      .single()

    if (error || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    return NextResponse.json({ data: enrollment })
  } catch (error) {
    console.error('Error in GET /api/email-funnels/enrollments/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
