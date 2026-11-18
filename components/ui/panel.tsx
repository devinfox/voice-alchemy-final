import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Panel: a flat grouped area inside a card or dialog (16px corners).
 * `tone` only tints it; padding is 12px (sm) or 16px (md).
 */
const panelVariants = cva('rounded-2xl border', {
  variants: {
    tone: {
      default: 'border-white/10 bg-white/[0.04]',
      accent: 'border-gold-400/35 bg-gold-400/[0.08]',
      success: 'border-emerald-500/35 bg-emerald-500/10',
    },
    padding: { none: '', sm: 'p-3', md: 'p-4' },
  },
  defaultVariants: { tone: 'default', padding: 'md' },
})

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof panelVariants> {}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(({ className, tone, padding, ...props }, ref) => (
  <div ref={ref} className={cn(panelVariants({ tone, padding }), className)} {...props} />
))
Panel.displayName = 'Panel'

/** Small uppercase label above a value or a group. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[11px] font-semibold uppercase tracking-wider text-gray-400', className)} {...props} />
}

interface StatProps {
  label: string
  value: React.ReactNode
  /** Colour of the value when it carries meaning. */
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
  size?: 'sm' | 'md'
  className?: string
}

const STAT_TONES: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'text-white',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
  info: 'text-blue-400',
  accent: 'text-gold-400',
}

/** A number with its caption: the same shape in every stats row. */
export function Stat({ label, value, tone = 'default', size = 'md', className }: StatProps) {
  return (
    <div className={cn('min-w-0 text-center', className)}>
      <p className={cn('font-bold tabular-nums', size === 'md' ? 'text-xl' : 'text-base', STAT_TONES[tone])}>{value}</p>
      <p className="truncate text-xs text-gray-400">{label}</p>
    </div>
  )
}
