'use client'

import { useState } from 'react'
import { EmailBlock } from '@/lib/email-builder-context'
import { Play, Upload, Loader2 } from 'lucide-react'

interface VideoBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
}

export function VideoBlock({ block, isSelected, onClick }: VideoBlockProps) {
  const { thumbnailUrl, playIconColor, overlayColor, width, align, padding } = block.properties

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{ padding: `${padding}px`, textAlign: align }}
    >
      {thumbnailUrl ? (
        <div className="relative inline-block" style={{ maxWidth: `${width}%` }}>
          <img
            src={thumbnailUrl}
            alt="Video thumbnail"
            className="w-full h-auto rounded"
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: overlayColor }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <Play
                className="w-8 h-8 ml-1"
                style={{ color: playIconColor }}
                fill={playIconColor}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 bg-white/5 rounded-lg border border-dashed border-white/20">
          <Play className="w-12 h-12 text-gray-500 mb-2" />
          <p className="text-sm text-gray-500">Add video thumbnail</p>
        </div>
      )}
    </div>
  )
}

// Settings component for video block
export function VideoBlockSettings({
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
        onChange({ thumbnailUrl: url })
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
          Video Thumbnail
        </label>
        <div className="space-y-2">
          <label className="flex items-center justify-center gap-2 px-4 py-3 glass-button rounded-lg cursor-pointer">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="text-sm">{uploading ? 'Uploading...' : 'Upload Thumbnail'}</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <input
            type="url"
            value={properties.thumbnailUrl || ''}
            onChange={(e) => onChange({ thumbnailUrl: e.target.value })}
            className="glass-input w-full px-3 py-2 text-sm"
            placeholder="Or paste thumbnail URL..."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Video URL
        </label>
        <input
          type="url"
          value={properties.videoUrl || ''}
          onChange={(e) => onChange({ videoUrl: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="YouTube or video link..."
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Play Icon Color
        </label>
        <input
          type="color"
          value={properties.playIconColor || '#FFFFFF'}
          onChange={(e) => onChange({ playIconColor: e.target.value })}
          className="w-full h-10 rounded-lg cursor-pointer bg-transparent"
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
          min={25}
          max={100}
        />
        <div className="text-xs text-gray-500 text-center">{properties.width || 100}%</div>
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
