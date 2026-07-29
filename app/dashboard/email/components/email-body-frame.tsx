'use client'

/**
 * EmailBodyFrame — renders a received email's HTML in an ISOLATED, sandboxed,
 * white-background, auto-height iframe (the way Gmail/Outlook render messages).
 *
 * Why an iframe instead of dangerouslySetInnerHTML: injecting a sender's HTML
 * straight into our dark app DOM lets their fixed widths/heights, spacer blocks,
 * and CSS fight and overflow our layout, and renders dark-on-transparent text
 * unreadably against the dark theme. Isolating the message in its own document
 * fixes blank gaps, overflow, cut-off content, and dark-on-dark text in one move,
 * and lets us safely restore <style>-based rich emails.
 *
 * Security: the iframe is sandboxed with allow-same-origin (so the parent can
 * measure the framed document's height) but WITHOUT allow-scripts, so nothing in
 * the email can execute. Content is also sanitized with sanitizeEmailFrameHtml
 * before it is framed. Links get target=_blank via <base>; top-navigation is
 * blocked by the sandbox.
 */

import { useEffect, useRef, useState } from 'react'
import { sanitizeEmailFrameHtml } from '@/lib/html-sanitizer'
import {
  normalizeInboundHtml,
  buildEmailFrameDocument,
  type InlineImageRef,
} from '@/lib/email/inbound-render'

interface EmailBodyFrameProps {
  html: string
  /** Message attachments, used to resolve inline cid: images to stored URLs. */
  attachments?: InlineImageRef[] | null
  className?: string
}

export function EmailBodyFrame({ html, attachments, className }: EmailBodyFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Start with a modest height so there is no giant empty flash before measure.
  const [height, setHeight] = useState(60)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    // Normalize (resolve cid: images, drop empty spacer blocks) → sanitize →
    // wrap in the reset document. Sanitize runs here (client) so DOMPurify is
    // used, not the coarse server fallback.
    const normalized = normalizeInboundHtml(html, { attachments })
    const sanitized = sanitizeEmailFrameHtml(normalized)
    const doc = buildEmailFrameDocument(sanitized)

    let cleanup: (() => void) | undefined

    const measure = () => {
      try {
        const body = iframe.contentDocument?.body
        const docEl = iframe.contentDocument?.documentElement
        if (!body) return
        // scrollHeight of body plus its top/bottom padding is already included;
        // use the max of body/documentElement to be safe across engines.
        const h = Math.max(body.scrollHeight, docEl?.scrollHeight || 0)
        if (h > 0) setHeight(h)
      } catch {
        /* cross-origin guard — should not happen with allow-same-origin */
      }
    }

    const onLoad = () => {
      measure()
      try {
        const cdoc = iframe.contentDocument
        if (!cdoc) return
        // Re-measure when late-loading images change the layout.
        const imgs = Array.from(cdoc.images || [])
        imgs.forEach((img) => {
          if (!img.complete) {
            img.addEventListener('load', measure)
            img.addEventListener('error', measure)
          }
        })
        // Re-measure on any subsequent layout change (fonts, reflow).
        let ro: ResizeObserver | undefined
        if (cdoc.body && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => measure())
          ro.observe(cdoc.body)
        }
        cleanup = () => {
          ro?.disconnect()
          imgs.forEach((img) => {
            img.removeEventListener('load', measure)
            img.removeEventListener('error', measure)
          })
        }
      } catch {
        /* ignore */
      }
    }

    iframe.addEventListener('load', onLoad)
    // Setting srcdoc triggers the load event above.
    iframe.srcdoc = doc

    return () => {
      iframe.removeEventListener('load', onLoad)
      cleanup?.()
    }
  }, [html, attachments])

  return (
    <iframe
      ref={iframeRef}
      title="Email content"
      // allow-same-origin: parent can measure height. NO allow-scripts.
      // allow-popups(+escape): target=_blank links can open a new tab.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className={className}
      style={{
        width: '100%',
        height: `${height}px`,
        border: 0,
        display: 'block',
        background: '#ffffff',
        borderRadius: 8,
        colorScheme: 'light',
      }}
    />
  )
}
