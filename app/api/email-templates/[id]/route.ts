import { requireEmailAccess } from '@/lib/email-access-server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Columns a client is allowed to update via PATCH. Everything else on
// email_templates (created_by, organization_id, is_deleted, timestamps, id)
// is server-managed and must never come from the request body.
const UPDATABLE_TEMPLATE_COLUMNS = [
  'name',
  'subject',
  'body',
  'body_html',
  'description',
  'category',
  'is_active',
] as const

// DELETE /api/email-templates/[id] - Soft delete a template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Only email-tools users (admins / Julia) may manage templates
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json(
        { error: 'Email tools access required' },
        { status: 403 }
      )
    }

    // Use service role client to bypass RLS for this operation
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Soft delete the template using service role
    const { data, error } = await serviceClient
      .from('email_templates')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: data[0] })
  } catch (error) {
    console.error('Error in DELETE /api/email-templates/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/email-templates/[id] - Update a template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Only email-tools users (admins / Julia) may manage templates
    const profile = await requireEmailAccess()
    if (!profile) {
      return NextResponse.json(
        { error: 'Email tools access required' },
        { status: 403 }
      )
    }

    // Whitelist updatable columns — never spread the raw body into the update
    const updateData: Record<string, unknown> = {}
    for (const column of UPDATABLE_TEMPLATE_COLUMNS) {
      if (body[column] !== undefined) {
        updateData[column] = body[column]
      }
    }
    updateData.updated_at = new Date().toISOString()

    // Update the template
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: data[0] })
  } catch (error) {
    console.error('Error in PATCH /api/email-templates/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
