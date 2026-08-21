'use client'

import { useState, useRef, useEffect } from 'react'
import { Save, Loader2, Star, Check, Wand2, ChevronDown, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { generateSignatureHtml, generateMinimalSignatureHtml, DEVIN_FOX_SIGNATURE, type SignatureConfig } from '@/lib/email-signature'

interface SignatureEditorProps {
  accountId: string
  accountEmail: string
  initialSignatureHtml: string
  isPrimary: boolean
}

// Pre-built signature templates
const SIGNATURE_TEMPLATES: { name: string; description: string; config: SignatureConfig }[] = [
  {
    name: 'Devin Fox - Director',
    description: 'Director of Technologies with full branding',
    config: DEVIN_FOX_SIGNATURE,
  },
  {
    name: 'Vocal Coach',
    description: 'Vocal Coach & Instructor template',
    config: {
      name: 'Your Name',
      title: 'Vocal Coach & Instructor',
      phone: '818.209.2305',
      email: 'your.email@voicealchemyacademy.com',
      includeTrustBadges: true,
      includeAsSeenOn: true,
    },
  },
  {
    name: 'Academy Coordinator',
    description: 'Student Success & Coordinator signature',
    config: {
      name: 'Your Name',
      title: 'Student Success Coordinator',
      phone: '818.209.2305',
      email: 'your.email@voicealchemyacademy.com',
      includeTrustBadges: true,
      includeAsSeenOn: false,
    },
  },
]

export function SignatureEditor({
  accountId,
  accountEmail,
  initialSignatureHtml,
  isPrimary,
}: SignatureEditorProps) {
  const [signatureHtml, setSignatureHtml] = useState(initialSignatureHtml)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [customConfig, setCustomConfig] = useState<SignatureConfig>({
    name: '',
    title: '',
    phone: '',
    email: accountEmail,
    includeTrustBadges: true,
    includeAsSeenOn: true,
  })
  const editorRef = useRef<HTMLDivElement>(null)
  const templateRef = useRef<HTMLDivElement>(null)

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialSignatureHtml
    }
  }, [initialSignatureHtml])

  // Close template dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSave = async () => {
    if (!editorRef.current) return

    setSaving(true)
    setError(null)
    setSaved(false)

    const html = editorRef.current.innerHTML
    const text = editorRef.current.innerText

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('email_accounts')
        .update({
          signature_html: html,
          signature_text: text,
        })
        .eq('id', accountId)

      if (updateError) {
        throw updateError
      }

      setSignatureHtml(html)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Error saving signature:', err)
      setError('Failed to save signature')
    } finally {
      setSaving(false)
    }
  }

  const applyTemplate = (config: SignatureConfig) => {
    const html = generateSignatureHtml(config)
    if (editorRef.current) {
      editorRef.current.innerHTML = html
      setSignatureHtml(html)
    }
    setShowTemplates(false)
  }

  const applyCustomSignature = () => {
    if (!customConfig.name || !customConfig.title || !customConfig.phone || !customConfig.email) {
      setError('Please fill in all fields')
      return
    }
    const html = generateSignatureHtml(customConfig)
    if (editorRef.current) {
      editorRef.current.innerHTML = html
      setSignatureHtml(html)
    }
    setShowCustomize(false)
    setError(null)
  }

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">{accountEmail}</span>
          {isPrimary && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 rounded-full text-xs text-yellow-400">
              <Star className="w-3 h-3 fill-yellow-400" />
              Primary
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Template Dropdown */}
          <div ref={templateRef} className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg text-sm text-yellow-400 transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              Use Template
              <ChevronDown className={`w-3 h-3 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
            </button>

            {showTemplates && (
              <div className="absolute right-0 mt-2 w-72 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wider font-medium">Quick Templates</p>
                  {SIGNATURE_TEMPLATES.map((template, index) => (
                    <button
                      key={index}
                      onClick={() => applyTemplate(template.config)}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <div className="text-sm text-white font-medium">{template.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{template.description}</div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-white/10 p-2">
                  <button
                    onClick={() => {
                      setShowTemplates(false)
                      setShowCustomize(true)
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <div className="text-sm text-yellow-400 font-medium">Create Custom Signature</div>
                    <div className="text-xs text-gray-500 mt-0.5">Enter your own details</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Custom Signature Form */}
      {showCustomize && (
        <div className="px-4 py-4 bg-white/5 border-b border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-white">Create Custom Signature</h4>
            <button
              onClick={() => setShowCustomize(false)}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={customConfig.name}
                onChange={(e) => setCustomConfig({ ...customConfig, name: e.target.value })}
                placeholder="Devin Fox"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={customConfig.title}
                onChange={(e) => setCustomConfig({ ...customConfig, title: e.target.value })}
                placeholder="Director of Technologies"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Phone</label>
              <input
                type="text"
                value={customConfig.phone}
                onChange={(e) => setCustomConfig({ ...customConfig, phone: e.target.value })}
                placeholder="818.209.2305"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="text"
                value={customConfig.email}
                onChange={(e) => setCustomConfig({ ...customConfig, email: e.target.value })}
                placeholder="devin@voicealchemyacademy.com"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={customConfig.includeTrustBadges}
                onChange={(e) => setCustomConfig({ ...customConfig, includeTrustBadges: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-yellow-500 focus:ring-yellow-500/50"
              />
              Include Trust Badges
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={customConfig.includeAsSeenOn}
                onChange={(e) => setCustomConfig({ ...customConfig, includeAsSeenOn: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-yellow-500 focus:ring-yellow-500/50"
              />
              Include "As Seen On"
            </label>
          </div>
          <button
            onClick={applyCustomSignature}
            className="mt-4 w-full px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg text-sm text-yellow-400 font-medium transition-colors"
          >
            Generate Signature
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Editor */}
      <div className="p-4">
        <div
          ref={editorRef}
          contentEditable
          className="min-h-[200px] p-4 bg-white rounded-lg border border-white/10 focus:border-yellow-500/30 focus:outline-none text-gray-800 text-sm prose max-w-none empty:before:content-['Enter_your_email_signature...'] empty:before:text-gray-400"
          style={{ background: '#fff' }}
          onInput={() => {
            if (editorRef.current) {
              setSignatureHtml(editorRef.current.innerHTML)
            }
          }}
        />
        <p className="mt-3 text-xs text-gray-500">
          Edit your signature above, or use a template to get started. Changes are saved when you click Save.
        </p>
      </div>
    </div>
  )
}
