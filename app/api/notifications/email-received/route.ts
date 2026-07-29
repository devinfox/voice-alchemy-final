import { NextRequest, NextResponse } from 'next/server'
import { notifyUserOfEmail } from '@/lib/email-notification-service'

/**
 * Internal hook fired after inbound mail is stored.
 * Body: { userId, emailId, threadId, fromEmail, fromName, subject }
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.INTERNAL_API_SECRET
    if (secret && request.headers.get('x-internal-secret') !== secret) {
      // Allow if no secret configured (dev)
      if (secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const result = await notifyUserOfEmail({
      userId: body.userId,
      emailId: body.emailId,
      threadId: body.threadId,
      fromEmail: body.fromEmail,
      fromName: body.fromName ?? null,
      subject: body.subject ?? '',
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[notifications/email-received]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
