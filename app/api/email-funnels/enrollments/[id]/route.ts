import { requireEmailAccess } from '@/lib/email-access-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/email-funnels/enrollments/[id] - Update enrollment status (approve/reject)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Only email-tools users (admins / Julia) may manage enrollments
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const { status, action } = body

    const usersTableId = profile.id

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
          enrolled_at: new Date().toISOString(),
          enrolled_by: usersTableId || null,
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
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: 'Rejected by instructor',
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
    const { id } = await params

    // Only email-tools users (admins / Julia) may view enrollments
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // No leads table in this app — the enrollment's lead_id/contact_id points
    // at a profile; the email lives in the `users` mirror table.
    const { data: enrollment, error } = await serviceClient
      .from('email_funnel_enrollments')
      .select(`
        *,
        funnel:email_funnels(id, name, description, tags)
      `)
      .eq('id', id)
      .single()

    if (error || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    // Enrich with recipient info from profiles + users
    let lead: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null = null
    const recipientId = enrollment.contact_id || enrollment.lead_id
    if (recipientId) {
      const [{ data: recipientProfile }, { data: recipientUser }] = await Promise.all([
        serviceClient
          .from('profiles')
          .select('id, first_name, last_name, name')
          .eq('id', recipientId)
          .maybeSingle(),
        serviceClient
          .from('users')
          .select('id, email')
          .eq('id', recipientId)
          .maybeSingle(),
      ])

      if (recipientProfile || recipientUser) {
        lead = {
          id: recipientId,
          first_name: recipientProfile?.first_name || recipientProfile?.name?.split(' ')[0] || null,
          last_name: recipientProfile?.last_name || null,
          email: recipientUser?.email || null,
        }
      }
    }

    return NextResponse.json({ data: { ...enrollment, lead } })
  } catch (error) {
    console.error('Error in GET /api/email-funnels/enrollments/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
