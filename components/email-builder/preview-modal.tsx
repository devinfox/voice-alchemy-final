'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { EmailBlock, EmailSettings, defaultEmailSettings } from '@/lib/email-builder-context'
import { blocksToHtml } from './utils/blocks-to-html'

interface PreviewModalProps {
  blocks: EmailBlock[]
  subject: string
  emailSettings?: EmailSettings
  onClose: () => void
}

export function PreviewModal({ blocks, subject, emailSettings, onClose }: PreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const settings = emailSettings || defaultEmailSettings
  const html = blocksToHtml(blocks, settings)

  // Auto-resize iframe to match content
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (doc) {
          const height = doc.documentElement.scrollHeight || doc.body.scrollHeight
          iframe.style.height = `${Math.max(height, 400)}px`
        }
      } catch (e) {
        // Cross-origin issues, keep default height
      }
    }

    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [html])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Email Preview</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subject Line */}
        <div className="px-6 py-3 border-b border-white/10 bg-white/5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Subject</p>
          <p className="text-white font-medium">{subject || '(No subject)'}</p>
        </div>

        {/* Preview Content - matches the design exactly */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: settings.backgroundColor }}
        >
          <div className="py-5">
            <iframe
              ref={iframeRef}
              srcDoc={html}
              className="w-full border-0 block mx-auto"
              style={{
                minHeight: '400px',
                maxWidth: '640px', // Slightly larger to account for padding
              }}
              title="Email Preview"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-white/10">
          <p className="text-xs text-gray-500">
            Preview shows exactly how your email will appear
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 glass-button rounded-lg text-sm"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}
