'use client'

import { useState } from 'react'
import type { EmailTag } from '@/lib/email-tags-shared'
import { TagChip } from './tag-chip'
import { TagPicker } from './tag-picker'
import { useTags } from './use-tags'

export type ContactTag = Pick<EmailTag, 'id' | 'name' | 'color'>

interface ContactTagEditorProps {
  /** Exactly one of these: a website lead or an account holder */
  leadId?: string
  studentId?: string
  tags: ContactTag[]
  onChange: (tags: ContactTag[]) => void
  /** Hide the "+ Tag" control (read-only chips) */
  readOnly?: boolean
  /** Called with a short note when adding a tag started or stopped a funnel */
  onAutomation?: (note: string) => void
  align?: 'left' | 'right'
}

export interface AssignResponse {
  ok?: boolean
  error?: string
  hint?: string
  added: number
  removed: number
  enrolled: { funnel: string; count: number }[]
  stopped: { funnel: string; count: number }[]
  tags: EmailTag[]
}

/** POST to the assign endpoint and throw a readable error on failure. */
export async function assignTags(body: {
  lead_ids?: string[]
  student_ids?: string[]
  add?: string[]
  remove?: string[]
}): Promise<AssignResponse> {
  const res = await fetch('/api/email-tags/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as AssignResponse
  if (!res.ok) throw new Error(json.hint ? `${json.error}. ${json.hint}` : json.error || 'Could not update tags')
  return json
}

/** One line describing what automation did, or null when nothing happened. */
export function automationNote(r: AssignResponse): string | null {
  const parts: string[] = []
  for (const e of r.enrolled) parts.push(`started “${e.funnel}”${e.count > 1 ? ` for ${e.count}` : ''}`)
  for (const s of r.stopped) parts.push(`stopped “${s.funnel}”${s.count > 1 ? ` for ${s.count}` : ''}`)
  return parts.length ? parts.join(' · ') : null
}

/** Chips for one person's tags plus a picker to add or remove them. */
export function ContactTagEditor({ leadId, studentId, tags, onChange, readOnly = false, onAutomation, align = 'left' }: ContactTagEditorProps) {
  const { createTag, bumpCounts } = useTags()
  const [error, setError] = useState<string | null>(null)
  const target = leadId ? { lead_ids: [leadId] } : studentId ? { student_ids: [studentId] } : {}

  const toggle = async (tag: EmailTag, on: boolean) => {
    setError(null)
    const r = await assignTags({ ...target, ...(on ? { add: [tag.id] } : { remove: [tag.id] }) })
    onChange(on ? [...tags.filter(t => t.id !== tag.id), { id: tag.id, name: tag.name, color: tag.color }].sort((a, b) => a.name.localeCompare(b.name)) : tags.filter(t => t.id !== tag.id))
    bumpCounts({ [tag.id]: on ? r.added : -r.removed })
    const note = automationNote(r)
    if (note && onAutomation) onAutomation(note)
  }

  const remove = async (tag: ContactTag) => {
    try {
      await toggle(tag as EmailTag, false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove tag')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map(t => (
        <TagChip key={t.id} name={t.name} color={t.color} onRemove={readOnly ? undefined : () => void remove(t)} />
      ))}
      {!readOnly && (
        <TagPicker
          selectedIds={tags.map(t => t.id)}
          onToggle={toggle}
          onCreate={name => createTag(name)}
          align={align}
        />
      )}
      {error && <span className="text-[11px] text-red-300">{error}</span>}
    </div>
  )
}
