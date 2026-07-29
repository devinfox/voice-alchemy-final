/**
 * Outbound email "send gate" — the pre-send validator + serializer described in
 * the engineering brief "Gmail, Outlook, Yahoo, and the engineering rules for a
 * CRM email client that must not break."
 *
 * The brief's core lesson: a CRM reply is not "an HTML string." A send is only a
 * success if the recipient saw the intended content in their real client. Our
 * previous pipeline shipped whatever the contenteditable editor produced, with
 * body_html and body_text authored separately (they diverged on every send), no
 * guaranteed text/plain alternative, and no defense against the two most common
 * display failures: giant empty whitespace and new content trapped inside the
 * quoted history.
 *
 * This module runs on the server right before an email is persisted/sent. Per
 * the chosen rollout posture it AUTO-FIXES everything that is safely fixable and
 * HARD-BLOCKS only the small set of unambiguous, damaging cases:
 *
 *   NORMALIZE (silent, auto-fix):
 *     - derive a canonical text/plain from the final HTML (single source of truth)
 *     - strip empty spacer blocks with explicit height / min-height
 *     - collapse runs of empty paragraphs and <br> chains
 *     - de-duplicate References tokens
 *     - warn (log only) when HTML exceeds Gmail's ~102KB clipping budget
 *
 *   HARD BLOCK (return an error → 400 upstream):
 *     - a reply whose authored body is empty after normalization
 *     - a reply whose new content is trapped inside the quoted history
 *     - duplicate critical headers (Message-ID / In-Reply-To)
 *     - a reply that lost its threading headers even though the original message
 *       HAD a Message-ID we could have referenced (a real bug, not legacy data)
 *
 * Intentionally implemented with the same regex-based approach as the rest of
 * lib/email-utils.ts (no server-side DOM parser dependency), and it reuses the
 * battle-tested stripQuotedContent() quote markers so quote detection stays
 * consistent with how threads are displayed.
 */

import { stripQuotedContent, stripHtml } from '@/lib/email-utils'

// Gmail clips messages at ~102KB of HTML. Stay comfortably under it. This is a
// warning threshold only — we never truncate HTML (that would corrupt markup).
export const HTML_CLIP_WARN_BYTES = 100 * 1024

// A machine-readable code for each hard block, so the UI/logs can distinguish
// them without string-matching the human message.
export type SendGateBlockCode =
  | 'reply_body_empty'
  | 'reply_trapped_in_quote'
  | 'duplicate_critical_header'
  | 'reply_missing_thread_headers'

export interface SendGateInput {
  bodyHtml?: string | null
  bodyText?: string | null
  /** True when this send is a reply (reply_to_email_id was provided). */
  isReply: boolean
  /**
   * True when the email being replied to actually carried a Message-ID we could
   * reference. Distinguishes "we dropped the thread headers" (a bug worth
   * blocking) from "the original never had a Message-ID" (legacy inbound mail we
   * must still let the user reply to).
   */
  canThread?: boolean
  inReplyTo?: string | null
  references?: string | null
}

export interface SendGateResult {
  ok: boolean
  /** Human-readable reason the send was blocked (undefined when ok). */
  error?: string
  code?: SendGateBlockCode
  /** Normalized, ready-to-send HTML. */
  bodyHtml: string
  /** Canonical text/plain, guaranteed present whenever there is any content. */
  bodyText: string
  /** De-duplicated References header value (or the original when unchanged). */
  references: string | null
  /** Non-blocking issues that were auto-fixed or merely flagged, for logging. */
  warnings: string[]
}

// ============================================================================
// HTML → plain text (canonical text/plain derivation)
// ============================================================================

/**
 * Decode the handful of HTML entities that survive into email bodies.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x2019;/gi, '’')
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = parseInt(n, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m
    })
}

/**
 * Derive a readable text/plain alternative from HTML while preserving line and
 * paragraph structure (unlike stripHtml(), which collapses everything to a
 * single line). This becomes the single source of truth for the text part so
 * body_html and body_text can never diverge structurally.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''

  let text = html
    .replace(/\r\n/g, '\n')
    // Drop non-content subtrees entirely.
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Line breaks.
    .replace(/<br\s*\/?>/gi, '\n')
    // List items become "- item".
    .replace(/<li[^>]*>/gi, '\n- ')
    // Block-level closers produce a newline so paragraphs stay separated.
    .replace(/<\/(p|div|tr|h[1-6]|li|ul|ol|table|blockquote|section|article)>/gi, '\n')
    // Horizontal rules / table row starts as spacing hints.
    .replace(/<hr\s*\/?>/gi, '\n')
    // Everything else: drop the tag.
    .replace(/<[^>]+>/g, '')

  text = decodeEntities(text)

  // Normalize whitespace: trim each line, collapse 3+ blank lines to one blank.
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

// ============================================================================
// HTML normalization (strip the banned "giant empty space" patterns)
// ============================================================================

export interface NormalizeResult {
  html: string
  notes: string[]
}

/**
 * Remove the DOM patterns the brief identifies as the usual cause of "giant
 * empty whitespace" in received mail, without touching blocks that carry real
 * content. Conservative by design: we only strip elements that are provably
 * empty (whitespace / &nbsp; / <br> only).
 */
