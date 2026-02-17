import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// ============================================================================
// GET - List user's songwriting documents
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('songwriting_documents')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('Error fetching songwriting documents:', error)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    return NextResponse.json({ documents })

  } catch (error) {
    console.error('Songwriting GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// POST - Create a new songwriting document
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      title = 'Untitled Song',
      vibe,
      mood,
      genre,
      tempo,
      inspirationStory,
      keyEmotions,
      targetAudience,
    } = body

    const { data: document, error } = await supabase
      .from('songwriting_documents')
      .insert({
        user_id: user.id,
        title,
        vibe,
        mood,
        genre,
        tempo,
        inspiration_story: inspirationStory,
        key_emotions: keyEmotions,
        target_audience: targetAudience,
        content: {},
        status: 'draft',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating songwriting document:', error)
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
    }

    return NextResponse.json({ document })

  } catch (error) {
    console.error('Songwriting POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
