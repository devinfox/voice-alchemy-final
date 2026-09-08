import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadRecital, loadPerformances, resolveCaller } from '@/lib/recital/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/recitals/[id]/state — host transitions, persisted so late joiners
 * and refreshes recover the room state. The live broadcast to peers happens
 * client-side over the Realtime channel; this is the durable copy.
 *
 * Actions: start | end | set-performer { performanceId } |
 *          end-performance { performanceId, outcome: 'done' | 'skipped' } | clear-performer
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { isHost } = await resolveCaller(request, recital)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()

  switch (body.action) {
    case 'start': {
      if (recital.status === 'ended') return NextResponse.json({ error: 'Recital already ended' }, { status: 400 })
      await admin
        .from('recitals')
        .update({ status: 'live', started_at: recital.started_at ?? now })
        .eq('id', id)
      break
    }
    case 'end': {
      await admin
        .from('recitals')
        .update({ status: 'ended', ended_at: now, current_performance_id: null })
        .eq('id', id)
      await admin
        .from('recital_performances')
        .update({ status: 'skipped', ended_at: now })
        .eq('recital_id', id)
        .eq('status', 'performing')
      break
    }
    case 'set-performer': {
      const performanceId = typeof body.performanceId === 'string' ? body.performanceId : null
      if (!performanceId) return NextResponse.json({ error: 'performanceId required' }, { status: 400 })
      // Close out whatever was performing before.
      await admin
        .from('recital_performances')
        .update({ status: 'done', ended_at: now })
        .eq('recital_id', id)
        .eq('status', 'performing')
        .neq('id', performanceId)
      const { error } = await admin
        .from('recital_performances')
        .update({ status: 'performing', started_at: now, ended_at: null })
        .eq('id', performanceId)
        .eq('recital_id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await admin
        .from('recitals')
        .update({ current_performance_id: performanceId, status: 'live', started_at: recital.started_at ?? now })
        .eq('id', id)
      break
    }
    case 'end-performance': {
      const performanceId = typeof body.performanceId === 'string' ? body.performanceId : recital.current_performance_id
      const outcome = body.outcome === 'skipped' ? 'skipped' : 'done'
      if (performanceId) {
        await admin
          .from('recital_performances')
          .update({ status: outcome, ended_at: now })
          .eq('id', performanceId)
          .eq('recital_id', id)
      }
      await admin.from('recitals').update({ current_performance_id: null }).eq('id', id)
      break
    }
    case 'clear-performer': {
      await admin.from('recitals').update({ current_performance_id: null }).eq('id', id)
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const [updated, performances] = await Promise.all([loadRecital(id), loadPerformances(id)])
  return NextResponse.json({ recital: updated, performances })
}

/** GET — durable state for anyone holding a session token (or the host). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { claims, isHost } = await resolveCaller(request, recital)
  if (!claims && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const performances = await loadPerformances(id)
  return NextResponse.json({ recital, performances })
}