export function normalizeOutboundHtml(html: string): NormalizeResult {
  const notes: string[] = []
  if (!html) return { html: '', notes }

  let out = html

  // 1) Empty spacer blocks with an explicit height / min-height. Matches the
  //    brief's canonical broken example: <div style="height:480px; ...">&nbsp;</div>
  //    Only removes them when the block's content is empty (whitespace/nbsp/br).
  const spacerRe =
    /<(div|p|td|span)\b[^>]*\bstyle\s*=\s*"[^"]*(?:min-)?height\s*:\s*\d[^"]*"[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi
  const beforeSpacer = out
  out = out.replace(spacerRe, '')
  if (out !== beforeSpacer) notes.push('removed empty fixed-height spacer block(s)')

  // 2) Runs of 3+ empty paragraphs collapse to a single empty paragraph. Rich
  //    editors emit these when the user hits Enter repeatedly; clients render
  //    them inconsistently.
  const emptyParaRunRe = /(?:<p[^>]*>\s*(?:<br\s*\/?>\s*)?<\/p>\s*){3,}/gi
  const beforePara = out
  out = out.replace(emptyParaRunRe, '<p><br></p>')
  if (out !== beforePara) notes.push('collapsed empty-paragraph run(s)')

  // 3) Runs of 4+ consecutive <br> collapse to two.
  const brRunRe = /(?:<br\s*\/?>\s*){4,}/gi
  const beforeBr = out
  out = out.replace(brRunRe, '<br><br>')
  if (out !== beforeBr) notes.push('collapsed long <br> run(s)')

  return { html: out, notes }
}

// ============================================================================
// Authored-content isolation (trapped-in-quote / empty-reply detection)
// ============================================================================

/**
 * Strip our own appended signature and ByeTalk Drive link blocks from a body so
 * we can measure ONLY the user's authored content. These markers are stable
 * because we generate them (see lib/email-signature.ts and the compose drive
 * link block). Absent markers (e.g. synced/templated mail) are simply a no-op.
 */
function stripOwnAppendages(html: string): string {
  let out = html
  // Signature: everything from our signature comment onward.
  out = out.replace(/<!--\s*Email Signature\s*-->[\s\S]*$/i, '')
  // ByeTalk Drive share cards.
  out = out.replace(
    /<div[^>]*>\s*<p[^>]*>\s*Shared via ByeTalk Drive[\s\S]*$/i,
    ''
  )
  return out
}

/**
 * True when the body contains a recognizable quoted-history marker (any of the
 * client conventions stripQuotedContent knows how to strip). Used only to give a
 * clearer block reason — "trapped in quote" vs. "empty reply".
 */
function containsQuoteMarker(html: string): boolean {
  return (
    /\bgmail_quote\b/i.test(html) ||
    /<blockquote/i.test(html) ||
    /type="cite"/i.test(html) ||
    /divRplyFwdMsg|appendonsend|moz-cite-prefix|yahoo_quoted|protonmail_quote/i.test(html) ||
    /On\s[\s\S]{0,200}?\bwrote:/i.test(html) ||
    /[-—_]{2,}\s*(?:Forwarded message|Original Message)\s*[-—_]{2,}/i.test(html)
  )
}

/**
 * Returns the user's authored reply text with signature, drive links, and
 * quoted history removed. Used to decide whether a reply actually contains new
 * content. Order matters: remove our appendages first, then quoted history
 * (stripQuotedContent removes the quote AND everything after it).
 */
export function extractAuthoredText(html: string): string {
  if (!html) return ''
  const withoutAppendages = stripOwnAppendages(html)
  const withoutQuote = stripQuotedContent(withoutAppendages)
  // stripHtml collapses to a single line — fine here, we only need presence.
  return stripHtml(withoutQuote).trim()
}

// ============================================================================
// Header hygiene
// ============================================================================

/**
 * De-duplicate the space-separated tokens of a References header, preserving
 * order. Gmail rejects messages with duplicate critical headers, and a
 * References chain that accumulates the same Message-ID twice is a common cause.
 */
export function dedupeReferences(references: string | null | undefined): {
  value: string | null
  changed: boolean
} {
  if (!references) return { value: references ?? null, changed: false }
  const tokens = references.match(/<[^>]+>/g) || references.trim().split(/\s+/)
  const seen = new Set<string>()
  const unique: string[] = []
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t)
      unique.push(t)
    }
  }
  const value = unique.join(' ')
  return { value, changed: value !== references }
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Run the full send gate: normalize the HTML, derive a canonical text/plain,
 * clean the References header, and evaluate the hard-block rules.
 *
 * On a block, ok=false and `error`/`code` are set (map to HTTP 400 upstream).
 * On success, use the returned bodyHtml/bodyText/references for persistence and
 * provider dispatch.
 */
