import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// ============================================================================
// GET - Fetch recent lesson notes for training overview
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch recent lesson notes for this user
    const { data: notes, error } = await supabase
      .from('notes_archive')
      .select('id, class_started_at, class_ended_at, content, content_html, ai_summary')
      .eq('student_id', user.id)
      .eq('published', true)
      .order('class_started_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching notes:', error)
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
    }

    return NextResponse.json({ notes: notes || [] })

  } catch (error) {
    console.error('Recent notes error:', error)
    return NextResponse.json({ error: 'Failed to fetch recent notes' }, { status: 500 })
  }
}
