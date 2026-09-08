import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadRecital, resolveCaller, RECORDINGS_BUCKET } from '@/lib/recital/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/recitals/[id]/recordings/presign
 * Body: { kind: 'performer-local' | 'host-archive', performanceId?: string, ext?: 'webm' | 'mp4' }
 * Returns a signed upload URL into the private recital-recordings bucket.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { claims, isHost } = await resolveCaller(request, recital)
  if (!claims && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const kind = body.kind === 'host-archive' ? 'host-archive' : 'performer-local'
  if (kind === 'host-archive' && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ext = body.ext === 'mp4' ? 'mp4' : 'webm'
  const performanceId = typeof body.performanceId === 'string' ? body.performanceId : 'untracked'
  const owner = claims?.participantId ?? 'host'
  const storagePath = `${id}/${performanceId}/${kind}-${owner}-${Date.now()}.${ext}`

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.storage.from(RECORDINGS_BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Could not create upload URL' }, { status: 500 })
  }

  return NextResponse.json({ uploadUrl: data.signedUrl, token: data.token, storagePath })
}
