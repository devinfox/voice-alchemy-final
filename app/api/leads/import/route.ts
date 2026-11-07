import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { IMPORT_BATCH_SIZE, IMPORT_FIELDS, MAX_IMPORT_ROWS } from '@/lib/lead-import'
import { importLeadBatch, type LeadImportBatch } from '@/lib/lead-import-server'

export const runtime = 'nodejs'
export const maxDuration = 60

function validBatch(body: LeadImportBatch): boolean {
  if (!body || !Array.isArray(body.headers) || !body.headers.length || body.headers.length > 100 ||
    body.headers.some(h => typeof h !== 'string' || h.length > 500) ||
    !Array.isArray(body.rows) || !body.rows.length || body.rows.length > IMPORT_BATCH_SIZE ||
    body.rows.some(r => !Array.isArray(r) || r.length !== body.headers.length || r.some(c => typeof c !== 'string')) ||
    !body.mapping || typeof body.mapping !== 'object' || Array.isArray(body.mapping) ||
    !body.options || typeof body.options !== 'object' ||
    !['singer', 'coach'].includes(body.options.persona) ||
    !['skip', 'update'].includes(body.options.duplicates) ||
    !['subscribed', 'non-subscribed', 'unsubscribed', 'cleaned'].includes(body.options.subscription) ||
    typeof body.options.source !== 'string' || body.options.source.length > 80 ||
    typeof body.fileName !== 'string' || body.fileName.length > 255 ||
    !Number.isInteger(body.firstRow) || body.firstRow < 2 || body.firstRow + body.rows.length > MAX_IMPORT_ROWS + 2) return false
  const mapped = Object.values(body.mapping).filter(Boolean)
  return mapped.includes('email') && new Set(mapped).size === mapped.length &&
    Object.entries(body.mapping).every(([index, field]) => /^\d+$/.test(index) && Number(index) < body.headers.length &&
      (field === '' || IMPORT_FIELDS.some(f => f.key === field)))
}

export async function POST(request: NextRequest) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Lead import access required.' }, { status: 403 })
  let batch: LeadImportBatch
  try {
    const text = await request.text()
    if (text.length > 2_000_000) return NextResponse.json({ error: 'This batch is too large. Use a CSV with fewer or shorter fields.' }, { status: 413 })
    batch = JSON.parse(text)
    if (!validBatch(batch)) return NextResponse.json({ error: 'Check the column mapping and import options before trying again.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'The import request could not be read.' }, { status: 400 })
  }
  try {
    const result = await importLeadBatch(getSupabaseAdmin(), batch, profile.id)
    return NextResponse.json({ result })
  } catch (error) {
    console.error('[Lead Import]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not import this batch.' }, { status: 500 })
  }
}
