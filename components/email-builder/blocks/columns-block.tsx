'use client'

import { useState } from 'react'
import { EmailBlock } from '@/lib/email-builder-context'
import { Type, ImageIcon, Upload, Loader2 } from 'lucide-react'
import { ensureReadableColor, isLightColor } from '../utils/color-utils'

interface ColumnContent {
  type: 'text' | 'image'
  content: string
  align: string
  fontSize: number
  color: string
  src: string
  alt: string
  width: number
}

interface ColumnsBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
  contentBackgroundColor?: string
}

export function ColumnsBlock({ block, isSelected, onClick, contentBackgroundColor = '#ffffff' }: ColumnsBlockProps) {
  const { columnCount, columnWidths, gap, padding, showDivider, dividerColor, dividerThickness, columnContent } = block.properties
  const widths = columnWidths || [50, 50]
  const content: ColumnContent[] = columnContent || []
  const count = columnCount || 2

  // Determine if background is light or dark for placeholder text
  const placeholderColor = isLightColor(contentBackgroundColor) ? '#9ca3af' : '#6b7280'

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{ padding: `${padding}px` }}
    >
      <div className="flex" style={{ gap: showDivider ? 0 : `${gap}px` }}>
        {Array.from({ length: count }).map((_, idx) => {
          const col = content[idx] || { type: 'text', content: '', src: '' }
          const isLast = idx === count - 1

          // Ensure text color is readable against background
          const textColor = ensureReadableColor(col.color || '#333333', contentBackgroundColor)

          return (
            <div
              key={idx}
              className="min-h-[60px] flex items-center justify-center"
              style={{
                width: `${widths[idx] || 50}%`,
                borderRight: showDivider && !isLast ? `${dividerThickness || 1}px solid ${dividerColor || '#E5E5E5'}` : 'none',
                paddingRight: showDivider && !isLast ? `${gap / 2}px` : 0,
                paddingLeft: showDivider && idx > 0 ? `${gap / 2}px` : 0,
              }}
            >
              {col.type === 'image' && col.src ? (
                <img
                  src={col.src}
                  alt={col.alt || ''}
                  style={{
                    maxWidth: `${col.width || 100}%`,
                    height: 'auto',
                    display: 'block',
                    margin: col.align === 'center' ? '0 auto' : col.align === 'right' ? '0 0 0 auto' : '0',
                  }}
                />
              ) : col.type === 'text' && col.content ? (
                <div
                  style={{
                    textAlign: col.align as any,
                    fontSize: `${col.fontSize || 16}px`,
                    color: textColor,
                    width: '100%',
                    lineHeight: 1.5,
                  }}
                  dangerouslySetInnerHTML={{ __html: col.content }}
                />
              ) : (
                <div
                  className="w-full h-full border border-dashed rounded-lg p-4 flex items-center justify-center"
                  style={{
                    backgroundColor: isLightColor(contentBackgroundColor) ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                    borderColor: isLightColor(contentBackgroundColor) ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
                  }}
                >
                  <span className="text-xs" style={{ color: placeholderColor }}>Column {idx + 1}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Settings component for columns block
export function ColumnsBlockSettings({
  properties,
  onChange,
}: {
  properties: Record<string, any>
  onChange: (props: Record<string, any>) => void
}) {
  const [activeColumn, setActiveColumn] = useState(0)
  const [uploading, setUploading] = useState(false)

  const columnCount = properties.columnCount || 2
  const columnContent: ColumnContent[] = properties.columnContent || []

  const presets = [
    { label: '50/50', widths: [50, 50], cols: 2 },
    { label: '33/67', widths: [33, 67], cols: 2 },
    { label: '67/33', widths: [67, 33], cols: 2 },
    { label: '33/33/33', widths: [33, 33, 34], cols: 3 },
    { label: '25/50/25', widths: [25, 50, 25], cols: 3 },
  ]

  const applyPreset = (preset: typeof presets[0]) => {
    // Create or adjust column content array
    const newContent = Array.from({ length: preset.cols }).map((_, idx) => {
      return columnContent[idx] || {
        type: 'text',
        content: `<p>Column ${idx + 1} text</p>`,
        align: 'left',
        fontSize: 16,
        color: '#333333',
        src: '',
        alt: '',
        width: 100,
      }
    })

    onChange({
      columnCount: preset.cols,
      columnWidths: preset.widths,
      columnContent: newContent,
    })

    // Reset active column if it's out of bounds
    if (activeColumn >= preset.cols) {
      setActiveColumn(0)
    }
  }

  const updateColumnContent = (idx: number, updates: Partial<ColumnContent>) => {
    const newContent = [...columnContent]
    newContent[idx] = { ...newContent[idx], ...updates }
    onChange({ columnContent: newContent })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, colIdx: number) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Allowed: JPEG, PNG, GIF, WebP')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Maximum size is 5MB')
      return
    }

    setUploading(true)
    try {
      // Convert file to base64 for API upload (enables server-side optimization)
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
      })
      reader.readAsDataURL(file)
      const base64Data = await base64Promise

      // Upload via API for automatic image optimization
      const response = await fetch('/api/email-templates/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: base64Data,
          type: file.type,
          name: file.name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Upload error:', result.error)
        alert(`Upload failed: ${result.error}`)
        setUploading(false)
        return
      }

      updateColumnContent(colIdx, { src: result.url })
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed: Network error')
    }
    setUploading(false)
  }

  // Convert plain text to HTML with proper paragraphs
  const textToHtml = (text: string): string => {
    if (!text) return ''
    const paragraphs = text.split(/\n\n/)
    return paragraphs
      .map(p => {
        const withBreaks = p.replace(/\n/g, '<br>')
        return `<p style="margin: 0 0 16px 0;">${withBreaks}</p>`
      })
      .join('')
  }

  // Convert HTML back to plain text for editing
  const htmlToText = (html: string): string => {
    if (!html) return ''
    let text = html.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<[^>]*>/g, '')
    text = text.replace(/&nbsp;/g, ' ')
    text = text.replace(/&amp;/g, '&')
    text = text.replace(/&lt;/g, '<')
    text = text.replace(/&gt;/g, '>')
    return text
  }

  const activeCol = columnContent[activeColumn] || { type: 'text', content: '', src: '' }

  return (
    <div className="space-y-4">
      {/* Divider Toggle */}
      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
        <span className="text-sm text-gray-300">Column Divider</span>
        <button
          type="button"
          onClick={() => onChange({ showDivider: !properties.showDivider })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            properties.showDivider ? 'bg-yellow-500/50' : 'bg-white/10'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              properties.showDivider ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Divider Settings (if enabled) */}
      {properties.showDivider && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-white/5 rounded-lg">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Color</label>
            <input
              type="color"
              value={properties.dividerColor || '#E5E5E5'}
              onChange={(e) => onChange({ dividerColor: e.target.value })}
              className="w-full h-8 rounded cursor-pointer bg-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Thickness</label>
            <input
              type="number"
              value={properties.dividerThickness || 1}
              onChange={(e) => onChange({ dividerThickness: parseInt(e.target.value) || 1 })}
              className="glass-input w-full px-2 py-1 text-sm"
              min={1}
              max={5}
            />
          </div>
        </div>
      )}

      {/* Column Layout Presets */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">
          Column Layout
        </label>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={`px-3 py-2 rounded-lg text-xs ${
                JSON.stringify(properties.columnWidths) === JSON.stringify(preset.widths)
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex gap-1 mb-1">
                {preset.widths.map((w, i) => (
                  <div
                    key={i}
                    className="h-4 bg-current opacity-30 rounded"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Gap & Padding */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Gap (px)</label>
          <input
            type="number"
            value={properties.gap || 16}
            onChange={(e) => onChange({ gap: parseInt(e.target.value) || 16 })}
            className="glass-input w-full px-3 py-2 text-sm"
            min={0}
            max={48}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Padding (px)</label>
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

      {/* Column Content Tabs */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">
          Column Content
        </label>
        <div className="flex gap-1 mb-3">
          {Array.from({ length: columnCount }).map((_, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => setActiveColumn(idx)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeColumn === idx
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              Col {idx + 1}
            </button>
          ))}
        </div>

        {/* Content Type Toggle */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => updateColumnContent(activeColumn, { type: 'text' })}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs ${
              activeCol.type === 'text'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <Type className="w-4 h-4" />
            Text
          </button>
          <button
            type="button"
            onClick={() => updateColumnContent(activeColumn, { type: 'image' })}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs ${
              activeCol.type === 'image'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Image
          </button>
        </div>

        {/* Content Editor based on type */}
        {activeCol.type === 'text' ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Content</label>
              <textarea
                value={htmlToText(activeCol.content || '')}
                onChange={(e) => updateColumnContent(activeColumn, { content: textToHtml(e.target.value) })}
                className="glass-input w-full px-3 py-2 text-sm min-h-[80px]"
                placeholder="Enter text..."
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['left', 'center', 'right'].map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => updateColumnContent(activeColumn, { align: a })}
                  className={`px-2 py-1.5 rounded text-xs capitalize ${
                    activeCol.align === a
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Size</label>
                <input
                  type="number"
                  value={activeCol.fontSize || 16}
                  onChange={(e) => updateColumnContent(activeColumn, { fontSize: parseInt(e.target.value) || 16 })}
                  className="glass-input w-full px-2 py-1 text-sm"
                  min={10}
                  max={48}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Color</label>
                <input
                  type="color"
                  value={activeCol.color || '#333333'}
                  onChange={(e) => updateColumnContent(activeColumn, { color: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Image</label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 glass-button rounded-lg cursor-pointer">
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span className="text-sm">{uploading ? 'Uploading...' : 'Upload Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, activeColumn)}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              {activeCol.src && (
                <div className="mt-2 relative">
                  <img
                    src={activeCol.src}
                    alt={activeCol.alt || ''}
                    className="w-full h-auto rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => updateColumnContent(activeColumn, { src: '' })}
                    className="absolute top-2 right-2 p-1 bg-red-500/80 rounded-full text-white hover:bg-red-500"
                  >
                    <span className="text-xs">✕</span>
                  </button>
                </div>
              )}
              <input
                type="url"
                value={activeCol.src || ''}
                onChange={(e) => updateColumnContent(activeColumn, { src: e.target.value })}
                className="glass-input w-full px-3 py-2 text-sm mt-2"
                placeholder="Or paste image URL..."
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['left', 'center', 'right'].map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => updateColumnContent(activeColumn, { align: a })}
                  className={`px-2 py-1.5 rounded text-xs capitalize ${
                    activeCol.align === a
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Width (%)</label>
              <input
                type="range"
                value={activeCol.width || 100}
                onChange={(e) => updateColumnContent(activeColumn, { width: parseInt(e.target.value) })}
                className="w-full"
                min={25}
                max={100}
              />
              <div className="text-xs text-gray-500 text-center">{activeCol.width || 100}%</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
