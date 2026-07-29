import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/views/[viewId] - Get a specific saved view
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const { viewId } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    const { data: view, error } = await admin
      .from('email_saved_views')
      .select('*')
      .eq('id', viewId)
      .eq('user_id', user.id)
      .single()

    if (error || !view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 })
    }

    return NextResponse.json(view)
  } catch (error) {
    console.error('Error in GET /api/email/views/[viewId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/email/views/[viewId] - Update a saved view
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const { viewId } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, icon, color, filters, is_pinned } = body

    const admin = getSupabaseAdmin()

    // Build update object with only provided fields
    const updateData: Record<string, any> = {}
    if (name !== undefined) updateData.name = name
    if (icon !== undefined) updateData.icon = icon
    if (color !== undefined) updateData.color = color
    if (filters !== undefined) updateData.filters = filters
    if (is_pinned !== undefined) updateData.is_pinned = is_pinned

    // Only update non-system views
    const { data: view, error } = await admin
      .from('email_saved_views')
      .update(updateData)
      .eq('id', viewId)
      .eq('user_id', user.id)
      .eq('is_system', false)
      .select()
      .single()

    if (error) {
      console.error('Error updating view:', error)
      return NextResponse.json({ error: 'Failed to update view' }, { status: 500 })
    }

    return NextResponse.json(view)
  } catch (error) {
    console.error('Error in PATCH /api/email/views/[viewId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email/views/[viewId] - Delete a saved view
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const { viewId } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    console.error('Error in DELETE /api/email/views/[viewId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
