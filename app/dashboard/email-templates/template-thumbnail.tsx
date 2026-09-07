'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmailTemplate } from '@/types/database.types'
import { renderEmailTemplate, SAMPLE_RECIPIENT, SAMPLE_SENDER } from '@/lib/email-variables'

// The email container is 600px wide; the frame is laid out at exactly that
// width and scaled to fill the card edge to edge.
const DESIGN_WIDTH = 600

/**
 * Snapshot of the email, with sample values filled in, zoomed to the card's
 * width and top-aligned: the ink header starts at the top edge and anything
 * taller than the card is cropped at the bottom. Non-interactive: no scripts
 * run inside, and pointer events pass through to the card.
 */
export function TemplateThumbnail({ template, className = '' }: { template: EmailTemplate; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [layout, setLayout] = useState<{ scale: number; height: number; left: number } | null>(null)

  const html = useMemo(() => {
    const rendered = renderEmailTemplate(template, { recipient: SAMPLE_RECIPIENT, sender: SAMPLE_SENDER })
    if (!rendered.html) return ''
    return rendered.html.replace(
      '</head>',
      // Thumbnail-only overrides: fixed 600px layout, no outer canvas padding
      // (so the email fills the frame with no bands), always the light design.
      `<meta name="color-scheme" content="light only">
<style>html,body{margin:0;overflow:hidden !important;} body{width:${DESIGN_WIDTH}px;min-width:${DESIGN_WIDTH}px;}
.email-body > tbody > tr > td{padding:0 !important;} .email-container{width:${DESIGN_WIDTH}px !important;max-width:${DESIGN_WIDTH}px !important;}</style></head>`
    )
  }, [template])

  const measure = useCallback(() => {
    const box = boxRef.current
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!box || !frame || !doc?.documentElement) return
    const emailHeight = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 1)
    const boxWidth = box.clientWidth
    if (!boxWidth) return
    // Fit the width exactly; the card's overflow-hidden crops the bottom.
    const scale = boxWidth / DESIGN_WIDTH
    setLayout({ scale, height: emailHeight, left: 0 })
  }, [])

  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(box)
    return () => observer.disconnect()
  }, [measure])

  if (!html) {
    return (
      <div className={`flex items-center justify-center bg-white/[0.03] text-xs text-gray-500 ${className}`}>
        No content yet
      </div>
    )
  }

  return (
    <div ref={boxRef} className={`relative overflow-hidden bg-[#111111] ${className}`}>
      <iframe
        ref={frameRef}
        title={`${template.name} preview`}
        srcDoc={html}
        // same-origin (no scripts) so the parent can read the email's height
        sandbox="allow-same-origin"
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        onLoad={measure}
        className="absolute top-0 pointer-events-none select-none border-0 origin-top-left transition-opacity duration-200"
        style={{
          width: DESIGN_WIDTH,
          height: layout ? layout.height : 1200,
          left: layout ? layout.left : 0,
          transform: `scale(${layout ? layout.scale : 0.5})`,
          opacity: layout ? 1 : 0,
        }}
      />
    </div>
  )
}
