/**
 * HTML Sanitization Utilities
 *
 * Uses DOMPurify to sanitize HTML content before rendering.
 * Critical for security when displaying external email content.
 */

import DOMPurify from 'dompurify'

// ============================================================================
// CONFIGURATION
// ============================================================================

// Allowed HTML tags for email content
const EMAIL_ALLOWED_TAGS = [
  // Text formatting
  'p', 'br', 'span', 'div',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
  'sub', 'sup', 'small', 'mark',

  // Lists
  'ul', 'ol', 'li',

  // Links and media
  'a', 'img',

  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',

  // Blocks
  'blockquote', 'pre', 'code', 'hr',

  // Headers (limited)
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',

  // Semantic
  'article', 'section', 'header', 'footer', 'aside', 'main',
  'figure', 'figcaption',

  // Forms (read-only display)
  'label',

  // NOTE: <style> is intentionally NOT allowed. An email <style> block contains
  // global selectors (e.g. `a { color: blue }`, `body {...}`) that, once injected
  // via dangerouslySetInnerHTML, apply to the ENTIRE app — leaking out of the
  // email body and restyling the sidebar/nav. Inline `style="..."` attributes are
  // element-scoped and safe, so emails keep their formatting without the leak.
]

// Allowed HTML attributes
const EMAIL_ALLOWED_ATTR = [
  // Global
  'class', 'id', 'style', 'title', 'dir', 'lang',

  // Links
  'href', 'target', 'rel',

  // Images
  'src', 'alt', 'width', 'height', 'loading',

  // Tables
  'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border', 'align', 'valign',

  // Colors
  'color', 'bgcolor', 'background',

  // Data attributes (for tracking)
  'data-*',
]

// Forbidden URL schemes
const FORBIDDEN_URI_SCHEMES = [
  'javascript',
  'vbscript',
  'data', // data: URIs can be dangerous except for images
]

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Sanitize HTML for email display
 * Removes scripts, dangerous attributes, and sanitizes URLs
 */
export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') {
    // Server-side: basic sanitization. Strip whole-document style sources so
    // their global CSS can never leak into the app shell.
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<link\b[^>]*>/gi, '')
      .replace(/<base\b[^>]*>/gi, '')
      .replace(/on\w+\s*=/gi, 'data-removed=')
      .replace(/javascript:/gi, 'blocked:')
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target'], // Allow target="_blank" for links

    // Security settings. `style`/`link`/`base`/`head`/`meta` are forbidden so an
    // email can never inject global CSS that leaks out of its own body.
    FORBID_TAGS: ['script', 'style', 'link', 'base', 'head', 'meta', 'title', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],

    // URL sanitization
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|sms):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,

    // Transform hooks
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  })
}

/**
 * Sanitize HTML for compose/editing
 * More permissive than email display since this is user-generated content
 */
export function sanitizeComposeHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      ...EMAIL_ALLOWED_TAGS,
      'font', // Legacy support
    ],
    ALLOWED_ATTR: [
      ...EMAIL_ALLOWED_ATTR,
      'size', 'face', // Font attributes
    ],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  })
}

/**
 * Strip all HTML tags, return plain text
 */
export function stripHtmlTags(html: string): string {
  if (typeof window === 'undefined') {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  const div = document.createElement('div')
  div.innerHTML = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })
  return div.textContent || div.innerText || ''
}

/**
 * Sanitize and transform email for safe rendering
 * - Removes dangerous content
 * - Converts links to open in new tab
 * - Adds loading="lazy" to images
 */
export function sanitizeAndTransformEmail(html: string): string {
  if (typeof window === 'undefined') {
    return sanitizeEmailHtml(html)
  }

  // Configure DOMPurify hooks
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Force links to open in new tab
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }

    // Lazy load images
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy')
      // Add error handler styling
      node.setAttribute('onerror', "this.style.display='none'")
    }
  })

  const result = sanitizeEmailHtml(html)

  // Clean up hooks
  DOMPurify.removeHook('afterSanitizeAttributes')

  return result
}

/**
 * Sanitize received-email HTML for rendering inside an ISOLATED, sandboxed
 * iframe (see components/email-body-frame.tsx).
 *
 * Because the content is contained in its own document — the iframe is sandboxed
 * WITHOUT allow-scripts, so no CSS/JS can execute or leak into the app — we can
 * safely re-allow <style> blocks here, which the non-isolated path
 * (sanitizeEmailHtml) must strip. This lets rich/newsletter/Outlook emails that
 * depend on a <style> block render as their sender intended, instead of
 * collapsing into a broken stack. Scripts, frames, forms, event handlers, and
 * dangerous URL schemes are still removed as defense in depth.
 */
export function sanitizeEmailFrameHtml(html: string): string {
  if (typeof window === 'undefined') {
    // Server render: strip only the actively dangerous bits; the iframe sandbox
    // is the real containment boundary. <style> is kept (safe once isolated).
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<(object|embed|form)\b[^>]*>/gi, '')
      .replace(/on\w+\s*=/gi, 'data-removed=')
      .replace(/javascript:/gi, 'blocked:')
  }

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy')
    }
  })

  const result = DOMPurify.sanitize(html, {
    // WHOLE_DOCUMENT keeps <html>/<head>/<body> so the email's own <head><style>
    // block survives — without it DOMPurify returns only body content and the
    // message renders as raw, UNSTYLED HTML (newsletters, footers, styled links
    // all break). Keeping the sender's full stylesheet is what makes the message
    // look the way it does in Gmail/Outlook.
    WHOLE_DOCUMENT: true,
    ALLOWED_TAGS: [...EMAIL_ALLOWED_TAGS, 'style', 'font', 'center', 'html', 'head', 'body'],
    ALLOWED_ATTR: [...EMAIL_ALLOWED_ATTR, 'size', 'face', 'media', 'type', 'charset', 'bgcolor'],
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target'],
    // No <script>/<iframe>/<form>/etc. even inside the frame — belt and braces.
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|sms):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  })

  DOMPurify.removeHook('afterSanitizeAttributes')
  return result
}

/**
 * Check if HTML content is safe (no dangerous patterns)
 */
export function isHtmlSafe(html: string): boolean {
  const dangerous = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /expression\s*\(/i,
    /url\s*\(\s*["']?\s*javascript/i,
  ]

  return !dangerous.some(pattern => pattern.test(html))
}

/**
 * Sanitize URL for safety
 */
export function sanitizeUrl(url: string): string {
  if (!url) return ''

  const trimmed = url.trim().toLowerCase()

  // Block dangerous schemes
  for (const scheme of FORBIDDEN_URI_SCHEMES) {
    if (trimmed.startsWith(scheme + ':')) {
      return ''
    }
  }

  // Allow safe schemes
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('/')
  ) {
    return url
  }

  // Add https to bare URLs
  if (trimmed.match(/^[\w.-]+\.\w{2,}/)) {
    return 'https://' + url
  }

  return url
}

// ============================================================================
// REACT COMPONENT HELPER
// ============================================================================

/**
 * Create props for dangerouslySetInnerHTML with sanitization
 */
export function createSanitizedHtmlProps(html: string): {
  dangerouslySetInnerHTML: { __html: string }
} {
  return {
    dangerouslySetInnerHTML: {
      __html: sanitizeAndTransformEmail(html),
    },
  }
}

/**
 * Hook for sanitized HTML rendering
 * Usage: <div {...useSanitizedHtml(emailBody)} />
 */
export function getSanitizedHtmlProps(html: string | null | undefined) {
  if (!html) {
    return { dangerouslySetInnerHTML: { __html: '' } }
  }
  return createSanitizedHtmlProps(html)
}
