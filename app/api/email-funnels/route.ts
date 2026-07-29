import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/email-funnels - List all funnels
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch funnels with phases
    const { data: funnels, error } = await supabase
      .from('email_funnels')
      .select(`
        *,
        phases:email_funnel_phases(
          *,
          template:email_templates(id, name, subject)
        )
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching funnels:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sort phases by phase_order
    const funnelsWithSortedPhases = funnels?.map(funnel => ({
      ...funnel,
      phases: funnel.phases?.sort((a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order)
    }))

    return NextResponse.json({ data: funnelsWithSortedPhases })
  } catch (error) {
    console.error('Error in GET /api/email-funnels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/email-funnels - Create a new funnel
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, description, status, phases } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Use service role for complex transactions
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Look up the user in the users table by email
    let createdBy: string | null = null
    if (user.email) {
      const { data: dbUser } = await serviceClient
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single()
      createdBy = dbUser?.id || null
    }

    // Create the funnel
    const { data: funnel, error: funnelError } = await serviceClient
      .from('email_funnels')
      .insert({
        name,
        description: description || null,
        status: status || 'draft',
        created_by: createdBy,
      })
      .select()
      .single()

    if (funnelError) {
      console.error('Error creating funnel:', funnelError)
      return NextResponse.json({ error: funnelError.message }, { status: 500 })
    }

    // Create phases if provided
    if (phases && phases.length > 0) {
      const phasesData = phases.map((phase: {
        template_id?: string
        name?: string
        delay_days?: number
        delay_hours?: number
      }, index: number) => ({
        funnel_id: funnel.id,
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
        console.error('Error creating phases:', phasesError)
        // Rollback funnel creation
        await serviceClient.from('email_funnels').delete().eq('id', funnel.id)
        return NextResponse.json({ error: phasesError.message }, { status: 500 })
      }
    }

    // Fetch the complete funnel with phases
    const { data: completeFunnel, error: fetchError } = await serviceClient
      .from('email_funnels')
      .select(`
        *,
        phases:email_funnel_phases(
          *,
          template:email_templates(id, name, subject)
        )
      `)
      .eq('id', funnel.id)
      .single()

    if (fetchError) {
      console.error('Error fetching created funnel:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    return NextResponse.json({ data: completeFunnel })
  } catch (error) {
    console.error('Error in POST /api/email-funnels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
