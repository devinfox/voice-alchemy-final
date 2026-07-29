'use client'

import { EmailBlock } from '@/lib/email-builder-context'
import { ensureReadableColor } from '../utils/color-utils'

interface TextBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
  contentBackgroundColor?: string
}

export function TextBlock({ block, isSelected, onClick, contentBackgroundColor = '#ffffff' }: TextBlockProps) {
  const { content, align, padding, fontSize, color } = block.properties

  // Ensure text color is readable against the background
  const readableColor = ensureReadableColor(color || '#333333', contentBackgroundColor)

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{
        padding: `${padding}px`,
        textAlign: align,
        fontSize: `${fontSize}px`,
        color: readableColor,
        lineHeight: 1.5,
      }}
    >
      <div
        dangerouslySetInnerHTML={{ __html: content }}
        className="max-w-none [&>p]:mb-4 [&>p:last-child]:mb-0"
      />
    </div>
  )
}

// Convert plain text to HTML with proper paragraphs
function textToHtml(text: string): string {
  if (!text) return ''
  // Split by double line breaks to create paragraphs
  const paragraphs = text.split(/\n\n/)
  return paragraphs
    .map(p => {
      // Convert single line breaks to <br> within paragraphs
      // Preserve spaces by not trimming
      const withBreaks = p.replace(/\n/g, '<br>')
      return `<p style="margin: 0 0 16px 0;">${withBreaks}</p>`
    })
    .join('')
}

// Convert HTML back to plain text for editing
function htmlToText(html: string): string {
  if (!html) return ''
  // Replace </p><p> with double newlines
  let text = html.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
  // Replace <br> with single newlines
  text = text.replace(/<br\s*\/?>/gi, '\n')
  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, '')
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  // Don't trim - preserve user's spaces and newlines
  return text
}

// Settings component for text block
export function TextBlockSettings({
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
          Content
        </label>
        <textarea
          value={htmlToText(properties.content || '')}
          onChange={(e) => onChange({ content: textToHtml(e.target.value) })}
          className="glass-input w-full px-3 py-2 text-sm min-h-[100px]"
          placeholder="Enter text... (use double line break for new paragraph)"
        />
        <p className="text-xs text-gray-500 mt-1">
          Press Enter twice for a new paragraph
        </p>
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
            Font Size
          </label>
          <input
            type="number"
            value={properties.fontSize || 16}
            onChange={(e) => onChange({ fontSize: parseInt(e.target.value) || 16 })}
            className="glass-input w-full px-3 py-2 text-sm"
            min={10}
            max={48}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Text Color
          </label>
          <input
            type="color"
            value={properties.color || '#333333'}
            onChange={(e) => onChange({ color: e.target.value })}
            className="w-full h-10 rounded-lg cursor-pointer bg-transparent"
          />
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
