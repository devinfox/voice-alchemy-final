import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/email/labels - Get user's labels (optionally with thread labels)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const searchParams = request.nextUrl.searchParams
    const threadId = searchParams.get('thread_id')

    // Get all user labels
    const { data: labels, error } = await admin
      .from('email_labels')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching labels:', error)
      return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 })
    }

    // If thread_id provided, also get which labels are applied to this thread
    if (threadId) {
      const { data: threadLabels } = await admin
        .from('email_thread_labels')
        .select('label_id')
        .eq('thread_id', threadId)

      return NextResponse.json({
        labels: labels || [],
        threadLabels: threadLabels?.map(tl => tl.label_id) || [],
      })
    }

    return NextResponse.json(labels || [])
  } catch (error) {
    console.error('Error in GET /api/email/labels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/email/labels - Create or update a label
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, name, color, icon } = body

    if (!name) {
      return NextResponse.json({ error: 'Label name is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    if (id) {
      // Update existing label
      const { data: label, error } = await admin
        .from('email_labels')
        .update({ name, color, icon })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating label:', error)
        return NextResponse.json({ error: 'Failed to update label' }, { status: 500 })
      }

      return NextResponse.json(label)
    } else {
      // Create new label
      const { data: label, error } = await admin
        .from('email_labels')
        .insert({
          user_id: user.id,
          name,
          color: color || '#6366f1',
          icon: icon || 'tag',
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'A label with this name already exists' }, { status: 400 })
        }
        console.error('Error creating label:', error)
        return NextResponse.json({ error: 'Failed to create label' }, { status: 500 })
      }

      return NextResponse.json(label)
    }
  } catch (error) {
    console.error('Error in POST /api/email/labels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/email/labels - Delete a label
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const labelId = searchParams.get('id')

    if (!labelId) {
      return NextResponse.json({ error: 'Label ID is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    const { error } = await admin
      .from('email_labels')
      .delete()
      .eq('id', labelId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting label:', error)
      return NextResponse.json({ error: 'Failed to delete label' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/email/labels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/email/labels - Apply/remove label from thread
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { thread_id, label_id, action } = body

    if (!thread_id || !label_id || !['add', 'remove'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Verify thread ownership
    const { data: thread } = await admin
      .from('email_threads')
      .select('id, email_account_id, email_accounts!inner(user_id)')
      .eq('id', thread_id)
      .single()

    if (!thread || (thread as any).email_accounts?.user_id !== user.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Verify label ownership
    const { data: label } = await admin
      .from('email_labels')
      .select('id')
      .eq('id', label_id)
      .eq('user_id', user.id)
      .single()

    if (!label) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    }

    if (action === 'add') {
      const { error } = await admin
        .from('email_thread_labels')
        .upsert({
          thread_id,
          label_id,
        }, {
          onConflict: 'thread_id,label_id'
        })

      if (error) {
        console.error('Error adding label:', error)
        return NextResponse.json({ error: 'Failed to add label' }, { status: 500 })
      }
    } else {
      const { error } = await admin
        .from('email_thread_labels')
        .delete()
        .eq('thread_id', thread_id)
        .eq('label_id', label_id)

      if (error) {
        console.error('Error removing label:', error)
        return NextResponse.json({ error: 'Failed to remove label' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in PATCH /api/email/labels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
