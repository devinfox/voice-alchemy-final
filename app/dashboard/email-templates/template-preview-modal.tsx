'use client'

import { useState } from 'react'
import { EmailTemplate } from '@/types/database.types'
import {
  renderEmailTemplate,
  SAMPLE_RECIPIENT,
  SAMPLE_SENDER,
  getCategoryLabel,
  getCategoryStyle,
} from '@/lib/email-variables'
import { X, Eye, Code } from 'lucide-react'

interface TemplatePreviewModalProps {
  template: EmailTemplate
  onClose: () => void
}

export function TemplatePreviewModal({ template, onClose }: TemplatePreviewModalProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'html'>('preview')

  // Same renderer the send route and funnel worker use, with sample values
  const rendered = renderEmailTemplate(template, { recipient: SAMPLE_RECIPIENT, sender: SAMPLE_SENDER })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card modal-solid w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide">{template.name}</h2>
            <span className={`px-2 py-0.5 text-xs rounded-full border ${getCategoryStyle(template.category)}`}>
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

        <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-white/5">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              viewMode === 'preview' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={() => setViewMode('html')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              viewMode === 'html' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Code className="w-4 h-4" />
            HTML Source
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            Shown as {SAMPLE_RECIPIENT.name} would receive it from {SAMPLE_SENDER.name}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Subject</label>
            <div className="text-white font-medium">{rendered.subject || <span className="text-gray-500">(no subject)</span>}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Body</label>
            {!rendered.html ? (
              <div className="bg-white/5 rounded-xl p-6 border border-white/10 text-sm text-gray-400 text-center">
                This template has no content yet. Open it in the editor and add a block.
              </div>
            ) : viewMode === 'preview' ? (
              <iframe
                title="Template preview"
                srcDoc={rendered.html}
                sandbox=""
                className="w-full h-[60vh] rounded-xl border border-white/10 bg-white"
              />
            ) : (
              <pre className="bg-white/5 rounded-xl p-4 border border-white/10 text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono max-h-[60vh]">
                {rendered.html}
              </pre>
            )}
          </div>

          {template.description && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Description</label>
              <p className="text-sm text-gray-400">{template.description}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-white/10">
          <button onClick={onClose} className="px-5 py-2 glass-button rounded-xl text-sm font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
