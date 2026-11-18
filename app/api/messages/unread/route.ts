import { createClient, getAuthUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/messages/unread - Get unread message count
export async function GET() {
  try {
    // Polled from every page: only the signed-in user's id is needed, so skip
    // the extra profile lookup.
    const [supabase, user] = await Promise.all([createClient(), getAuthUser()])

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null)

    if (error) {
      console.error('[Messages API] Error fetching unread count:', error)
      return NextResponse.json({ error: 'Failed to fetch unread count' }, { status: 500 })
    }

    return NextResponse.json({ unreadCount: count || 0 })
  } catch (error) {
    console.error('[Messages API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
