import { requireEmailAccess } from '@/lib/email-access-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/email-funnels/enroll - Enroll leads in a funnel
export async function POST(request: NextRequest) {
  try {
    // Only email-tools users (admins / Julia) may use funnels
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
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
      enrolled_by: profile.id,
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

// GET /api/email-funnels/enroll - Get enrollable recipients for preview
// VAAA has no leads table (and no ai_tags data): candidates are profiles,
// with emails joined in from the `users` mirror table.
export async function GET(request: NextRequest) {
  try {
    // Only email-tools users (admins / Julia) may use funnels
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const funnelId = searchParams.get('funnel_id')

    // Use service role to fetch candidate recipients
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: candidates, error: candidatesError } = await serviceClient
      .from('profiles')
      .select('id, first_name, last_name, name')
      .order('first_name', { ascending: true })

    if (candidatesError) {
      console.error('Error fetching candidates:', candidatesError)
      return NextResponse.json({ error: candidatesError.message }, { status: 500 })
    }

    const candidateIds = (candidates || []).map(c => c.id)
    const emailById = new Map<string, string>()
    if (candidateIds.length > 0) {
      const { data: userRows } = await serviceClient
        .from('users')
        .select('id, email')
        .in('id', candidateIds)

      for (const row of userRows || []) {
        if (row.email) emailById.set(row.id, row.email)
      }
    }

    // Only people with an email address can be enrolled
    const matchingLeads = (candidates || [])
      .map(c => ({ ...c, email: emailById.get(c.id) || null }))
      .filter(c => !!c.email)

    // If funnel_id provided, check which recipients are already enrolled
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

    // Add enrollment status
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
