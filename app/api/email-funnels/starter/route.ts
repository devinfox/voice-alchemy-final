import { NextResponse } from 'next/server'
import { requireEmailAccess } from '@/lib/email-access-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { STARTER_FUNNELS, MANUAL_SEND_TEMPLATES } from '@/lib/email-templates/starter-funnels'
import { CAMPAIGN_TEMPLATES, getStarterTemplate, starterTemplateRow } from '@/lib/email-templates/starter-templates'
import type { SupabaseClient } from '@supabase/supabase-js'
import { audienceKeyForTrigger } from '@/lib/email-audiences'

/**
 * The VAA campaign installer.
 *
 * GET  -> which campaign funnels/templates are already in the database
 * POST -> create every missing campaign template and funnel. Idempotent:
 *         templates match on starter_key (then name), funnels on trigger_key.
 *         Existing rows are never overwritten, so edits made in the builder
 *         survive a re-run.
 */

async function ensureTemplate(admin: SupabaseClient, key: string, createdBy: string): Promise<{ id: string; created: boolean }> {
  const starter = getStarterTemplate(key)
  if (!starter) throw new Error(`Unknown starter template: ${key}`)

  const { data: byKey } = await admin
    .from('email_templates')
    .select('id')
    .eq('is_deleted', false)
    .eq('starter_key', key)
    .limit(1)
    .maybeSingle()
  if (byKey) return { id: byKey.id, created: false }

  const { data: byName } = await admin
    .from('email_templates')
    .select('id')
    .eq('is_deleted', false)
    .eq('name', starter.name)
    .limit(1)
    .maybeSingle()
  if (byName) {
    await admin.from('email_templates').update({ starter_key: key }).eq('id', byName.id)
    return { id: byName.id, created: false }
  }

  const { data, error } = await admin
    .from('email_templates')
    .insert({ ...starterTemplateRow(starter), created_by: createdBy })
    .select('id')
    .single()
  if (error) throw new Error(`${starter.name}: ${error.message}`)
  return { id: data.id, created: true }
}

export async function GET() {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const admin = getSupabaseAdmin()
  const [{ data: funnels, error: fErr }, { data: templates, error: tErr }] = await Promise.all([
    admin.from('email_funnels').select('id, name, status, trigger_key').eq('is_deleted', false).not('trigger_key', 'is', null),
    admin.from('email_templates').select('id, name, starter_key').eq('is_deleted', false).not('starter_key', 'is', null),
  ])
  if (fErr || tErr) {
    const message = (fErr || tErr)!.message
    const hint = /trigger_key|starter_key/.test(message) ? 'Run migration 20260907000001_email_leads_and_funnel_triggers.sql first.' : undefined
    return NextResponse.json({ error: message, hint }, { status: 500 })
  }

  const funnelByTrigger = new Map((funnels || []).map(f => [f.trigger_key, f]))
  const templateByKey = new Map((templates || []).map(t => [t.starter_key, t]))

  return NextResponse.json({
    data: {
      funnels: STARTER_FUNNELS.map(f => ({
        trigger_key: f.trigger_key,
        name: f.name,
        phases: f.phases.length,
        installed: funnelByTrigger.get(f.trigger_key) || null,
      })),
      templates: CAMPAIGN_TEMPLATES.map(t => ({
        key: t.key,
        name: t.name,
        manual: MANUAL_SEND_TEMPLATES.includes(t.key),
        installed: templateByKey.get(t.key) || null,
      })),
    },
  })
}

export async function POST() {
  const profile = await requireEmailAccess()
  if (!profile) return NextResponse.json({ error: 'Email tools access required' }, { status: 403 })

  const admin = getSupabaseAdmin()
  const summary = { templates_created: 0, templates_existing: 0, funnels_created: 0, funnels_existing: 0, errors: [] as string[] }

  try {
    // 1. Templates (funnel phases plus the hand-sent ones)
    const templateIds = new Map<string, string>()
    for (const starter of CAMPAIGN_TEMPLATES) {
      const result = await ensureTemplate(admin, starter.key, profile.id)
      templateIds.set(starter.key, result.id)
      if (result.created) summary.templates_created++
      else summary.templates_existing++
    }

    // 2. Funnels, one per trigger, filed under the matching audience ("user type")
    const { data: audienceRows } = await admin.from('email_audiences').select('id, key').eq('is_deleted', false)
    const audienceIdByKey = new Map((audienceRows || []).map(a => [a.key, a.id]))

    for (const def of STARTER_FUNNELS) {
      const { data: existing } = await admin
        .from('email_funnels')
        .select('id')
        .eq('is_deleted', false)
        .eq('trigger_key', def.trigger_key)
        .limit(1)
        .maybeSingle()
      if (existing) {
        summary.funnels_existing++
        continue
      }

      const { data: funnel, error: funnelError } = await admin
        .from('email_funnels')
        .insert({
          name: def.name,
          description: def.description,
          status: 'active',
          tags: def.tags,
          trigger_key: def.trigger_key,
          audience_id: audienceIdByKey.get(audienceKeyForTrigger(def.trigger_key) || '') || null,
          auto_enroll_enabled: false,
          created_by: profile.id,
        })
        .select('id')
        .single()
      if (funnelError || !funnel) {
        summary.errors.push(`${def.name}: ${funnelError?.message || 'insert failed'}`)
        continue
      }

      const phases = def.phases.map((p, i) => ({
        funnel_id: funnel.id,
        template_id: templateIds.get(p.template) || null,
        phase_order: i + 1,
        name: p.name,
        delay_days: p.delay_days,
        delay_hours: p.delay_hours,
      }))
      const { error: phaseError } = await admin.from('email_funnel_phases').insert(phases)
      if (phaseError) {
        await admin.from('email_funnels').delete().eq('id', funnel.id)
        summary.errors.push(`${def.name}: ${phaseError.message}`)
        continue
      }
      summary.funnels_created++
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[email-funnels/starter] install failed:', err)
    const hint = /trigger_key|starter_key|preheader/.test(message) ? 'Run migration 20260907000001_email_leads_and_funnel_triggers.sql first.' : undefined
    return NextResponse.json({ error: message, hint, ...summary }, { status: 500 })
  }

  return NextResponse.json({ success: summary.errors.length === 0, ...summary })
}
