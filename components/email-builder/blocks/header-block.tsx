'use client'

import { useState } from 'react'
import { EmailBlock } from '@/lib/email-builder-context'
import { Upload, Loader2 } from 'lucide-react'

interface HeaderBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
}

export function HeaderBlock({ block, isSelected, onClick }: HeaderBlockProps) {
  const { logoUrl, companyName, bgColor, textColor, padding, align } = block.properties

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{
        backgroundColor: bgColor,
        padding: `${padding}px`,
        textAlign: align,
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          style={{ maxHeight: '50px', display: 'inline-block' }}
        />
      ) : (
        <h1
          style={{
            color: textColor,
            fontSize: '24px',
            fontWeight: 'bold',
            margin: 0,
          }}
        >
          {companyName}
        </h1>
      )}
    </div>
  )
}

// Settings component for header block
export function HeaderBlockSettings({
  properties,
  onChange,
}: {
  properties: Record<string, any>
  onChange: (props: Record<string, any>) => void
}) {
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/email-templates/upload-image', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const { url } = await response.json()
        onChange({ logoUrl: url })
      }
    } catch (error) {
      console.error('Upload error:', error)
    }
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Logo
        </label>
        <div className="space-y-2">
          <label className="flex items-center justify-center gap-2 px-4 py-3 glass-button rounded-lg cursor-pointer">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="text-sm">{uploading ? 'Uploading...' : 'Upload Logo'}</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          {properties.logoUrl && (
            <button
              type="button"
              onClick={() => onChange({ logoUrl: '' })}
              className="w-full px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg"
            >
              Remove Logo
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Company Name (shown if no logo)
        </label>
        <input
          type="text"
          value={properties.companyName || ''}
          onChange={(e) => onChange({ companyName: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="Company Name"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Background
          </label>
          <input
            type="color"
            value={properties.bgColor || '#1A1A1A'}
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
            value={properties.textColor || '#D4AF37'}
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

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Padding (px)
        </label>
        <input
          type="number"
          value={properties.padding || 24}
          onChange={(e) => onChange({ padding: parseInt(e.target.value) || 24 })}
          className="glass-input w-full px-3 py-2 text-sm"
          min={0}
          max={64}
        />
      </div>
    </div>
  )
}
