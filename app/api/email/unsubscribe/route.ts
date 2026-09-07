import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeEmail, verifyUnsubscribeToken } from '@/lib/email-unsubscribe'
import { cancelEnrollmentsByEmail } from '@/lib/email-leads'

export const runtime = 'nodejs'

/**
 * One-click unsubscribe. Linked from every template footer via
 * {{unsubscribe_url}} and from the List-Unsubscribe header.
 *
 *   GET  /api/email/unsubscribe?e=<email>&t=<token>  -> confirmation page
 *   POST /api/email/unsubscribe?e=<email>&t=<token>  -> RFC 8058 one-click
 */

function page(title: string, body: string, ok: boolean) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#0b0817;color:#f3effa;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.card{max-width:520px;margin:12vh auto;padding:40px 32px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:#120d24;text-align:center}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:30px;margin:0 0 12px;color:${ok ? '#ceb466' : '#f3effa'}}
p{margin:0 0 10px;color:#a79fbb}a{color:#ceb466}</style></head>
<body><div class="card"><h1>${title}</h1>${body}<p style="margin-top:24px;font-size:13px">Voice Alchemy Academy · <a href="https://voicealchemyacademy.com">voicealchemyacademy.com</a></p></div></body></html>`
}

async function unsubscribe(request: NextRequest): Promise<{ ok: boolean; email: string }> {
  const { searchParams } = new URL(request.url)
  const email = normalizeEmail(searchParams.get('e') || '')
  const token = searchParams.get('t')
  if (!email || !verifyUnsubscribeToken(email, token)) return { ok: false, email }

  const admin = getSupabaseAdmin()
  const nowIso = new Date().toISOString()
  await admin.from('email_unsubscribes').upsert({ email, reason: 'link', created_at: nowIso }, { onConflict: 'email' })
  await admin.from('email_leads').update({ is_unsubscribed: true, updated_at: nowIso }).eq('email', email)
  await cancelEnrollmentsByEmail(admin, email, 'Unsubscribed')
  return { ok: true, email }
}

export async function GET(request: NextRequest) {
  try {
    const { ok, email } = await unsubscribe(request)
    const html = ok
      ? page('You are unsubscribed.', `<p>${email} will not receive any more automated emails from Voice Alchemy Academy.</p><p>Your account and the free tools in the Training Center are unaffected.</p>`, true)
      : page('That link did not work.', `<p>The unsubscribe link is missing or has been altered. Reply to any of our emails and we will take you off the list by hand.</p>`, false)
    return new NextResponse(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (err) {
    console.error('[email/unsubscribe] failed:', err)
    return new NextResponse(page('Something went wrong.', '<p>Please try again in a moment, or reply to any of our emails.</p>', false), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { ok } = await unsubscribe(request)
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 })
  } catch (err) {
    console.error('[email/unsubscribe] failed:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
