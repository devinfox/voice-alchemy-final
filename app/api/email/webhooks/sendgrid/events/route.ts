import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyWebhookSignature } from '@/lib/sendgrid'

interface SendGridEvent {
  email: string
  timestamp: number
  'smtp-id'?: string
  event: 'processed' | 'deferred' | 'delivered' | 'open' | 'click' | 'bounce' | 'dropped' | 'spamreport' | 'unsubscribe' | 'group_unsubscribe' | 'group_resubscribe'
  category?: string[]
  sg_event_id?: string
  sg_message_id?: string
  response?: string
  attempt?: string
  useragent?: string
  ip?: string
  url?: string
  reason?: string
  status?: string
  bounce_classification?: string
  type?: string
}

// POST /api/email/webhooks/sendgrid/events - Handle SendGrid event webhooks
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const events: SendGridEvent[] = JSON.parse(body)

    // Optional: Verify webhook signature
    const signature = request.headers.get('X-Twilio-Email-Event-Webhook-Signature')
    const timestamp = request.headers.get('X-Twilio-Email-Event-Webhook-Timestamp')
    const webhookSecret = process.env.SENDGRID_WEBHOOK_SECRET

    if (webhookSecret && signature && timestamp) {
      const isValid = verifyWebhookSignature(body, signature, timestamp, webhookSecret)
      if (!isValid) {
        console.error('Invalid webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Process each event
    for (const event of events) {
      const sgMessageId = event.sg_message_id || event['smtp-id']

      if (!sgMessageId) {
        console.log('Event without message ID:', event.event)
        continue
      }

      // Clean up the message ID (remove angle brackets if present)
      const cleanMessageId = sgMessageId.replace(/[<>]/g, '').split('.')[0]

      // Find the email by SendGrid message ID
      const { data: email } = await getSupabaseAdmin()
        .from('emails')
        .select('id, account_id, status')
        .or(`sendgrid_message_id.eq.${cleanMessageId},sendgrid_message_id.eq.${sgMessageId}`)
        .limit(1)
        .single()

      if (!email) {
        console.log('Email not found for message ID:', cleanMessageId)
        continue
      }

      // Create event record
      await getSupabaseAdmin().from('email_events').insert({
        email_id: email.id,
        event_type: event.event,
        event_data: {
          email: event.email,
          timestamp: event.timestamp,
          useragent: event.useragent,
          ip: event.ip,
          url: event.url,
          reason: event.reason,
          status: event.status,
          bounce_classification: event.bounce_classification,
          response: event.response,
        },
        sendgrid_event_id: event.sg_event_id,
        occurred_at: new Date(event.timestamp * 1000).toISOString(),
      })

      // Update email status based on event type
      let newStatus: string | null = null
      const updates: Record<string, any> = {}

      switch (event.event) {
        case 'delivered':
          newStatus = 'delivered'
          updates.delivered_at = new Date(event.timestamp * 1000).toISOString()
          break
        case 'open':
          if (email.status !== 'clicked') {
            newStatus = 'opened'
          }
          updates.opened_at = new Date(event.timestamp * 1000).toISOString()
          updates.open_count = getSupabaseAdmin().rpc('increment', { x: 1 })
          break
        case 'click':
          newStatus = 'clicked'
          updates.click_count = getSupabaseAdmin().rpc('increment', { x: 1 })
          break
        case 'bounce':
          newStatus = 'bounced'
          updates.error_message = event.reason || 'Email bounced'
          updates.bounce_type = event.type
          break
        case 'dropped':
          newStatus = 'failed'
          updates.error_message = event.reason || 'Email dropped'
          break
        case 'spamreport':
          updates.is_spam_reported = true
          break
        case 'unsubscribe':
        case 'group_unsubscribe':
          updates.is_unsubscribed = true
          break
        case 'deferred':
          // Don't change status, just record the event
          break
      }

      if (newStatus || Object.keys(updates).length > 0) {
        if (newStatus) {
          updates.status = newStatus
        }
        updates.updated_at = new Date().toISOString()

        await getSupabaseAdmin()
          .from('emails')
          .update(updates)
          .eq('id', email.id)
      }

      console.log(`Processed ${event.event} event for email ${email.id}`)
    }

    return NextResponse.json({ received: true, processed: events.length })
  } catch (error) {
    console.error('Events webhook error:', error)
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }
}
