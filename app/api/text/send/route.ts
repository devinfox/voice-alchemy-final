import { NextResponse } from 'next/server'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { sendSms } from '@/lib/telnyx-sms'

const SMS_ALLOWED_ROLES = ['admin', 'teacher', 'instructor']

type TextRequest = {
  phone?: string
  message?: string
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  }

  const profile = await getCurrentUser()
  if (!profile?.role || !SMS_ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  let body: TextRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const phone = cleanText(body.phone)
  const message = cleanText(body.message)

  if (!/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: 'Phone must be 10 digits, no +1 or dashes' }, { status: 400 })
  }

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  if (message.length > 1000) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
  }

  try {
    const result = await sendSms({ to: `+1${phone}`, body: message })
    return NextResponse.json({ success: true, to: result.to, status: result.status })
  } catch (error) {
    console.error('[Text Send] SMS failed:', error)
    return NextResponse.json({ error: 'Text failed to send' }, { status: 502 })
  }
}
