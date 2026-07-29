// Quoted-printable decoding utilities (isomorphic: works in Node and the browser).
//
// Some incoming emails arrive with their body still quoted-printable encoded,
// which shows up as artifacts like `=20` (space), `=E2=9A=A1=EF=B8=8F` (a UTF-8
// emoji) and a trailing `=` at the end of lines (soft line breaks). These helpers
// detect and decode that content so it renders as clean text.

/**
 * Detects whether a string still contains raw quoted-printable encoding.
 *
 * Intentionally conservative: we only want to decode bodies that are genuinely
 * quoted-printable, never already-decoded HTML — which can legitimately contain
 * `=` in URLs (`?a=20`) or legacy unquoted attributes (`<td width=20>`).
 * Decoding those would corrupt the markup.
 */
export function looksLikeQuotedPrintable(content: string | null | undefined): boolean {
  if (!content) return false
  // Soft line break: '=' immediately before a newline. This is the defining
  // marker of quoted-printable and essentially never appears in real HTML/text.
  if (/=\r?\n/.test(content)) return true
  // A run of two or more consecutive '=HH' escapes, e.g. a UTF-8 multibyte
  // character like '=E2=9A=A1'. A single isolated '=20' (such as a legacy
  // '<td width=20>' attribute) does NOT match, so normal HTML is left alone.
  if (/(?:=[0-9A-Fa-f]{2}){2,}/.test(content)) return true
  // An encoded '=' ('=3D') immediately before a quote: the quoted-printable
  // form of an attribute assignment like `href=3D"..."` or `width=3D'...'`.
  // Already-decoded HTML never contains this sequence, so it's a high-precision
  // QP signal even when the body has no soft line breaks or consecutive escapes
  // (otherwise `href=3D"https://..."` renders raw as a broken relative link).
  if (/=3D["']/.test(content)) return true
  return false
}

/**
 * Decodes quoted-printable content in a UTF-8 aware way.
 *
 * Both '=HH' escapes and literal characters are collected as raw bytes and the
 * whole buffer is decoded as UTF-8, so multibyte sequences like emoji
 * (`=E2=9A=A1=EF=B8=8F` → ⚡️) render correctly instead of as mojibake.
 */
export function decodeQuotedPrintable(content: string): string {
  // Remove soft line breaks ('=' at end of a line).
  const text = content.replace(/=\r?\n/g, '')
  const encoder = new TextEncoder()
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      for (const b of encoder.encode(ch)) bytes.push(b)
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

/**
 * Decodes content only if it looks quoted-printable; otherwise returns it
 * unchanged. Idempotent and safe to call on already-decoded content.
 */
export function maybeDecodeQuotedPrintable(content: string | null | undefined): string {
  if (!content) return content ?? ''
  return looksLikeQuotedPrintable(content) ? decodeQuotedPrintable(content) : content
}
