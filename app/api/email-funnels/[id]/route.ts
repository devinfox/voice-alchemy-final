import { createClient } from '@/lib/supabase-server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isTriggerKey } from '@/lib/email-leads'

// GET /api/email-funnels/[id] - Get a single funnel with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Only email-tools users (admins / Julia) may use funnels
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const supabase = await createClient()

    // Fetch funnel with phases and enrollments. There are no leads/contacts
    // tables in this app — enrollment recipients are profiles/users, resolved
    // by the callers that need them.
    const { data: funnel, error } = await supabase
      .from('email_funnels')
      .select(`
        *,
        phases:email_funnel_phases(
          *,
          template:email_templates(id, name, subject)
        ),
        enrollments:email_funnel_enrollments(*)
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
    const { id } = await params
    const body = await request.json()

    // Only email-tools users (admins / Julia) may use funnels
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const { name, description, status, phases, tags, auto_enroll_enabled, trigger_key, audience_id } = body
    if (trigger_key !== undefined && trigger_key !== null && trigger_key !== '' && !isTriggerKey(trigger_key)) {
      return NextResponse.json({ error: 'Unknown trigger' }, { status: 400 })
    }

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
    if (trigger_key !== undefined) updateData.trigger_key = trigger_key || null
    if (audience_id !== undefined) updateData.audience_id = audience_id || null

    console.log('[Email Funnels API] Updating funnel:', { id, updateData })

    const { data: updateResult, error: updateError } = await serviceClient
      .from('email_funnels')
      .update(updateData)
      .eq('id', id)
      .select()

    if (updateError) {
      console.error('[Email Funnels API] Error updating funnel:', updateError)
      if (updateError.code === '23505') {
        return NextResponse.json({ error: 'Another funnel already uses that trigger. Each trigger can only start one funnel.' }, { status: 409 })
      }
      return NextResponse.json({
        error: updateError.message,
        details: updateError,
        hint: updateError.hint || 'Check if tags and auto_enroll_enabled columns exist in email_funnels table'
      }, { status: 500 })
    }

    console.log('[Email Funnels API] Update result:', updateResult)

    // Update phases if provided. Upsert rather than delete-and-reinsert:
    // deleting phases cascades away email_funnel_logs and wipes per-phase
    // stats, so existing phases are updated in place, new ones inserted, and
    // only genuinely removed phases deleted.
    if (phases !== undefined) {
      const { data: existingPhases, error: existingError } = await serviceClient
        .from('email_funnel_phases')
        .select('id')
        .eq('funnel_id', id)

      if (existingError) {
        console.error('Error fetching existing phases:', existingError)
        return NextResponse.json({ error: existingError.message }, { status: 500 })
      }

      const existingIds = new Set((existingPhases || []).map(p => p.id))
      const keptIds = new Set<string>()

      const incoming: Array<{
        id?: string
        template_id?: string
        name?: string
        delay_days?: number
        delay_hours?: number
      }> = phases

      for (const [index, phase] of incoming.entries()) {
        const phaseData = {
          template_id: phase.template_id || null,
          phase_order: index + 1,
          name: phase.name || `Phase ${index + 1}`,
          delay_days: phase.delay_days || 0,
          delay_hours: phase.delay_hours || 0,
        }

        if (phase.id && existingIds.has(phase.id)) {
          // Existing phase — update in place, preserving logs/stats
          keptIds.add(phase.id)
          const { error: phaseError } = await serviceClient
            .from('email_funnel_phases')
            .update(phaseData)
            .eq('id', phase.id)
            .eq('funnel_id', id)

          if (phaseError) {
            console.error('Error updating phase:', phaseError)
            return NextResponse.json({ error: phaseError.message }, { status: 500 })
          }
        } else {
          // New phase (no id, or a client-generated placeholder id)
          const { error: phaseError } = await serviceClient
            .from('email_funnel_phases')
            .insert({ funnel_id: id, ...phaseData })

          if (phaseError) {
            console.error('Error inserting phase:', phaseError)
            return NextResponse.json({ error: phaseError.message }, { status: 500 })
          }
        }
      }

      // Delete only the phases the client actually removed
      const removedIds = [...existingIds].filter(phaseId => !keptIds.has(phaseId))
      if (removedIds.length > 0) {
        const { error: deleteError } = await serviceClient
          .from('email_funnel_phases')
          .delete()
          .eq('funnel_id', id)
          .in('id', removedIds)

        if (deleteError) {
          console.error('Error deleting removed phases:', deleteError)
          return NextResponse.json({ error: deleteError.message }, { status: 500 })
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
    const { id } = await params

    // Only email-tools users (admins / Julia) may use funnels
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
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
