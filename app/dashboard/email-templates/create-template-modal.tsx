'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { TEMPLATE_CATEGORIES } from '@/lib/email-variables'
import { X, Eye } from 'lucide-react'
import { EmailBuilder } from '@/components/email-builder/email-builder'
import { PreviewModal } from '@/components/email-builder/preview-modal'
import { EmailBlock, EmailSettings } from '@/lib/email-builder-context'
import { blocksToHtml } from '@/components/email-builder/utils/blocks-to-html'

interface CreateTemplateModalProps {
  onClose: () => void
  onSuccess: () => void
  currentUserId?: string
}

export function CreateTemplateModal({
  onClose,
  onSuccess,
  currentUserId,
}: CreateTemplateModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [blocks, setBlocks] = useState<EmailBlock[]>([])
  const [emailSettings, setEmailSettings] = useState<EmailSettings | undefined>()
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    description: '',
    category: 'general',
    is_active: true,
  })

  const handleBuilderChange = useCallback((newBlocks: EmailBlock[], html: string, settings: EmailSettings) => {
    setBlocks(newBlocks)
    setEmailSettings(settings)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError('Template name is required')
      return
    }
    if (!formData.subject.trim()) {
      setError('Subject line is required')
      return
    }
    if (blocks.length === 0) {
      setError('Please add at least one block to your email')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const body = JSON.stringify(blocks)
    const bodyHtml = blocksToHtml(blocks)

    const { error: insertError } = await supabase.from('email_templates').insert({
      name: formData.name.trim(),
      subject: formData.subject.trim(),
      body: body,
      body_html: bodyHtml,
      description: formData.description.trim() || null,
      category: formData.category,
      is_active: formData.is_active,
      created_by: currentUserId || null,
    })

    if (insertError) {
      console.error('Error creating template:', insertError)
      setError(insertError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    onSuccess()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative glass-card w-full max-w-6xl mx-4 max-h-[95vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide">
              Create Email Template
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(true)}
                disabled={blocks.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 glass-button rounded-lg text-sm disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
            {/* Top Fields */}
            <div className="p-4 border-b border-white/10 space-y-4">
              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Template Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Welcome Email"
                    className="glass-input w-full px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Subject Line <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="e.g., Welcome to Citadel Gold!"
                    className="glass-input w-full px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="glass-select w-full px-3 py-2 text-sm"
                  >
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Email Builder */}
            <div className="flex-1 overflow-hidden p-4 bg-gray-900/50">
              <EmailBuilder
                onChange={handleBuilderChange}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-white/10">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500/50"></div>
                </label>
                <span className="text-sm text-gray-300">Active</span>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Template'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <PreviewModal
          blocks={blocks}
          subject={formData.subject}
          emailSettings={emailSettings}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
}
