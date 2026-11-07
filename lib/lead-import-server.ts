import type { SupabaseClient } from '@supabase/supabase-js'
import { mapLeadRow, type ImportOptions, type ImportResult, type Mapping, type MappedLead } from './lead-import'

export interface LeadImportBatch {
  headers: string[]; rows: string[][]; mapping: Mapping; options: ImportOptions
  fileName: string; firstRow: number
}

/** Import into the existing lead directory. Deliberately never enrolls or applies automation tags. */
export async function importLeadBatch(admin: SupabaseClient, batch: LeadImportBatch, actorId: string): Promise<ImportResult> {
  const result: ImportResult = { processed: batch.rows.length, created: 0, updated: 0, skipped: 0, failed: 0, issues: [] }
  const valid: { lead: MappedLead; row: number }[] = []
  for (const [index, row] of batch.rows.entries()) {
    const mapped = mapLeadRow(batch.headers, row, batch.mapping, batch.options)
    const rowNumber = batch.firstRow + index
    if (mapped.errors.length) {
      result.failed++
      result.issues.push({ row: rowNumber, email: mapped.lead.email, reason: mapped.errors.join('; ') })
    } else valid.push({ lead: mapped.lead, row: rowNumber })
  }
  if (!valid.length) return result

  const addresses = [...new Set(valid.map(v => v.lead.email))]
  const [{ data: existing, error }, { data: suppressions, error: suppressionError }] = await Promise.all([
    admin.from('email_leads').select('id,email,first_name,last_name,persona,source,metadata,is_unsubscribed').in('email', addresses),
    admin.from('email_unsubscribes').select('email').in('email', addresses),
  ])
  if (error || suppressionError) throw new Error('Could not check existing leads. No rows in this batch were imported.')
  const byEmail = new Map((existing || []).map(r => [r.email as string, r]))
  const blocked = new Set((suppressions || []).map(r => r.email as string))
  // Most restrictive value wins when a file repeats an address with conflicting consent.
  for (const { lead } of valid) if (lead.is_unsubscribed) blocked.add(lead.email)
  const unique = new Map<string, typeof valid[number]>()
  for (const item of valid) {
    if (unique.has(item.lead.email)) result.skipped++
    else unique.set(item.lead.email, item)
  }
  const now = new Date().toISOString()
  const newLeads = [...unique.values()].filter(v => !byEmail.has(v.lead.email))
  if (newLeads.length) {
    const records = newLeads.map(({ lead }) => ({
      ...lead,
      is_unsubscribed: lead.is_unsubscribed || blocked.has(lead.email),
      last_type: 'csv_import',
      metadata: { ...lead.metadata, import_file: batch.fileName, imported_by: actorId, imported_at: now },
      updated_at: now,
    }))
    const { data: inserted, error: insertError } = await admin.from('email_leads')
      .upsert(records, { onConflict: 'email', ignoreDuplicates: true }).select('id,email')
    if (insertError) throw new Error('Could not save this batch of leads. Please try again.')
    result.created += inserted?.length || 0
    const insertedEmails = new Set((inserted || []).map(r => r.email as string))
    const raced = newLeads.filter(v => !insertedEmails.has(v.lead.email))
    // A concurrent import may have inserted the same email. Re-read it instead of
    // overwriting the record, including any opt-out that arrived during the race.
    if (raced.length) {
      const { data, error: raceError } = await admin.from('email_leads')
        .select('id,email,first_name,last_name,persona,source,metadata,is_unsubscribed').in('email', raced.map(v => v.lead.email))
      if (raceError) throw new Error('Some leads were saved, but duplicate checks could not finish. Retry with Skip duplicates.')
      for (const r of data || []) byEmail.set(r.email as string, r)
    }
  }

  const updates = [...unique.values()].filter(v => byEmail.has(v.lead.email))
  for (let offset = 0; offset < updates.length; offset += 10) {
    await Promise.all(updates.slice(offset, offset + 10).map(async ({ lead, row }) => {
      const prior = byEmail.get(lead.email)!
      const restrict = blocked.has(lead.email) && !prior.is_unsubscribed
      if (batch.options.duplicates === 'skip' && !restrict) { result.skipped++; return }
      const patch: Record<string, unknown> = { updated_at: now }
      // Never write false to an existing lead: a later unsubscribe must survive.
      if (restrict) patch.is_unsubscribed = true
      if (batch.options.duplicates === 'update') {
        if (lead.first_name) patch.first_name = lead.first_name
        if (lead.last_name) patch.last_name = lead.last_name
        if (Object.values(batch.mapping).includes('persona')) patch.persona = lead.persona
        patch.source = lead.source
        patch.metadata = { ...(prior.metadata || {}), ...lead.metadata, import_file: batch.fileName, imported_by: actorId, imported_at: now }
      }
      const { error: updateError } = await admin.from('email_leads').update(patch).eq('id', prior.id)
      if (updateError) {
        result.failed++
        result.issues.push({ row, email: lead.email, reason: 'Could not update this lead. Please retry this row.' })
      } else if (batch.options.duplicates === 'update') result.updated++
      else result.skipped++
    }))
  }
  return result
}
