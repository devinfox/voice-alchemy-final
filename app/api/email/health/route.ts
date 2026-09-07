import { NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { runEmailHealthChecks } from '@/lib/email-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/email/health - read-only diagnostics for the email pipeline
export async function GET() {
  const profile = await requireEmailAccess()
  if (!profile) {
    return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })
  }
  try {
    const report = await runEmailHealthChecks(profile.id)
    return NextResponse.json(report)
  } catch (err) {
    console.error('[email/health] failed:', err)
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
