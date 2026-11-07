import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importIssuesCsv, mapLeadRow, parseLeadCsv, subscriptionFromFileName, suggestLeadMapping, type ImportOptions } from './lead-import'

const options: ImportOptions = { persona: 'singer', source: 'Mailchimp', subscription: 'non-subscribed', duplicates: 'skip' }

test('reads Mailchimp exports with BOM, quoted commas, multiline notes and escaped quotes', () => {
  const sheet = parseLeadCsv('\uFEFFEmail Address,First Name,Last Name,Notes\r\n ALEX@EXAMPLE.COM ,Alex,River,"Sings jazz, soul\nSays ""hello"""\r\n\r\n')
  assert.equal(sheet.rows.length, 1)
  const mapped = mapLeadRow(sheet.headers, sheet.rows[0], suggestLeadMapping(sheet.headers), options)
  assert.deepEqual(mapped.errors, [])
  assert.equal(mapped.lead.email, 'alex@example.com')
  assert.equal(mapped.lead.metadata.notes, 'Sings jazz, soul\nSays "hello"')
  assert.equal(mapped.lead.is_unsubscribed, true)
})

test('supports tab-delimited files and maps duplicate column names independently', () => {
  const sheet = parseLeadCsv('Email Address\tEmail Address\tName\na@example.com\tbackup@example.com\tAlex River')
  const mapping = suggestLeadMapping(sheet.headers)
  assert.equal(mapping[0], 'email')
  assert.equal(mapping[1], '')
  const { lead } = mapLeadRow(sheet.headers, sheet.rows[0], mapping, options)
  assert.equal(lead.first_name, 'Alex')
  assert.equal(lead.last_name, 'River')
  assert.deepEqual(lead.metadata.import_extra_fields, { 'Email Address (2)': 'backup@example.com' })
})

test('does not confuse Mailchimp subscribed, unsubscribed, non-subscribed and cleaned filenames', () => {
  for (const [name, status] of [['subscribed_export.csv', 'subscribed'], ['unsubscribed_export.csv', 'unsubscribed'], ['non-subscribed_export.csv', 'non-subscribed'], ['cleaned_members.csv', 'cleaned'], ['contacts.csv', 'non-subscribed']] as const) {
    assert.equal(subscriptionFromFileName(name), status)
  }
})

test('a mapped subscription status overrides the file default and unknown values fail closed', () => {
  const sheet = parseLeadCsv('Email Address,Email Marketing,First Name\na@example.com,unsubscribed,Alex\nb@example.com,cleaned,Bo\nc@example.com,unknown,Chris\nd@example.com,subscribed,Dee')
  const mapping = suggestLeadMapping(sheet.headers)
  const results = sheet.rows.map(row => mapLeadRow(sheet.headers, row, mapping, { ...options, subscription: 'subscribed' }))
  assert.equal(results[0].lead.is_unsubscribed, true)
  assert.equal(results[1].lead.is_unsubscribed, true)
  assert.ok(results[2].errors.includes('Unrecognized email subscription status'))
  assert.equal(results[2].lead.is_unsubscribed, true)
  assert.equal(results[3].lead.is_unsubscribed, false)
})

test('rejects malformed CSV rather than silently truncating or shifting contact data', () => {
  assert.throws(() => parseLeadCsv('email,name\na@example.com,"unterminated'), /unfinished quoted/)
  assert.throws(() => parseLeadCsv('email,name\na@example.com,Alex,unexpected'), /Row 2/)
  assert.throws(() => parseLeadCsv('email,name\n'), /at least one lead/)
})

test('validates email, names and singer/coach mapping, preserving international phone strings', () => {
  const sheet = parseLeadCsv('email,role,phone\nbad,invalid,+44 20 1234 5678\ncoach@example.com,teacher,+44 20 1234 5678')
  const mapping = suggestLeadMapping(sheet.headers)
  const invalid = mapLeadRow(sheet.headers, sheet.rows[0], mapping, options)
  assert.equal(invalid.errors.length, 2)
  const coach = mapLeadRow(sheet.headers, sheet.rows[1], mapping, options)
  assert.equal(coach.lead.persona, 'coach')
  assert.equal(coach.lead.metadata.phone, '+44 20 1234 5678')
})

test('escapes spreadsheet formulas in downloadable error reports', () => {
  assert.match(importIssuesCsv([{ row: 2, email: '=CMD()', reason: 'Invalid email' }]), /'=CMD\(\)/)
})
