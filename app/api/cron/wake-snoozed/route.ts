import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET

// GET /api/cron/wake-snoozed - Wake up snoozed threads whose snooze time has passed
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // Find all snoozed threads whose snooze time has passed
    const now = new Date().toISOString()

    const { data: snoozedThreads, error: fetchError } = await admin
      .from('email_threads')
      .select('id, subject')
      .eq('workflow_state', 'snoozed')
      .lte('snoozed_until', now)

    if (fetchError) {
      console.error('Error fetching snoozed threads:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch snoozed threads' }, { status: 500 })
    }

    if (!snoozedThreads || snoozedThreads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No snoozed threads to wake',
        woken: 0,
      })
    }

    const threadIds = snoozedThreads.map(t => t.id)

    // Wake the threads: move back to inbox and set state to needs_response
    const { error: updateError } = await admin
      .from('email_threads')
      .update({
        workflow_state: 'needs_response',
        snoozed_until: null,
        folder: 'inbox',
        updated_at: new Date().toISOString(),
      })
      .in('id', threadIds)

    if (updateError) {
      console.error('Error waking snoozed threads:', updateError)
      return NextResponse.json({ error: 'Failed to wake snoozed threads' }, { status: 500 })
    }

    console.log(`[Cron] Woke ${threadIds.length} snoozed threads`)

    return NextResponse.json({
      success: true,
      message: `Woke ${threadIds.length} snoozed threads`,
      woken: threadIds.length,
      threadIds,
    })
  } catch (error) {
    console.error('Error in wake-snoozed cron:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request)
}
