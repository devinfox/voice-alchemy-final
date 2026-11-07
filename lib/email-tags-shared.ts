/**
 * Tag types and pure helpers that are safe to import from client components.
 * Server-side reads/writes (and the funnel automation) live in lib/email-tags.ts,
 * which re-exports everything here.
 */

export interface EmailTag {
  id: string
  name: string
  color: TagColor
  description: string | null
  created_at?: string
  /** Number of people carrying the tag (leads + accounts), when requested */
  count?: number
}

/** Palette keys stored in email_tags.color. Classes are Tailwind utilities. */
export const TAG_COLORS = {
  gold: { label: 'Gold', chip: 'bg-[#CEB466]/15 text-[#e0c97d] border-[#CEB466]/40', dot: 'bg-[#CEB466]' },
  violet: { label: 'Violet', chip: 'bg-violet-500/15 text-violet-300 border-violet-500/40', dot: 'bg-violet-400' },
  blue: { label: 'Blue', chip: 'bg-blue-500/15 text-blue-300 border-blue-500/40', dot: 'bg-blue-400' },
  teal: { label: 'Teal', chip: 'bg-teal-500/15 text-teal-300 border-teal-500/40', dot: 'bg-teal-400' },
  green: { label: 'Green', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400' },
  amber: { label: 'Amber', chip: 'bg-amber-500/15 text-amber-200 border-amber-500/40', dot: 'bg-amber-400' },
  rose: { label: 'Rose', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/40', dot: 'bg-rose-400' },
  slate: { label: 'Grey', chip: 'bg-white/[0.06] text-gray-300 border-white/15', dot: 'bg-gray-400' },
} as const

export type TagColor = keyof typeof TAG_COLORS
export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS) as TagColor[]

export function isTagColor(v: unknown): v is TagColor {
  return typeof v === 'string' && v in TAG_COLORS
}

export function tagChipClass(color: string | null | undefined): string {
  return TAG_COLORS[isTagColor(color) ? color : 'gold'].chip
}

/** Pick a colour for a new tag so the list is not all gold. */
export function nextTagColor(existing: { color: string }[]): TagColor {
  const used = new Map<string, number>()
  for (const t of existing) used.set(t.color, (used.get(t.color) || 0) + 1)
  return [...TAG_COLOR_KEYS].sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0))[0]
}

export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 60)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** Tag id arrays from a request body: undefined when absent, cleaned otherwise. */
export function tagIdList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isUuid))]
}

/** True when the error means the tags migration has not been applied yet. */
export function isMissingTagsTable(message: string | null | undefined): boolean {
  return !!message && /email_tags|email_contact_tags|_tag_ids/.test(message) && /does not exist|schema cache/i.test(message)
}
export const TAGS_MIGRATION_HINT = 'Run migration 20261107000001_email_tags.sql first.'
