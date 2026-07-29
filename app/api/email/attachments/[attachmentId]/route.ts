/**
 * Attachment fetch for VAAA (SendGrid-only).
 * Attachments are stored in Supabase at send/inbound time; this returns the stored row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { attachmentId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const { data: attachment, error } = await admin
      .from('email_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single()

    if (error || !attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    return NextResponse.json({ attachment })
  } catch (err) {
    console.error('[attachments]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
