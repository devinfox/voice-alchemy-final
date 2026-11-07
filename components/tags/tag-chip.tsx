'use client'

import { X } from 'lucide-react'
import { tagChipClass } from '@/lib/email-tags-shared'

interface TagChipProps {
  name: string
  color?: string | null
  onRemove?: () => void
  size?: 'sm' | 'md'
  title?: string
  className?: string
}

/** A single contact tag, optionally with a remove cross. */
export function TagChip({ name, color, onRemove, size = 'sm', title, className = '' }: TagChipProps) {
  const sizing = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border font-medium leading-tight whitespace-nowrap max-w-[180px] ${sizing} ${tagChipClass(color)} ${className}`}
    >
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove tag ${name}`}
          className="-mr-0.5 rounded-full p-0.5 opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}
