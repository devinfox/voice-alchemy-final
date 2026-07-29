/**
 * Minimal Nimbus UI stand-in for email compose AI affordances.
 */

'use client'

export function useNimbus() {
  return {
    showNimbus: (_opts?: unknown) => {
      // no-op: full Nimbus assistant is not ported
    },
    hideNimbus: () => {},
    isOpen: false,
  }
}

export function NimbusAssistant() {
  return null
}
