'use client'

import { useState } from 'react'
import { EmailTemplate } from '@/types/database.types'
import { replaceVariables, SAMPLE_VALUES, TEMPLATE_CATEGORIES } from '@/lib/email-variables'
import { X, Eye, Code } from 'lucide-react'

interface TemplatePreviewModalProps {
  template: EmailTemplate
  onClose: () => void
}

export function TemplatePreviewModal({
  template,
  onClose,
}: TemplatePreviewModalProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'html'>('preview')

  // Replace variables with sample values for preview
  const previewSubject = replaceVariables(template.subject, SAMPLE_VALUES)
  const previewBody = replaceVariables(template.body, SAMPLE_VALUES)

  // Get category label
  const getCategoryLabel = (category: string | null) => {
    const found = TEMPLATE_CATEGORIES.find((c) => c.value === category)
    return found?.label || 'General'
  }

  // Get category badge color
  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      welcome: 'bg-green-500/20 text-green-300 border-green-500/30',
      follow_up: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      paperwork: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      funding: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      closing: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      general: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    }
    return colors[category || 'general'] || colors.general
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide">
              {template.name}
            </h2>
            <span
              className={`px-2 py-0.5 text-xs rounded-full border ${getCategoryColor(
                template.category
              )}`}
            >
              {getCategoryLabel(template.category)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-white/5">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              viewMode === 'preview'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={() => setViewMode('html')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              viewMode === 'html'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Code className="w-4 h-4" />
            HTML Source
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            Variables replaced with sample data
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Subject Line */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Subject
            </label>
            <div className="text-white font-medium">{previewSubject}</div>
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Body
            </label>
            {viewMode === 'preview' ? (
              <div
                className="prose prose-invert max-w-none bg-white/5 rounded-xl p-4 border border-white/10"
                dangerouslySetInnerHTML={{ __html: previewBody }}
              />
            ) : (
              <pre className="bg-white/5 rounded-xl p-4 border border-white/10 text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono">
                {template.body}
              </pre>
            )}
          </div>

          {/* Description */}
          {template.description && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Description
              </label>
              <p className="text-sm text-gray-400">{template.description}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-5 py-2 glass-button rounded-xl text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
