'use client'

import type { LevelReading } from '@/lib/recital/audio-pipeline'
import { verdictMessage } from '@/lib/recital/audio-pipeline'

interface LevelIndicatorProps {
  reading: LevelReading
  showMessage?: boolean
  compact?: boolean
}

/** Friendly mic indicator: a soft bar and one sentence. No numbers. */
export function LevelIndicator({ reading, showMessage = true, compact = false }: LevelIndicatorProps) {
  const tone =
    reading.verdict === 'too-hot' ? '#f87171' : reading.verdict === 'hot' ? '#fbbf24' : reading.verdict === 'good' ? '#CEB466' : '#9ca3af'
  const width = Math.round(Math.min(1, reading.level) * 100)
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{ width: `${width}%`, background: `linear-gradient(90deg, ${tone}, ${tone}cc)` }}
        />
      </div>
      {showMessage && (
        <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-300`} aria-live="polite">
          {verdictMessage(reading.verdict)}
        </p>
      )}
    </div>
  )
}
