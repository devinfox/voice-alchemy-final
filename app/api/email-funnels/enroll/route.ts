import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/email-funnels/enroll - Enroll leads in a funnel
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { funnel_id, lead_ids } = body

    if (!funnel_id) {
      return NextResponse.json({ error: 'funnel_id is required' }, { status: 400 })
    }

    if (!lead_ids || lead_ids.length === 0) {
      return NextResponse.json({ error: 'At least one lead_id is required' }, { status: 400 })
    }

    // Use service role for complex transactions
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify funnel exists and is active
    const { data: funnel, error: funnelError } = await serviceClient
      .from('email_funnels')
      .select('id, status, total_enrolled, phases:email_funnel_phases(id, phase_order, delay_days, delay_hours)')
      .eq('id', funnel_id)
      .eq('is_deleted', false)
      .single()

    if (funnelError || !funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
    }

    if (funnel.status !== 'active') {
      return NextResponse.json({ error: 'Funnel must be active to enroll leads' }, { status: 400 })
    }

    // Sort phases by order
    const phases = (funnel.phases || []).sort((a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order)

    if (phases.length === 0) {
      return NextResponse.json({ error: 'Funnel has no phases configured' }, { status: 400 })
    }

    const now = new Date()
    const enrolledAt = now.toISOString()

    // Calculate next email scheduled time based on first phase delay
    const firstPhase = phases[0]
    const delayMs = ((firstPhase.delay_days || 0) * 24 * 60 + (firstPhase.delay_hours || 0) * 60) * 60 * 1000
    const nextEmailAt = new Date(now.getTime() + delayMs).toISOString()

    // Check for existing enrollments to avoid duplicates
    const { data: existingEnrollments } = await serviceClient
      .from('email_funnel_enrollments')
      .select('lead_id')
      .eq('funnel_id', funnel_id)
      .in('lead_id', lead_ids)
      .in('status', ['active', 'paused'])

    const existingLeadIds = (existingEnrollments || []).map(e => e.lead_id)

    // Filter out already enrolled
    const newLeadIds = lead_ids.filter((id: string) => !existingLeadIds.includes(id))

    if (newLeadIds.length === 0) {
      return NextResponse.json({
        success: true,
        enrolled: 0,
        skipped: lead_ids.length,
        message: 'All selected leads are already enrolled in this funnel'
      })
    }

    // Create enrollment records
    const enrollments = newLeadIds.map((lead_id: string) => ({
      funnel_id,
      lead_id,
      status: 'active',
      current_phase: 1,
      enrolled_at: enrolledAt,
      enrolled_by: user.id,
      next_email_scheduled_at: nextEmailAt,
    }))

    const { data: insertedEnrollments, error: enrollError } = await serviceClient
      .from('email_funnel_enrollments')
      .insert(enrollments)
      .select()

    if (enrollError) {
      console.error('Error creating enrollments:', enrollError)
      return NextResponse.json({ error: enrollError.message }, { status: 500 })
    }

    // Update funnel stats
    await serviceClient
      .from('email_funnels')
      .update({
        total_enrolled: funnel.total_enrolled + enrollments.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', funnel_id)

    return NextResponse.json({
      success: true,
      enrolled: enrollments.length,
      skipped: existingLeadIds.length,
      enrollments: insertedEnrollments,
    })
  } catch (error) {
    console.error('Error in POST /api/email-funnels/enroll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/email-funnels/enroll?tags=tag1,tag2 - Get leads by tags for enrollment preview
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || []
    const funnelId = searchParams.get('funnel_id')

    if (tags.length === 0) {
      return NextResponse.json({ error: 'At least one tag is required' }, { status: 400 })
    }

    // Use service role to fetch leads
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch all leads with AI tags
    const { data: leads, error: leadsError } = await serviceClient
      .from('leads')
      .select('id, first_name, last_name, email, ai_tags')
      .eq('is_deleted', false)
      .not('ai_tags', 'is', null)

    if (leadsError) {
      console.error('Error fetching leads:', leadsError)
      return NextResponse.json({ error: leadsError.message }, { status: 500 })
    }

    // Filter leads that have ANY of the specified tags
    const matchingLeads = (leads || []).filter(lead => {
      const leadTags = lead.ai_tags as Array<{ label: string; category: string }> | null
      if (!leadTags || !Array.isArray(leadTags)) return false

      return leadTags.some(tag =>
        tags.some(searchTag =>
          tag.label.toLowerCase().includes(searchTag.toLowerCase()) ||
          tag.category.toLowerCase().includes(searchTag.toLowerCase())
        )
      )
    })

    // If funnel_id provided, check which leads are already enrolled
    let enrolledLeadIds: string[] = []
    if (funnelId) {
      const { data: enrollments } = await serviceClient
        .from('email_funnel_enrollments')
        .select('lead_id')
        .eq('funnel_id', funnelId)
        .in('status', ['active', 'paused'])
        .not('lead_id', 'is', null)

      enrolledLeadIds = (enrollments || []).map(e => e.lead_id)
    }

    // Add enrollment status to leads
    const leadsWithStatus = matchingLeads.map(lead => ({
      ...lead,
      already_enrolled: enrolledLeadIds.includes(lead.id),
    }))

    return NextResponse.json({
      data: leadsWithStatus,
      total: leadsWithStatus.length,
      already_enrolled: leadsWithStatus.filter(l => l.already_enrolled).length,
    })
  } catch (error) {
    console.error('Error in GET /api/email-funnels/enroll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