export function runSendGate(input: SendGateInput): SendGateResult {
  const warnings: string[] = []
  const rawHtml = input.bodyHtml ?? ''
  const isHtmlSend = rawHtml.trim().length > 0

  // 1) Normalize HTML.
  const { html: normalizedHtml, notes } = normalizeOutboundHtml(rawHtml)
  warnings.push(...notes)

  // 2) Canonical text/plain. When there is HTML we ALWAYS derive text from it so
  //    the two parts can never diverge; the editor's own getText() excluded the
  //    signature and drifted. When there is no HTML we keep the supplied text.
  let bodyText: string
  if (isHtmlSend) {
    const derived = htmlToPlainText(normalizedHtml)
    const supplied = (input.bodyText ?? '').trim()
    bodyText = derived || supplied
    if (!input.bodyText || !input.bodyText.trim()) {
      warnings.push('derived missing text/plain from HTML')
    }
  } else {
    bodyText = (input.bodyText ?? '').trim()
  }

  // 3) References hygiene.
  const { value: references, changed: refsChanged } = dedupeReferences(input.references)
  if (refsChanged) warnings.push('de-duplicated References header')

  // 4) HTML weight budget (warn only).
  if (isHtmlSend) {
    const bytes = Buffer.byteLength(normalizedHtml, 'utf8')
    if (bytes > HTML_CLIP_WARN_BYTES) {
      warnings.push(
        `HTML is ${Math.round(bytes / 1024)}KB — over the ${Math.round(
          HTML_CLIP_WARN_BYTES / 1024
        )}KB Gmail-clipping budget`
      )
    }
  }

  const blocked = (code: SendGateBlockCode, error: string): SendGateResult => ({
    ok: false,
    error,
    code,
    bodyHtml: normalizedHtml,
    bodyText,
    references,
    warnings,
  })

  // ---- HARD BLOCKS ---------------------------------------------------------

  // Duplicate critical single-value headers. In-Reply-To must be one token;
  // more than one angle-bracketed id means a malformed/duplicated header.
  if (input.inReplyTo) {
    const ids = input.inReplyTo.match(/<[^>]+>/g) || []
    if (ids.length > 1) {
      return blocked(
        'duplicate_critical_header',
        'In-Reply-To header contains multiple message IDs; Gmail rejects duplicate critical headers.'
      )
    }
  }

  if (input.isReply) {
    // Authored body must not be empty and must not be trapped inside the quote.
    const authored = extractAuthoredText(normalizedHtml)
    if (!authored) {
      // Distinguish the two failure modes for a clearer message, but both block.
      if (containsQuoteMarker(stripOwnAppendages(normalizedHtml))) {
        return blocked(
          'reply_trapped_in_quote',
          'This reply has no new content above the quoted history. Type your message above the quoted email before sending.'
        )
      }
      return blocked(
        'reply_body_empty',
        'This reply has no message content. Please write a message before sending.'
      )
    }

    // Lost threading headers even though the original had a Message-ID to
    // reference — a real regression, not missing legacy data.
    if (input.canThread && !input.inReplyTo && !references) {
      return blocked(
        'reply_missing_thread_headers',
        'This reply is missing its threading headers (In-Reply-To/References). Reopen the thread and reply again.'
      )
    }
  }

  // Missing thread headers on a replyable thread is worth surfacing even if not
  // strictly blocked above (e.g. legacy inbound with no Message-ID).
  if (input.isReply && !input.inReplyTo && !references) {
    warnings.push('reply has no In-Reply-To/References (original had no Message-ID)')
  }

  return {
    ok: true,
    bodyHtml: normalizedHtml,
    bodyText,
    references,
    warnings,
  }
}
