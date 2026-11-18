import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyRecitalSession } from '@/lib/recital/session-token'
import { createJoinToken, livekitConfig, livekitConfigured } from '@/lib/livekit-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/recitals/livekit: is the media server switched on? The room picks
 * its transport from this: LiveKit when it is, the browser-to-browser mesh
 * when it is not.
 */
export async function GET() {
  return NextResponse.json({ enabled: livekitConfigured() })
}

/**
 * POST /api/recitals/livekit: the one way into a group call's media room.
 *
 * The caller proves who they are with the class/recital session token from
 * the join route. The server then checks the participant row itself, so
 * someone still in the waiting room (or turned away) gets no token, whatever
 * their browser claims.
 */
export async function POST(request: NextRequest) {
  const cfg = livekitConfig()
  if (!cfg) return NextResponse.json({ error: 'Group video is not configured on this server.' }, { status: 503 })

  const header = request.headers.get('authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const claims = bearer ? await verifyRecitalSession(bearer) : null
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()
  let name = 'Guest'
  let host = claims.role === 'host'
  let guest = true

  // A group class participant, or a recital participant: the id is in one table or the other.
  const { data: attendee } = await admin
    .from('training_session_participants')
    .select('id, role, first_name, last_name, profile_id, admitted_at, denied_at')
    .eq('id', claims.participantId)
    .eq('session_id', claims.recitalId)
    .maybeSingle()

  if (attendee) {
    host = attendee.role === 'host'
    if (!host && (!attendee.admitted_at || attendee.denied_at)) {
      return NextResponse.json({ error: 'Waiting for the host to let you in.' }, { status: 403 })
    }
    name = [attendee.first_name, attendee.last_name].filter(Boolean).join(' ') || name
    guest = !attendee.profile_id
  } else {
    const { data: participant } = await admin
      .from('recital_participants')
      .select('id, role, display_name, profile_id')
      .eq('id', claims.participantId)
      .eq('recital_id', claims.recitalId)
      .maybeSingle()
    // Removed by the host (the row is deleted) or never joined.
    if (!participant) return NextResponse.json({ error: 'You are not in this session.' }, { status: 403 })
    host = participant.role === 'host'
    name = participant.display_name || name
    guest = !participant.profile_id
  }

  const room = `vaa-${claims.recitalId}`
  const token = await createJoinToken({
    room,
    identity: claims.participantId,
    name,
    meta: { host, waiting: false, guest },
  })

  return NextResponse.json({ url: cfg.url, token, room, identity: claims.participantId, name, host, waiting: false })
}
