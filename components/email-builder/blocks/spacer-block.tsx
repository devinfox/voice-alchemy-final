'use client'

import { EmailBlock } from '@/lib/email-builder-context'
import { MoveVertical } from 'lucide-react'

interface SpacerBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
}

export function SpacerBlock({ block, isSelected, onClick }: SpacerBlockProps) {
  const { height } = block.properties

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{ height: `${height}px` }}
    >
      <div className="h-full w-full flex items-center justify-center border border-dashed border-white/20 bg-white/5 rounded">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <MoveVertical className="w-3 h-3" />
          {height}px
        </span>
      </div>
    </div>
  )
}

// Settings component for spacer block
export function SpacerBlockSettings({
  properties,
  onChange,
}: {
  properties: Record<string, any>
  onChange: (props: Record<string, any>) => void
}) {
  const presetHeights = [16, 24, 32, 48, 64, 96]

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Height (px)
        </label>
        <input
          type="number"
          value={properties.height || 32}
          onChange={(e) => onChange({ height: parseInt(e.target.value) || 32 })}
          className="glass-input w-full px-3 py-2 text-sm"
          min={8}
          max={200}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">
          Presets
        </label>
        <div className="grid grid-cols-3 gap-2">
          {presetHeights.map((h) => (
            <button
              key={h}
              onClick={() => onChange({ height: h })}
              className={`px-3 py-2 rounded-lg text-sm ${
                properties.height === h
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {h}px
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
