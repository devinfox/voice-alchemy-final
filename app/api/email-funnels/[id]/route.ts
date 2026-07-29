import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/email-funnels/[id] - Get a single funnel with details
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

    // Fetch funnel with phases and enrollments
    const { data: funnel, error } = await supabase
      .from('email_funnels')
      .select(`
        *,
        phases:email_funnel_phases(
          *,
          template:email_templates(id, name, subject)
        ),
        enrollments:email_funnel_enrollments(
          *,
          lead:leads(id, first_name, last_name, email),
          contact:contacts(id, first_name, last_name, email)
        )
      `)
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (error) {
      console.error('Error fetching funnel:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
    }

    // Sort phases by phase_order
    if (funnel.phases) {
      funnel.phases.sort((a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order)
    }

    return NextResponse.json({ data: funnel })
  } catch (error) {
    console.error('Error in GET /api/email-funnels/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/email-funnels/[id] - Update a funnel
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

    const { name, description, status, phases, tags, auto_enroll_enabled } = body

    // Use service role for complex transactions
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Update funnel
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (status !== undefined) updateData.status = status
    if (tags !== undefined) updateData.tags = tags
    if (auto_enroll_enabled !== undefined) updateData.auto_enroll_enabled = auto_enroll_enabled

    console.log('[Email Funnels API] Updating funnel:', { id, updateData })

    const { data: updateResult, error: updateError } = await serviceClient
      .from('email_funnels')
      .update(updateData)
      .eq('id', id)
      .select()

    if (updateError) {
      console.error('[Email Funnels API] Error updating funnel:', updateError)
      return NextResponse.json({
        error: updateError.message,
        details: updateError,
        hint: updateError.hint || 'Check if tags and auto_enroll_enabled columns exist in email_funnels table'
      }, { status: 500 })
    }

    console.log('[Email Funnels API] Update result:', updateResult)

    // Update phases if provided
    if (phases !== undefined) {
      // Delete existing phases
      await serviceClient
        .from('email_funnel_phases')
        .delete()
        .eq('funnel_id', id)

      // Insert new phases
      if (phases.length > 0) {
        const phasesData = phases.map((phase: {
          template_id?: string
          name?: string
          delay_days?: number
          delay_hours?: number
        }, index: number) => ({
          funnel_id: id,
          template_id: phase.template_id || null,
          phase_order: index + 1,
          name: phase.name || `Phase ${index + 1}`,
          delay_days: phase.delay_days || 0,
          delay_hours: phase.delay_hours || 0,
        }))

        const { error: phasesError } = await serviceClient
          .from('email_funnel_phases')
          .insert(phasesData)

        if (phasesError) {
          console.error('Error updating phases:', phasesError)
          return NextResponse.json({ error: phasesError.message }, { status: 500 })
        }
      }
    }

    // Fetch updated funnel
    const { data: funnel, error: fetchError } = await serviceClient
      .from('email_funnels')
      .select(`
        *,
        phases:email_funnel_phases(
          *,
          template:email_templates(id, name, subject)
        )
      `)
      .eq('id', id)
      .single()

    if (fetchError) {
      console.error('Error fetching updated funnel:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    return NextResponse.json({ data: funnel })
  } catch (error) {
    console.error('Error in PATCH /api/email-funnels/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email-funnels/[id] - Soft delete a funnel
export async function DELETE(
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

    // Use service role to bypass RLS
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Soft delete the funnel
    const { data, error } = await serviceClient
      .from('email_funnels')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        status: 'archived',
      })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error deleting funnel:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/email-funnels/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
