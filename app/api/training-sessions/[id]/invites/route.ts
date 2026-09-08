import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadSession, loadTrainingParticipants, normalizeEmail, resolveTrainingCaller, sanitizeName } from '@/lib/training/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

/**
 * POST — host pre-approves people. Body: { people: [{ firstName, lastName, email }] }
 * Anyone who joins with a matching email skips the waiting room.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await loadSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const { isHost } = await resolveTrainingCaller(request, session)
  if (!isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const people: unknown = body.people
  if (!Array.isArray(people) || people.length === 0) return NextResponse.json({ error: 'Add at least one person' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const existing = await loadTrainingParticipants(id)
  const byEmail = new Map(existing.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]))
  const rows: Array<Record<string, unknown>> = []
  const updates: Array<PromiseLike<unknown>> = []

  for (const raw of people.slice(0, 200)) {
    const p = (raw || {}) as Record<string, unknown>
    const firstName = sanitizeName(p.firstName, '')
    const lastName = sanitizeName(p.lastName, '')
    const email = normalizeEmail(p.email)
    if (!firstName || !email) continue
    const match = byEmail.get(email)
    if (match) {
      updates.push(
        admin
          .from('training_session_participants')
          .update({ invited: true, denied_at: null, first_name: firstName, last_name: lastName })
          .eq('id', match.id)
      )
      continue
    }
    rows.push({ session_id: id, first_name: firstName, last_name: lastName, email, role: 'attendee', invited: true })
  }

  await Promise.all(updates)
  if (rows.length > 0) {
    const { error } = await admin.from('training_session_participants').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ participants: await loadTrainingParticipants(id) })
}
