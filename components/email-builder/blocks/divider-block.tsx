'use client'

import { EmailBlock } from '@/lib/email-builder-context'
import { ensureVisibleDivider } from '../utils/color-utils'

interface DividerBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
  contentBackgroundColor?: string
}

export function DividerBlock({ block, isSelected, onClick, contentBackgroundColor = '#ffffff' }: DividerBlockProps) {
  const { color, thickness, width, style, padding } = block.properties

  // Ensure divider is visible against background
  const visibleColor = ensureVisibleDivider(color || '#E5E5E5', contentBackgroundColor)

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{ padding: `${padding}px` }}
    >
      <hr
        style={{
          border: 'none',
          borderTop: `${thickness}px ${style} ${visibleColor}`,
          width: `${width}%`,
          margin: '0 auto',
        }}
      />
    </div>
  )
}

// Settings component for divider block
export function DividerBlockSettings({
  properties,
  onChange,
}: {
  properties: Record<string, any>
  onChange: (props: Record<string, any>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Color
        </label>
        <input
          type="color"
          value={properties.color || '#E5E5E5'}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-full h-10 rounded-lg cursor-pointer bg-transparent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Thickness (px)
        </label>
        <input
          type="number"
          value={properties.thickness || 1}
          onChange={(e) => onChange({ thickness: parseInt(e.target.value) || 1 })}
          className="glass-input w-full px-3 py-2 text-sm"
          min={1}
          max={10}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Width (%)
        </label>
        <input
          type="range"
          value={properties.width || 100}
          onChange={(e) => onChange({ width: parseInt(e.target.value) })}
          className="w-full"
          min={10}
          max={100}
        />
        <div className="text-xs text-gray-500 text-center">{properties.width || 100}%</div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Style
        </label>
        <div className="flex gap-2">
          {['solid', 'dashed', 'dotted'].map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => onChange({ style: s })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm capitalize ${
                properties.style === s
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Padding (px)
        </label>
        <input
          type="number"
          value={properties.padding || 16}
          onChange={(e) => onChange({ padding: parseInt(e.target.value) || 16 })}
          className="glass-input w-full px-3 py-2 text-sm"
          min={0}
          max={64}
        />
      </div>
    </div>
  )
}
