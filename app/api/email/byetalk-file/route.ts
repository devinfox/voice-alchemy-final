import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildByeTalkExport, ByeTalkFileKind, SheetExportFormat } from '@/lib/email/byetalk-file-utils'

async function getUserOrgId() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return { error: 'Unauthorized', status: 401, organizationId: null as string | null }

  return { error: null as string | null, status: 200, organizationId: null as string | null }
}

function parseKind(value: string | null): ByeTalkFileKind | null {
  if (value === 'document' || value === 'sheet' || value === 'presentation' || value === 'project_file') return value
  return null
}

function parseFormat(value: string | null): SheetExportFormat | undefined {
  if (value === 'csv' || value === 'xlsx') return value
  return undefined
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getUserOrgId()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const kind = parseKind(searchParams.get('kind'))
    const id = searchParams.get('id')
    const format = parseFormat(searchParams.get('format'))

    if (!kind || !id) {
      return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
    }

    const exported = await buildByeTalkExport({
      organizationId: auth.organizationId,
      kind,
      id,
      format,
    })

    if (!exported) {
      return NextResponse.json(
        { error: 'Document attachments are not available in Voice Alchemy Academy' },
        { status: 501 }
      )
    }

    return new NextResponse(new Uint8Array(exported.data), {
      status: 200,
      headers: {
        'Content-Type': exported.contentType,
        'Content-Disposition': `attachment; filename="${exported.filename}"`,
        'Content-Length': String(exported.data.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[byetalk-file GET] Error:', error)
    return NextResponse.json({ error: (error as Error).message || 'Failed to export file' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getUserOrgId()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const kind = parseKind(body.kind || null)
    const id = typeof body.id === 'string' ? body.id : null
    const format = parseFormat(body.format || null)

    if (!kind || !id) {
      return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
    }

    const exported = await buildByeTalkExport({
      organizationId: auth.organizationId,
      kind,
      id,
      format,
    })

    if (!exported) {
      return NextResponse.json(
        { error: 'Document attachments are not available in Voice Alchemy Academy' },
        { status: 501 }
      )
    }

    return NextResponse.json({
      filename: exported.filename,
      contentType: exported.contentType,
      contentBase64: exported.data.toString('base64'),
      size: exported.data.byteLength,
      kind,
      id,
      format: format || null,
    })
  } catch (error) {
    console.error('[byetalk-file POST] Error:', error)
    return NextResponse.json({ error: (error as Error).message || 'Failed to export file' }, { status: 500 })
  }
}
