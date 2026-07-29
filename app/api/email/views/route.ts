import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/views - Get user's saved views
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    const { data: views, error } = await admin
      .from('email_saved_views')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching views:', error)
      return NextResponse.json({ error: 'Failed to fetch views' }, { status: 500 })
    }

    return NextResponse.json(views || [])
  } catch (error) {
    console.error('Error in GET /api/email/views:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/email/views - Create or update a saved view
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, name, icon, color, filters, is_pinned } = body

    if (!name) {
      return NextResponse.json({ error: 'View name is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    if (id) {
      // Update existing view (only non-system views)
      const { data: view, error } = await admin
        .from('email_saved_views')
        .update({
          name,
          icon: icon || 'folder',
          color: color || '#6366f1',
          filters: filters || {},
          is_pinned: is_pinned ?? false,
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('is_system', false)
        .select()
        .single()

      if (error) {
        console.error('Error updating view:', error)
        return NextResponse.json({ error: 'Failed to update view' }, { status: 500 })
      }

      return NextResponse.json(view)
    } else {
      // Create new view
      const { data: view, error } = await admin
        .from('email_saved_views')
        .insert({
          user_id: user.id,
          name,
          icon: icon || 'folder',
          color: color || '#6366f1',
          filters: filters || {},
          is_pinned: is_pinned ?? false,
          is_system: false,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating view:', error)
        return NextResponse.json({ error: 'Failed to create view' }, { status: 500 })
      }

      return NextResponse.json(view)
    }
  } catch (error) {
    console.error('Error in POST /api/email/views:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email/views - Delete a saved view
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const viewId = searchParams.get('id')

    if (!viewId) {
      return NextResponse.json({ error: 'View ID is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Only delete non-system views
    const { error } = await admin
      .from('email_saved_views')
      .delete()
      .eq('id', viewId)
      .eq('user_id', user.id)
      .eq('is_system', false)

    if (error) {
      console.error('Error deleting view:', error)
      return NextResponse.json({ error: 'Failed to delete view' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/email/views:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
