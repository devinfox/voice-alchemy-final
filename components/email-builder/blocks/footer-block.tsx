'use client'

import { EmailBlock } from '@/lib/email-builder-context'

interface FooterBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
}

export function FooterBlock({ block, isSelected, onClick }: FooterBlockProps) {
  const { text, showSocial, socialLinks, unsubscribeUrl, bgColor, textColor, padding } = block.properties

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-gray-900' : ''
      }`}
      style={{
        backgroundColor: bgColor,
        padding: `${padding}px`,
        textAlign: 'center',
      }}
    >
      {showSocial && socialLinks?.length > 0 && (
        <div className="mb-4">
          {socialLinks.map((link: any, idx: number) => (
            <span key={idx} style={{ color: textColor, margin: '0 8px' }}>
              {link.name}
            </span>
          ))}
        </div>
      )}
      <p style={{ color: textColor, fontSize: '14px', margin: '0 0 8px 0' }}>
        {text}
      </p>
      {unsubscribeUrl && (
        <p style={{ fontSize: '12px', margin: 0 }}>
          <span style={{ color: textColor }}>Unsubscribe</span>
        </p>
      )}
    </div>
  )
}

// Settings component for footer block
export function FooterBlockSettings({
  properties,
  onChange,
}: {
  properties: Record<string, any>
  onChange: (props: Record<string, any>) => void
}) {
  const socialLinks = properties.socialLinks || []

  const updateSocialLink = (index: number, field: string, value: string) => {
    const updated = [...socialLinks]
    updated[index] = { ...updated[index], [field]: value }
    onChange({ socialLinks: updated })
  }

  const addSocialLink = () => {
    onChange({ socialLinks: [...socialLinks, { name: 'link', url: '#' }] })
  }

  const removeSocialLink = (index: number) => {
    onChange({ socialLinks: socialLinks.filter((_: any, i: number) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Footer Text
        </label>
        <input
          type="text"
          value={properties.text || ''}
          onChange={(e) => onChange({ text: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="© 2024 Company Name"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={properties.showSocial || false}
            onChange={(e) => onChange({ showSocial: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500/50"></div>
        </label>
        <span className="text-sm text-gray-300">Show Social Links</span>
      </div>

      {properties.showSocial && (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">
            Social Links
          </label>
          <div className="space-y-2">
            {socialLinks.map((link: any, idx: number) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="text"
                  value={link.name || ''}
                  onChange={(e) => updateSocialLink(idx, 'name', e.target.value)}
                  className="glass-input flex-1 px-2 py-1.5 text-xs"
                  placeholder="Name"
                />
                <input
                  type="text"
                  value={link.url || ''}
                  onChange={(e) => updateSocialLink(idx, 'url', e.target.value)}
                  className="glass-input flex-1 px-2 py-1.5 text-xs"
                  placeholder="URL"
                />
                <button
                  type="button"
                  onClick={() => removeSocialLink(idx)}
                  className="px-2 py-1 text-red-400 hover:bg-red-500/10 rounded"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addSocialLink}
              className="w-full px-3 py-2 text-xs text-yellow-400 hover:bg-yellow-500/10 rounded-lg border border-dashed border-yellow-500/30"
            >
              + Add Link
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          Unsubscribe URL
        </label>
        <input
          type="text"
          value={properties.unsubscribeUrl || ''}
          onChange={(e) => onChange({ unsubscribeUrl: e.target.value })}
          className="glass-input w-full px-3 py-2 text-sm"
          placeholder="Enter unsubscribe URL"
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
            value={properties.textColor || '#999999'}
            onChange={(e) => onChange({ textColor: e.target.value })}
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
