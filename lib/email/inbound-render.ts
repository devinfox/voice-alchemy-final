/**
 * Inbound email render normalization — the receiving-side counterpart of the
 * outbound send gate (lib/email/send-gate.ts).
 *
 * Received emails are authored by other people's clients (Gmail, Outlook, Yahoo,
 * newsletters, Word) for a ~600px white page. Injecting that HTML straight into
 * our dark app DOM is the root cause of the "received email looks broken"
 * reports: the sender's fixed widths/heights and spacer blocks fight and
 * overflow our layout, black-on-transparent text renders unreadable on the dark
 * theme, and stripped <style> blocks collapse rich emails.
 *
 * The fix (chosen approach) is to render each message in an isolated, sandboxed,
 * white-background, auto-height iframe — exactly how real mail clients do it.
 * This module provides:
 *   - normalizeInboundHtml(): light HTML pass that resolves inline cid: images
 *     to their stored copies and removes empty fixed-height spacer blocks.
 *   - buildEmailFrameDocument(): wraps normalized+sanitized body HTML in a full
 *     document with a reset stylesheet (white bg, fluid images/tables, wrapping)
 *     and target=_blank links, ready to drop into an <iframe srcdoc>.
 *
 * normalizeInboundHtml is a pure function (regex-based, no DOM) so it is unit
 * testable and safe to run on the server. Actual HTML *sanitization* (DOMPurify)
 * happens in the browser inside the frame component via sanitizeEmailFrameHtml.
 */

/** An attachment/inline-image record as available at the render layer. */
export interface InlineImageRef {
  content_id?: string | null
  /** Public/served URL for the stored image bytes. */
  public_url?: string | null
  storage_path?: string | null
  is_inline?: boolean | null
  filename?: string | null
}

/** Normalize a raw Content-ID for matching: strip <>, cid: prefix, whitespace. */
function normalizeCid(id: string): string {
  return id
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/^cid:/i, '')
    .trim()
    .toLowerCase()
}

/**
 * Rewrite `src="cid:..."` inline-image references to the stored attachment URL.
 * Inbound HTML embeds inline images as <img src="cid:someid">, with the bytes
 * carried as a related MIME part (Content-ID header). If nothing maps those cid
 * refs to a real URL, the browser can't resolve them and the images render
 * broken/"corrupt". This builds a cid→url map from the message's attachments and
 * substitutes every reference.
 */
export function rewriteCidImages(html: string, attachments?: InlineImageRef[] | null): string {
  if (!html || !attachments || attachments.length === 0) return html

  const cidToUrl = new Map<string, string>()
  for (const att of attachments) {
    const url = att.public_url || undefined
    if (!url) continue
    if (att.content_id) cidToUrl.set(normalizeCid(att.content_id), url)
    // Some senders reference the filename instead of the content id.
    if (att.filename) cidToUrl.set(att.filename.trim().toLowerCase(), url)
  }
  if (cidToUrl.size === 0) return html

  // Match src=cid:... whether quoted with " ' or unquoted.
  return html.replace(
    /\bsrc\s*=\s*(?:"cid:([^"]+)"|'cid:([^']+)'|cid:([^\s>]+))/gi,
    (match, dq, sq, uq) => {
      const raw = dq || sq || uq || ''
      const url = cidToUrl.get(normalizeCid(raw))
      return url ? `src="${url}"` : match
    }
  )
}

export interface NormalizeInboundOptions {
  attachments?: InlineImageRef[] | null
}

/**
 * Light, conservative normalization of received HTML before it is framed:
 *  - resolve inline cid: images to stored URLs (fixes "corrupt" inline images)
 *  - remove empty fixed-height spacer blocks (a cause of giant blank gaps)
 *
 * Fluid images/tables and width clamping are handled by the frame's reset CSS
 * (buildEmailFrameDocument) rather than by rewriting the sender's markup, so we
 * touch their HTML as little as possible.
 */
export function normalizeInboundHtml(html: string, opts: NormalizeInboundOptions = {}): string {
  if (!html) return ''
  let out = rewriteCidImages(html, opts.attachments)

  // Empty spacer blocks with an explicit height/min-height → drop them. Only
  // when the block is provably empty (whitespace / &nbsp; / <br> only), so real
  // content is never removed.
  out = out.replace(
    /<(div|p|td|span)\b[^>]*\bstyle\s*=\s*"[^"]*(?:min-)?height\s*:\s*\d[^"]*"[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi,
    ''
  )

  return out
}

/**
 * A DELIBERATELY MINIMAL baseline stylesheet for the email frame. It is injected
 * at the TOP of <head>, BEFORE the email's own <style>, so the sender's CSS wins
 * every conflict — we only supply defaults and prevent horizontal overflow. The
 * message is rendered on white (what emails are designed for), so we do NOT
 * recolor text or links: the sender's real styling shows exactly as it would in
 * Gmail/Outlook.
 */
const FRAME_RESET_CSS = `
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    padding: 16px;
    color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
  }
  /* Prevent images/media from overflowing the pane without distorting them. */
  img, video { max-width: 100% !important; height: auto; }
  /* Keep long unbroken strings (URLs) from forcing horizontal scroll. */
  td, th { overflow-wrap: anywhere; }
  pre { white-space: pre-wrap; word-break: break-word; }
`

/**
 * Take the sanitized email (a WHOLE document from sanitizeEmailFrameHtml, so the
 * sender's <head><style> is intact) and inject our baseline reset + a
 * `<base target="_blank">` into its <head>, producing a string ready for an
 * <iframe srcdoc>. The reset goes FIRST so the email's own styles override it.
 * `<base target="_blank">` opens links in a new tab (the sandbox blocks in-place
 * navigation regardless).
 */
export function buildEmailFrameDocument(sanitizedDoc: string): string {
  const injection =
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    // Send NO referrer for images/subresources the email loads. Many senders
    // host signature logos/banners on servers with hotlink protection that 403
    // any request carrying a cross-domain Referer (e.g. Coalition Technologies'
    // WordPress site returns 200 with no referrer, 403 with one). Without this,
    // those remote images render as broken icons. (The iframe element's own
    // referrerPolicy only covers fetching the srcdoc, not these subresources.)
    '<meta name="referrer" content="no-referrer">' +
    `<base target="_blank"><style>${FRAME_RESET_CSS}</style>`

  let doc = sanitizedDoc || ''

  if (/<head[^>]*>/i.test(doc)) {
    // Inject right after the opening <head> so our reset precedes the email's.
    doc = doc.replace(/<head[^>]*>/i, (m) => `${m}${injection}`)
  } else if (/<html[^>]*>/i.test(doc)) {
    doc = doc.replace(/<html[^>]*>/i, (m) => `${m}<head>${injection}</head>`)
  } else {
    // Bare fragment with no document scaffolding — wrap it.
    doc = `<html><head>${injection}</head><body>${doc}</body></html>`
  }

  if (!/^\s*<!doctype/i.test(doc)) {
    doc = `<!doctype html>${doc}`
  }
  return doc
}
