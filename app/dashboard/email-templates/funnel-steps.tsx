import { ArrowRight, Eye } from 'lucide-react'

export interface FunnelStepLike {
  id: string
  phase_order: number
  name: string | null
  delay_days: number
  delay_hours: number
  template_id?: string | null
  template?: { name: string } | null
}

/** "right away", "2 days later", "1 day 6 hours later" */
export function describeDelay(step: Pick<FunnelStepLike, 'delay_days' | 'delay_hours'>, isFirst: boolean): string {
  const days = step.delay_days || 0
  const hours = step.delay_hours || 0
  if (isFirst && days === 0 && hours === 0) return 'right away'
  if (days === 0 && hours === 0) return 'same time'
  const parts: string[] = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  return `${parts.join(' ')} later`
}

/**
 * A funnel as a readable strip of steps: "1 Welcome · right away → 2 Check-in · 3 days later".
 * With `onStepClick`, each step with an email becomes a button (preview / edit).
 */
export function FunnelSteps({
  steps,
  compact = false,
  onStepClick,
}: {
  steps: FunnelStepLike[]
  compact?: boolean
  onStepClick?: (step: FunnelStepLike, index: number) => void
}) {
  const sorted = [...steps].sort((a, b) => a.phase_order - b.phase_order)
  if (sorted.length === 0) {
    return <p className="text-sm text-gray-500">No steps yet</p>
  }
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {sorted.map((step, i) => {
        const clickable = !!onStepClick && !!step.template_id
        const inner = (
          <>
            <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <div className="leading-tight text-left">
              <p className={`text-white ${compact ? 'text-xs' : 'text-sm'} font-medium`}>
                {step.name || step.template?.name || `Step ${i + 1}`}
              </p>
              <p className="text-[11px] text-gray-500">{describeDelay(step, i === 0)}</p>
            </div>
            {clickable && <Eye className="w-3.5 h-3.5 text-gray-500 group-hover/step:text-yellow-400 ml-1 flex-shrink-0" />}
          </>
        )
        const chipClass = `flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`
        return (
          <div key={step.id} className="flex items-center">
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick(step, i)}
                title="Preview or edit this email"
                className={`${chipClass} group/step hover:border-yellow-500/40 hover:bg-white/[0.08] transition-colors`}
              >
                {inner}
              </button>
            ) : (
              <div className={chipClass}>{inner}</div>
            )}
            {i < sorted.length - 1 && <ArrowRight className="w-4 h-4 text-gray-600 mx-1.5 flex-shrink-0" />}
          </div>
        )
      })}
    </div>
  )
}
