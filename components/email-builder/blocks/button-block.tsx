'use client'

import { EmailBlock } from '@/lib/email-builder-context'

interface ButtonBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
}

export function ButtonBlock({ block, isSelected, onClick }: ButtonBlockProps) {
  const { text, bgColor, textColor, align, borderRadius, padding, fontSize, fullWidth } = block.properties

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{
        padding: `${padding}px`,
        textAlign: align,
      }}
    >
      <button
        style={{
          backgroundColor: bgColor,
          color: textColor,
          borderRadius: `${borderRadius}px`,
          fontSize: `${fontSize}px`,
          padding: '12px 24px',
          fontWeight: 'bold',
          border: 'none',
          cursor: 'pointer',
          width: fullWidth ? '100%' : 'auto',
        }}
      >
        {text}
      </button>
    </div>
  )
}

// Settings component for button block
export function ButtonBlockSettings({
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
          Button Text
        </label>
        <input
          type="text"
          value={properties.text || ''}
          onChange={(e) => onChange({ text: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="Click Here"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Link URL
        </label>
        <input
          type="text"
          value={properties.url || ''}
          onChange={(e) => onChange({ url: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="Enter link URL"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Background
          </label>
          <input
            type="color"
            value={properties.bgColor || '#D4AF37'}
            onChange={(e) => onChange({ bgColor: e.target.value })}
            className="w-full h-10 rounded-lg cursor-pointer bg-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Text Color
          </label>
          <input
            type="color"
            value={properties.textColor || '#000000'}
            onChange={(e) => onChange({ textColor: e.target.value })}
            className="w-full h-10 rounded-lg cursor-pointer bg-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Alignment
        </label>
        <div className="flex gap-2">
          {['left', 'center', 'right'].map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => onChange({ align: a })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm capitalize ${
                properties.align === a
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Border Radius
          </label>
          <input
            type="number"
            value={properties.borderRadius || 8}
            onChange={(e) => onChange({ borderRadius: parseInt(e.target.value) || 0 })}
            className="glass-input w-full px-3 py-2 text-sm"
            min={0}
            max={50}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Font Size
          </label>
          <input
            type="number"
            value={properties.fontSize || 16}
            onChange={(e) => onChange({ fontSize: parseInt(e.target.value) || 16 })}
            className="glass-input w-full px-3 py-2 text-sm"
            min={10}
            max={32}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={properties.fullWidth || false}
            onChange={(e) => onChange({ fullWidth: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500/50"></div>
        </label>
        <span className="text-sm text-gray-300">Full Width</span>
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
