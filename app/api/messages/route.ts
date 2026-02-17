import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/messages - Get messages for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const otherUserId = searchParams.get('userId')

    if (!otherUserId) {
      // Get all conversations (unique users who have messaged with current user)
      const { data: sentMessages, error: sentError } = await supabase
        .from('messages')
        .select(`
          recipient_id,
          recipient:recipient_id (id, first_name, last_name, name, avatar_url)
        `)
        .eq('sender_id', profile.id)
        .order('created_at', { ascending: false })

      const { data: receivedMessages, error: receivedError } = await supabase
        .from('messages')
        .select(`
          sender_id,
          sender:sender_id (id, first_name, last_name, name, avatar_url)
        `)
        .eq('recipient_id', profile.id)
        .order('created_at', { ascending: false })

      if (sentError || receivedError) {
        console.error('[Messages API] Error fetching conversations:', sentError || receivedError)
        return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
      }

      // Get unique conversation partners
      const conversationMap = new Map<string, unknown>()

      sentMessages?.forEach((msg) => {
        const recipient = Array.isArray(msg.recipient) ? msg.recipient[0] : msg.recipient
        if (recipient && !conversationMap.has(recipient.id)) {
          conversationMap.set(recipient.id, recipient)
        }
      })

      receivedMessages?.forEach((msg) => {
        const sender = Array.isArray(msg.sender) ? msg.sender[0] : msg.sender
        if (sender && !conversationMap.has(sender.id)) {
          conversationMap.set(sender.id, sender)
        }
      })

      return NextResponse.json({
        conversations: Array.from(conversationMap.values()),
      })
    }

    // Get messages between current user and specified user
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        read_at,
        sender_id,
        recipient_id
      `)
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${profile.id})`)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      console.error('[Messages API] Error fetching messages:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Mark received messages as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', otherUserId)
      .eq('recipient_id', profile.id)
      .is('read_at', null)

    return NextResponse.json({ messages, currentUserId: profile.id })
  } catch (error) {
    console.error('[Messages API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/messages - Send a message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { recipientId, content } = body

    if (!recipientId || !content?.trim()) {
      return NextResponse.json({ error: 'Recipient and content are required' }, { status: 400 })
    }

    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify recipient exists
    const { data: recipient, error: recipientError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', recipientId)
      .single()

    if (recipientError || !recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }

    // Create the message
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        sender_id: profile.id,
        recipient_id: recipientId,
        content: content.trim(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Messages API] Error sending message:', insertError)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('[Messages API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
