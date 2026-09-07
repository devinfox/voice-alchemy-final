import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadRecital, resolveCaller, RECORDINGS_BUCKET } from '@/lib/recital/server'
import type { RecitalRecording } from '@/types/recital.types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET — host lists recordings with 7-day signed URLs. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { claims, isHost } = await resolveCaller(request, recital)
  if (!isHost && !claims) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getSupabaseAdmin()
  let query = admin
    .from('recital_recordings')
    .select('*, performance:recital_performances(performer_name, song_title)')
    .eq('recital_id', id)
    .order('created_at', { ascending: false })
  if (!isHost && claims) query = query.eq('participant_id', claims.participantId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as RecitalRecording[]
  const signed = await Promise.all(
    rows.map(async (row) => {
      const { data: urlData } = await admin.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUrl(row.storage_path, 60 * 60 * 24 * 7)
      return { ...row, url: urlData?.signedUrl }
    })
  )
  return NextResponse.json({ recordings: signed })
}

/**
 * POST — register an uploaded file.
 * Body: { storagePath, kind, performanceId?, mimeType?, fileSize?, durationSeconds? }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const recital = await loadRecital(id)
  if (!recital) return NextResponse.json({ error: 'Recital not found' }, { status: 404 })

  const { claims, isHost } = await resolveCaller(request, recital)
  if (!claims && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath : ''
  if (!storagePath.startsWith(`${id}/`)) return NextResponse.json({ error: 'Invalid storagePath' }, { status: 400 })
  const kind = body.kind === 'host-archive' ? 'host-archive' : 'performer-local'
  if (kind === 'host-archive' && !isHost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getSupabaseAdmin()

  // Make sure the object actually landed before we record it.
  const folder = storagePath.split('/').slice(0, -1).join('/')
  const filename = storagePath.split('/').pop()!
  const { data: listing } = await admin.storage.from(RECORDINGS_BUCKET).list(folder, { search: filename })
  if (!listing || listing.length === 0) {
    return NextResponse.json({ error: 'Upload not found in storage' }, { status: 404 })
  }

  const performanceId = typeof body.performanceId === 'string' ? body.performanceId : null
  const { data, error } = await admin
    .from('recital_recordings')
    .insert({
      recital_id: id,
      performance_id: performanceId,
      participant_id: claims?.participantId ?? null,
      kind,
      storage_path: storagePath,
      mime_type: typeof body.mimeType === 'string' ? body.mimeType.slice(0, 80) : null,
      file_size: Number.isFinite(body.fileSize) ? Math.round(body.fileSize) : listing[0].metadata?.size ?? null,
      duration_seconds: Number.isFinite(body.durationSeconds) ? Math.round(body.durationSeconds) : null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ recording: data }, { status: 201 })
}
