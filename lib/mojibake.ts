// UTF-8 mojibake repair (isomorphic: works in Node and the browser).
//
// Some inbound emails arrive as UTF-8 text that was decoded one step too many
// times as Latin-1 / Windows-1252. The classic symptom is a non-breaking space
// (U+00A0) — which Gmail/Outlook emit between words and after "Hi"/"Best," — whose
// UTF-8 bytes are 0xC2 0xA0 showing up as "Â ". That's why bodies render as
// "HiÂ Devin,Â". Curly quotes/dashes produce sequences like "â€™" and "â€”".

// Windows-1252 printable characters in the 0x80–0x9F range, which map to code
// points above U+00FF (e.g. byte 0x92 → U+2019 "’"). Reversing this lets us turn
// a mojibake character back into the single byte it originally came from.
const WIN1252_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

// Map a code point back to the single byte it would have been in
// Latin-1 / Windows-1252, or null if it can't be (i.e. it's a genuine
// multibyte Unicode character, which means the string is NOT mojibake).
function toSingleByte(codePoint: number): number | null {
  if (codePoint <= 0xff) return codePoint
  return WIN1252_TO_BYTE[codePoint] ?? null
}

/**
 * Repairs UTF-8 text that was mistakenly decoded as Latin-1 / Windows-1252
 * ("mojibake") — e.g. "HiÂ Devin,Â" → "Hi Devin," and "itâ€™s" → "it’s".
 *
 * Deliberately conservative so clean content is NEVER altered:
 *   - Every character must be representable as a single Latin-1/Windows-1252
 *     byte. A real emoji / curly quote / CJK character means the string is
 *     already correctly decoded, so we bail immediately.
 *   - A mojibake lead-byte marker (Â / Ã / â) must be present.
 *   - The reconstructed bytes must be STRICTLY valid UTF-8. A lone "Â" followed
 *     by an ordinary letter (e.g. a real French "Â") is not valid UTF-8, so the
 *     fatal decoder throws and the original string is returned untouched.
 *
 * Idempotent: repaired text has no markers left, so a second pass is a no-op.
 */
export function repairUtf8Mojibake(content: string | null | undefined): string {
  if (!content) return content ?? ''
  // Only strings carrying a known mojibake lead byte are candidates. This keeps
  // the common case (clean ASCII/Unicode) a single cheap regex test.
  if (!/[ÂÃâ]/.test(content)) return content

  const bytes: number[] = []
  for (let i = 0; i < content.length; i++) {
    const byte = toSingleByte(content.charCodeAt(i))
    if (byte === null) return content // genuine Unicode → not mojibake
    bytes.push(byte)
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return content // not valid UTF-8 → leave untouched
  }
}
