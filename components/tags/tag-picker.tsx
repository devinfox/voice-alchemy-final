'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Loader2, Plus, Search, Tag as TagIcon } from 'lucide-react'
import { TAG_COLORS, type EmailTag } from '@/lib/email-tags-shared'
import { useTags } from './use-tags'

interface TagPickerProps {
  /** Tag ids currently on (checked) */
  selectedIds: string[]
  /** Called when a tag is checked or unchecked */
  onToggle: (tag: EmailTag, selected: boolean) => void | Promise<void>
  /** When set, typing a new name offers "Create" and calls this */
  onCreate?: (name: string) => Promise<EmailTag | null>
  /** The element that opens the picker (defaults to a small "+ Tag" button) */
  trigger?: ReactNode
  triggerClassName?: string
  align?: 'left' | 'right'
  /** Shown above the list, e.g. "Tag 3 people" */
  heading?: string
  disabled?: boolean
}

/**
 * Popover for choosing tags. Shared by the per-contact editor, the bulk
 * action bar, the funnel automation fields and the recipient filters.
 */
export function TagPicker({
  selectedIds,
  onToggle,
  onCreate,
  trigger,
  triggerClassName = '',
  align = 'left',
  heading,
  disabled = false,
}: TagPickerProps) {
  const { tags, loading, error, hint } = useTags()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (q ? tags.filter(t => t.name.toLowerCase().includes(q)) : tags), [tags, q])
  const exact = tags.some(t => t.name.toLowerCase() === q)
  const canCreate = !!onCreate && q.length > 0 && !exact
  const selected = new Set(selectedIds)

  const toggle = async (tag: EmailTag) => {
    setBusyId(tag.id)
    setLocalError(null)
    try {
      await onToggle(tag, !selected.has(tag.id))
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not update tag')
    } finally {
      setBusyId(null)
    }
  }

  const create = async () => {
    if (!onCreate || !canCreate) return
    setCreating(true)
    setLocalError(null)
    try {
      const tag = await onCreate(query.trim())
      if (tag) {
        setQuery('')
        if (!selected.has(tag.id)) await onToggle(tag, true)
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not create tag')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          triggerClassName ||
          'inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[11px] text-gray-400 hover:text-white hover:border-white/40 transition-colors disabled:opacity-40'
        }
      >
        {trigger ?? (
          <>
            <Plus className="w-3 h-3" />
            Tag
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1.5 w-64 rounded-xl border border-white/10 bg-[#1a1433] shadow-2xl shadow-black/50 ${align === 'right' ? 'right-0' : 'left-0'}`}
          role="listbox"
        >
          {heading && <p className="px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{heading}</p>}
          <div className="relative p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (canCreate) void create()
                  else if (filtered.length === 1) void toggle(filtered[0])
                }
              }}
              placeholder={onCreate ? 'Find or create a tag…' : 'Find a tag…'}
              className="w-full rounded-lg bg-white/[0.06] border border-white/10 pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#CEB466]/50"
            />
          </div>

          <div className="max-h-56 overflow-y-auto px-1 pb-1">
            {loading ? (
              <div className="flex items-center justify-center py-5 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : error ? (
              <p className="px-3 py-3 text-xs text-amber-300/90">
                {error}
                {hint && <span className="block text-gray-500 mt-1">{hint}</span>}
              </p>
            ) : (
              <>
                {filtered.map(tag => {
                  const on = selected.has(tag.id)
                  const busy = busyId === tag.id
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={busy}
                      onClick={() => void toggle(tag)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-sm text-gray-200 hover:bg-white/[0.06] disabled:opacity-60"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TAG_COLORS[tag.color]?.dot || TAG_COLORS.gold.dot}`} />
                      <span className="flex-1 truncate">{tag.name}</span>
                      {typeof tag.count === 'number' && <span className="text-[11px] text-gray-500">{tag.count}</span>}
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                      ) : (
                        <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-[#CEB466] border-[#CEB466]' : 'border-gray-600'}`}>
                          {on && <Check className="w-3 h-3 text-[#171229]" />}
                        </span>
                      )}
                    </button>
                  )
                })}
                {filtered.length === 0 && !canCreate && (
                  <p className="px-3 py-3 text-xs text-gray-500 flex items-center gap-2">
                    <TagIcon className="w-3.5 h-3.5" />
                    {tags.length === 0 ? 'No tags yet.' : 'No tag matches.'}
                  </p>
                )}
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => void create()}
                    disabled={creating}
                    className="w-full flex items-center gap-2 px-2.5 py-2 mt-0.5 rounded-lg text-left text-sm text-[#e0c97d] hover:bg-[#CEB466]/10 disabled:opacity-60"
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Create “{query.trim()}”
                  </button>
                )}
              </>
            )}
          </div>
          {localError && <p className="px-3 pb-2 text-xs text-red-300">{localError}</p>}
        </div>
      )}
    </div>
  )
}
