'use client'

import { useState } from 'react'
import { EmailBlock } from '@/lib/email-builder-context'
import { ImageIcon, Upload, Loader2 } from 'lucide-react'

interface ImageBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
}

export function ImageBlock({ block, isSelected, onClick }: ImageBlockProps) {
  const { src, alt, width, align, padding } = block.properties

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
      {src ? (
        <img
          src={src}
          alt={alt}
          style={{ maxWidth: `${width}%`, height: 'auto', display: 'inline-block' }}
          className="rounded"
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 bg-white/5 rounded-lg border border-dashed border-white/20">
          <ImageIcon className="w-12 h-12 text-gray-500 mb-2" />
          <p className="text-sm text-gray-500">No image selected</p>
        </div>
      )}
    </div>
  )
}

// Settings component for image block
export function ImageBlockSettings({
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

      onChange({ src: result.url })
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed: Network error')
    }
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Image
        </label>
        <div className="space-y-2">
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
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <div className="text-center text-xs text-gray-500">or</div>
          <input
            type="text"
            value={properties.src || ''}
            onChange={(e) => onChange({ src: e.target.value })}
            className="glass-input w-full px-3 py-2 text-sm"
            placeholder="Paste image URL..."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Alt Text
        </label>
        <input
          type="text"
          value={properties.alt || ''}
          onChange={(e) => onChange({ alt: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="Describe the image..."
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
          Link URL (optional)
        </label>
        <input
          type="text"
          value={properties.link || ''}
          onChange={(e) => onChange({ link: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="Enter link URL"
        />
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
