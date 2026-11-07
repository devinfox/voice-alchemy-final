'use client'

import { Tag as TagIcon } from 'lucide-react'
import type { EmailTag } from '@/lib/email-tags-shared'
import { TagChip } from './tag-chip'
import { TagPicker } from './tag-picker'
import { useTags } from './use-tags'

interface TagMultiSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  /** Label on the opener when nothing is chosen */
  placeholder?: string
  /** Offer "Create" for unknown names */
  allowCreate?: boolean
  align?: 'left' | 'right'
  className?: string
}

/**
 * Pick several tags without touching any contact: used for funnel
 * automation fields and for filtering recipient lists.
 */
export function TagMultiSelect({ value, onChange, placeholder = 'Choose tags', allowCreate = true, align = 'left', className = '' }: TagMultiSelectProps) {
  const { tags, createTag } = useTags()
  const byId = new Map(tags.map(t => [t.id, t]))
  const chosen = value.map(id => byId.get(id)).filter((t): t is EmailTag => !!t)

  const toggle = (tag: EmailTag, on: boolean) => {
    onChange(on ? [...new Set([...value, tag.id])] : value.filter(id => id !== tag.id))
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {chosen.map(t => (
        <TagChip key={t.id} name={t.name} color={t.color} size="md" onRemove={() => toggle(t, false)} />
      ))}
      <TagPicker
        selectedIds={value}
        onToggle={toggle}
        onCreate={allowCreate ? name => createTag(name) : undefined}
        align={align}
        trigger={
          <>
            <TagIcon className="w-3.5 h-3.5" />
            {chosen.length === 0 ? placeholder : 'Add'}
          </>
        }
        triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:border-white/40 transition-colors"
      />
    </div>
  )
}
