import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { importLeadBatch, type LeadImportBatch } from './lead-import-server'
import { suggestLeadMapping } from './lead-import'

type RecordRow = { id: string; email: string; is_unsubscribed: boolean; first_name?: string | null; metadata?: Record<string, unknown>; [key: string]: unknown }

// An in-memory implementation of only the queries used by the importer.
// Any enrollment, tag, sending, or other table access fails the test.
function database(initial: RecordRow[] = [], suppressed: string[] = []) {
  const rows = structuredClone(initial)
  const mutations: string[] = []
  const client = {
    from(table: string) {
      assert.ok(['email_leads', 'email_unsubscribes'].includes(table), `Unexpected table: ${table}`)
      let filter: (row: RecordRow) => boolean = () => true
      let action: 'read' | 'insert' | 'update' = 'read'
      let payload: Record<string, unknown> | Record<string, unknown>[] = {}
      const query = {
        select() { return query },
        in(key: string, values: unknown[]) { filter = row => values.includes(row[key]); return query },
        eq(key: string, value: unknown) { filter = row => row[key] === value; return query },
        upsert(records: Record<string, unknown>[], opts: { ignoreDuplicates: boolean }) { assert.equal(opts.ignoreDuplicates, true); action = 'insert'; payload = records; return query },
        update(patch: Record<string, unknown>) { action = 'update'; payload = patch; return query },
        then(resolve: (value: { data: RecordRow[]; error: null }) => unknown) {
          let result: RecordRow[] = []
          if (action === 'read') result = (table === 'email_leads' ? rows : suppressed.map(email => ({ id: email, email, is_unsubscribed: true }))).filter(filter)
          if (action === 'insert') {
            mutations.push('insert')
            for (const record of payload as Record<string, unknown>[]) {
              if (rows.some(r => r.email === record.email)) continue
              const row = { ...record, id: `lead-${rows.length}` } as RecordRow
              rows.push(row); result.push(row)
            }
          }
          if (action === 'update') { mutations.push('update'); for (const row of rows.filter(filter)) Object.assign(row, payload) }
          return Promise.resolve(resolve({ data: result, error: null }))
        },
      }
      return query
    },
  }
  return { client: client as unknown as SupabaseClient, rows, mutations }
}

function batch(rows: string[][], duplicates: 'skip' | 'update' = 'skip'): LeadImportBatch {
  const headers = ['Email Address', 'First Name', 'Email Marketing']
  return { headers, rows, mapping: suggestLeadMapping(headers), options: { persona: 'singer', source: 'Mailchimp', subscription: 'non-subscribed', duplicates }, fileName: 'contacts.csv', firstRow: 2 }
}

test('imports valid leads, counts file duplicates, reports invalid rows, and never starts automations', async () => {
  const db = database()
  const result = await importLeadBatch(db.client, batch([
    ['A@EXAMPLE.COM', 'Alex', 'subscribed'], ['a@example.com', 'Other', 'subscribed'], ['invalid', 'Bad', 'subscribed'],
  ]), 'admin')
  assert.deepEqual({ created: result.created, skipped: result.skipped, failed: result.failed }, { created: 1, skipped: 1, failed: 1 })
  assert.equal(result.issues[0].row, 4)
  assert.equal(db.rows[0].email, 'a@example.com')
  assert.equal(db.rows[0].last_type, 'csv_import')
})

test('skip duplicates preserves details but still honors an imported opt-out', async () => {
  const db = database([{ id: 'old', email: 'a@example.com', first_name: 'Original', is_unsubscribed: false }])
  const result = await importLeadBatch(db.client, batch([['a@example.com', 'New', 'unsubscribed']]), 'admin')
  assert.equal(result.skipped, 1)
  assert.equal(db.rows[0].first_name, 'Original')
  assert.equal(db.rows[0].is_unsubscribed, true)
})

test('update duplicates preserves existing opt-outs, blank names, and unrelated metadata', async () => {
  const db = database([{ id: 'old', email: 'a@example.com', first_name: 'Original', is_unsubscribed: true, metadata: { goal: 'Sing with confidence' } }])
  const result = await importLeadBatch(db.client, batch([['a@example.com', '', 'subscribed']], 'update'), 'admin')
  assert.equal(result.updated, 1)
  assert.equal(db.rows[0].first_name, 'Original')
  assert.equal(db.rows[0].is_unsubscribed, true)
  assert.equal(db.rows[0].metadata?.goal, 'Sing with confidence')
})

test('global suppression and conflicting duplicate statuses take precedence over subscribed', async () => {
  const db = database([], ['a@example.com'])
  await importLeadBatch(db.client, batch([
    ['a@example.com', 'A', 'subscribed'], ['b@example.com', 'B', 'subscribed'], ['b@example.com', 'B', 'cleaned'],
  ]), 'admin')
  assert.equal(db.rows.length, 2)
  assert.ok(db.rows.every(r => r.is_unsubscribed))
})

test('replaying a batch is safe and does not create duplicate leads', async () => {
  const db = database()
  const input = batch([['a@example.com', 'Alex', 'subscribed']])
  await importLeadBatch(db.client, input, 'admin')
  const replay = await importLeadBatch(db.client, input, 'admin')
  assert.equal(db.rows.length, 1)
  assert.equal(replay.created, 0)
  assert.equal(replay.skipped, 1)
})
