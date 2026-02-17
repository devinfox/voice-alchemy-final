import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// ============================================================================
// GET - Get a single songwriting document
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: document, error } = await supabase
      .from('songwriting_documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ document })

  } catch (error) {
    console.error('Songwriting GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// PATCH - Update a songwriting document
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      title,
      vibe,
      mood,
      genre,
      tempo,
      inspirationStory,
      keyEmotions,
      targetAudience,
      content,
      plainText,
      status,
      isFavorite,
      hasVerse,
      hasChorus,
      hasBridge,
      hasPreChorus,
      lastAiFeedback,
    } = body

    // Build update object
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (vibe !== undefined) updates.vibe = vibe
    if (mood !== undefined) updates.mood = mood
    if (genre !== undefined) updates.genre = genre
    if (tempo !== undefined) updates.tempo = tempo
    if (inspirationStory !== undefined) updates.inspiration_story = inspirationStory
    if (keyEmotions !== undefined) updates.key_emotions = keyEmotions
    if (targetAudience !== undefined) updates.target_audience = targetAudience
    if (content !== undefined) updates.content = content
    if (plainText !== undefined) {
      updates.plain_text = plainText
      updates.word_count = plainText.split(/\s+/).filter(Boolean).length
      updates.character_count = plainText.length
    }
    if (status !== undefined) updates.status = status
    if (isFavorite !== undefined) updates.is_favorite = isFavorite
    if (hasVerse !== undefined) updates.has_verse = hasVerse
    if (hasChorus !== undefined) updates.has_chorus = hasChorus
    if (hasBridge !== undefined) updates.has_bridge = hasBridge
    if (hasPreChorus !== undefined) updates.has_pre_chorus = hasPreChorus
    if (lastAiFeedback !== undefined) updates.last_ai_feedback = lastAiFeedback

    const { data: document, error } = await supabase
      .from('songwriting_documents')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating songwriting document:', error)
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    return NextResponse.json({ document })

  } catch (error) {
    console.error('Songwriting PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// DELETE - Soft delete a songwriting document
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('songwriting_documents')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting songwriting document:', error)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Songwriting DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
