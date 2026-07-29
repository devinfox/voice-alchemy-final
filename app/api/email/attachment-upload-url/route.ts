import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

/**
 * POST /api/email/attachment-upload-url
 *
 * Returns a signed URL for uploading an email attachment directly to Supabase
 * Storage from the browser. This bypasses the serverless request-body size
 * limit (~4.5MB) that base64-in-JSON attachments hit on /api/email/send.
 * The send route later downloads the staged file by its storage_path.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { fromAccountId, filename } = await request.json()
    if (!fromAccountId || !filename) {
      return NextResponse.json({ error: 'Missing fromAccountId or filename' }, { status: 400 })
    }

    const safeName = String(filename).replace(/[^\w.\- ]+/g, '_')
    const storagePath = `emails/${fromAccountId}/pending/${crypto.randomUUID()}/${safeName}`

    const { data, error } = await getSupabaseAdmin().storage
      .from('email-attachments')
      .createSignedUploadUrl(storagePath)

    if (error || !data) {
      console.error('[Email Attachment Upload URL] Failed:', error)
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
    }

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      storagePath,
    })
  } catch (error) {
    console.error('[Email Attachment Upload URL] Error:', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
