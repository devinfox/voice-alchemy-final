'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface SegmentedOption<T> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
}

interface SegmentedProps<T> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  disabled?: boolean
  /** Square items for single characters (octave numbers, etc.). */
  compact?: boolean
  'aria-label'?: string
  className?: string
}

/** Pick one of a few options. The selected item is always solid gold. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
  compact,
  className,
  ...aria
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cn('inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4',
              compact ? 'w-8' : 'px-3',
              selected ? 'bg-gold-400 text-ink-900' : 'text-gray-400 hover:bg-white/[0.08] hover:text-white'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
