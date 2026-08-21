import { NextResponse } from 'next/server'
import { sendPhoneSignupLink } from '@/lib/phone-auth'
import { isTelnyxConfigured, isValidPhone } from '@/lib/telnyx-sms'
import type { ProfileRole } from '@/types/database.types'

type PhoneLinkRequest = {
  phone?: string
  role?: ProfileRole
  next?: string
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  let body: PhoneLinkRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid phone request' }, { status: 400 })
  }

  const phone = cleanText(body.phone)
  const role: ProfileRole = body.role === 'teacher' ? 'teacher' : 'student'
  const next = cleanText(body.next) || '/dashboard'

  if (!phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }

  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 })
  }

  if (!isTelnyxConfigured()) {
    return NextResponse.json({ error: 'Text login is not configured yet' }, { status: 503 })
  }

  try {
    const normalizedPhone = await sendPhoneSignupLink({ request, phone, role, next })
    return NextResponse.json({ success: true, phone: normalizedPhone })
  } catch (error) {
    console.error('[Phone Login] Failed to send SMS link:', error)
    return NextResponse.json({ error: 'Could not send the text link. Please try again.' }, { status: 502 })
  }
}
