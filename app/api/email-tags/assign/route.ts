import { NextRequest, NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { addTags, getOrCreateTags, isMissingTagsTable, isUuid, removeTags, TAGS_MIGRATION_HINT } from '@/lib/email-tags'

export const dynamic = 'force-dynamic'

/**
 * POST /api/email-tags/assign
 * {
 *   lead_ids?: string[]      // website leads (email_leads.id)
 *   student_ids?: string[]   // accounts (profiles.id)
 *   add?: string[]           // tag ids, or names (created when new)
 *   remove?: string[]        // tag ids
 * }
 * Adding a tag runs the funnel automation wired to it (start / stop).
 */
export async function POST(request: NextRequest) {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const leadIds: string[] = Array.isArray(body.lead_ids) ? body.lead_ids.filter(isUuid) : []
  const studentIds: string[] = Array.isArray(body.student_ids) ? body.student_ids.filter(isUuid) : []
  const add: string[] = Array.isArray(body.add) ? body.add.map(String) : []
  const remove: string[] = Array.isArray(body.remove) ? body.remove.filter(isUuid) : []

  if (leadIds.length === 0 && studentIds.length === 0) return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 })
  if (add.length === 0 && remove.length === 0) return NextResponse.json({ error: 'Pick at least one tag' }, { status: 400 })

  const admin = getSupabaseAdmin()
  try {
    // Names in `add` become tags on the fly, so the picker can offer "Create 'x'".
    const addIds = add.filter(isUuid)
    const addNames = add.filter(v => !isUuid(v))
    const created = addNames.length > 0 ? await getOrCreateTags(admin, addNames, { createdBy: profile.id }) : []
    const allAddIds = [...new Set([...addIds, ...created.map(t => t.id)])]

    const who = { leadIds, profileIds: studentIds }
    const addResult = allAddIds.length > 0 ? await addTags(admin, who, allAddIds, { via: 'manual', by: profile.id }) : null
    const removed = remove.length > 0 ? await removeTags(admin, who, remove) : 0

    return NextResponse.json({
      ok: true,
      added: addResult?.added || 0,
      removed,
      enrolled: addResult?.enrolled || [],
      stopped: addResult?.stopped || [],
      tags: created,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not update tags'
    return NextResponse.json({ error: message, hint: isMissingTagsTable(message) ? TAGS_MIGRATION_HINT : undefined }, { status: 500 })
  }
}
