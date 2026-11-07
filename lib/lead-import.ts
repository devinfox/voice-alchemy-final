import Papa from 'papaparse'

// Adapted from the CRM importer's CSV parsing and alias-based column mapping.
// Shared by the browser preview and server so validation stays consistent.
export const IMPORT_FIELDS = [
  { key: 'email', label: 'Email address', aliases: ['email', 'emailaddress', 'primaryemail', 'eaddress'] },
  { key: 'first_name', label: 'First name', aliases: ['firstname', 'first', 'fname', 'givenname'] },
  { key: 'last_name', label: 'Last name', aliases: ['lastname', 'last', 'lname', 'surname', 'familyname'] },
  { key: 'full_name', label: 'Full name', aliases: ['name', 'fullname', 'contactname'] },
  { key: 'persona', label: 'Singer or coach', aliases: ['persona', 'role', 'contacttype', 'singerorcoach'] },
  { key: 'source', label: 'Lead source', aliases: ['source', 'leadsource', 'signupsource'] },
  { key: 'phone', label: 'Phone number', aliases: ['phone', 'phonenumber', 'mobile', 'telephone', 'cellphone'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
  { key: 'tags', label: 'Imported tags', aliases: ['tags', 'tag', 'labels'] },
  { key: 'subscription', label: 'Email subscription status', aliases: ['emailmarketing', 'emailmarketingstatus', 'subscriptionstatus', 'subscribestatus', 'emailstatus', 'marketingstatus', 'status'] },
] as const

export type ImportField = typeof IMPORT_FIELDS[number]['key']
export type Mapping = Record<string, ImportField | ''> // Column index, including duplicate header names.
export type Subscription = 'subscribed' | 'non-subscribed' | 'unsubscribed' | 'cleaned'
export interface ImportOptions {
  persona: 'singer' | 'coach'
  source: string
  subscription: Subscription
  duplicates: 'skip' | 'update'
}
export interface ImportSheet { headers: string[]; rows: string[][] }
export interface ImportIssue { row: number; email: string; reason: string }
export interface ImportResult {
  processed: number; created: number; updated: number; skipped: number; failed: number
  issues: ImportIssue[]
}
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 25000
export const IMPORT_BATCH_SIZE = 100
export const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function parseLeadCsv(text: string): ImportSheet {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' })
  const fatal = result.errors.find(e => e.type === 'Quotes')
  if (fatal) throw new Error(`The CSV has an unfinished quoted field near row ${(fatal.row ?? 0) + 1}. Please export it again.`)
  const all = result.data.map(row => row.map(cell => cell.trim()))
  if (all.length < 2) throw new Error('Add a header row and at least one lead to your CSV.')
  const headers = all[0].map((h, i) => h || `Column ${i + 1}`)
  if (headers.length > 100) throw new Error('This CSV has more than 100 columns. Export only the contact fields you need.')
  if (headers.some(h => h.length > 500)) throw new Error('A column heading exceeds 500 characters. Check that the first row contains field names.')
  if (all.length - 1 > MAX_IMPORT_ROWS) throw new Error('Import up to 25,000 leads at a time. Split this file into smaller CSVs.')
  const rows = all.slice(1)
  const wide = rows.findIndex(r => r.length > headers.length)
  if (wide >= 0) throw new Error(`Row ${wide + 2} has more values than the header. Check its commas and quotation marks.`)
  return { headers, rows: rows.map(r => headers.map((_, i) => r[i] || '')) }
}

export function suggestLeadMapping(headers: string[]): Mapping {
  const mapping: Mapping = {}
  const used = new Set<string>()
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    const field = IMPORT_FIELDS.find(f => !used.has(f.key) &&
      [normalizeHeader(f.key), normalizeHeader(f.label), ...f.aliases].includes(normalized))
    mapping[index] = field?.key || ''
    if (field) used.add(field.key)
  })
  return mapping
}

export function subscriptionFromFileName(name: string): Subscription {
  const n = name.toLowerCase().replace(/[\s-]/g, '_')
  if (n.includes('unsubscribed')) return 'unsubscribed'
  if (n.includes('non_subscribed') || n.includes('nonsubscribed')) return 'non-subscribed'
  if (n.includes('cleaned')) return 'cleaned'
  if (n.includes('subscribed')) return 'subscribed'
  return 'non-subscribed'
}

export function parseSubscription(value: string): Subscription | null {
  const n = normalizeHeader(value)
  if (['subscribed', 'optedin', 'yes', 'true', '1'].includes(n)) return 'subscribed'
  if (['unsubscribed', 'optedout'].includes(n)) return 'unsubscribed'
  if (['cleaned', 'bounced', 'hardbounce'].includes(n)) return 'cleaned'
  if (['nonsubscribed', 'pending', 'archived', 'no', 'false', '0'].includes(n)) return 'non-subscribed'
  return null
}

export interface MappedLead {
  email: string
  first_name: string | null
  last_name: string | null
  persona: 'singer' | 'coach'
  source: string
  is_unsubscribed: boolean
  metadata: Record<string, unknown>
}

export function mapLeadRow(headers: string[], row: string[], mapping: Mapping, options: ImportOptions): { lead: MappedLead; errors: string[] } {
  const values: Partial<Record<ImportField, string>> = {}
  for (const [column, field] of Object.entries(mapping)) if (field) values[field] = row[Number(column)]?.trim() || ''
  const errors: string[] = []
  const email = (values.email || '').toLowerCase()
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('A valid email address is required')
  const names = (values.full_name || '').split(/\s+/).filter(Boolean)
  const first = values.first_name || names[0] || null
  const last = values.last_name || names.slice(1).join(' ') || null
  if ((first?.length || 0) > 100 || (last?.length || 0) > 100) errors.push('Names must be 100 characters or fewer')
  const rawPersona = (values.persona || '').toLowerCase()
  let persona = options.persona
  if (rawPersona) {
    if (['singer', 'student', 'vocalist'].includes(rawPersona)) persona = 'singer'
    else if (['coach', 'teacher', 'instructor', 'vocal coach'].includes(rawPersona)) persona = 'coach'
    else errors.push('Contact type must be singer or coach')
  }
  const subscription = values.subscription ? parseSubscription(values.subscription) : options.subscription
  if (!subscription) errors.push('Unrecognized email subscription status')
  const source = values.source || options.source || 'CSV import'
  if (source.length > 80) errors.push('Lead source must be 80 characters or fewer')
  if (row.some(cell => cell.length > 10000)) errors.push('A cell exceeds the 10,000 character limit')
  const extras = Object.fromEntries(headers.flatMap((header, i) => !mapping[i] && row[i] ? [[`${header} (${i + 1})`, row[i]]] : []))
  return {
    lead: {
      email, first_name: first, last_name: last, persona, source,
      is_unsubscribed: subscription !== 'subscribed',
      metadata: {
        import_subscription_status: subscription || 'non-subscribed',
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
        ...(values.tags ? { imported_tags: values.tags } : {}),
        ...(Object.keys(extras).length ? { import_extra_fields: extras } : {}),
      },
    }, errors,
  }
}

export function importIssuesCsv(issues: ImportIssue[]): string {
  return Papa.unparse({ fields: ['CSV row', 'Email address', 'Issue'], data: issues.map(i => [i.row, i.email, i.reason]) }, { escapeFormulae: true })
}
