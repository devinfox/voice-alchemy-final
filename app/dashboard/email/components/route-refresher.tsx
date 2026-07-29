'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Keeps the email folder views fresh.
 *
 * The folder pages are server-rendered with `force-dynamic`, so the server
 * always produces current data — but Next caches the rendered RSC payload on the
 * client (router cache / bfcache), so navigating to (or even reloading) Sent can
 * replay an old payload, which is how the Sent list got "stuck on Wednesday"
 * while newer sends existed. `router.refresh()` discards that cached payload and
 * pulls a fresh server render.
 *
 * We refresh:
 *  - once on mount and whenever the folder path changes (so opening/switching a
 *    folder always shows live data), and
 *  - when the tab regains focus / becomes visible (so a long-open tab updates).
 * All refreshes share an 8s debounce so rapid events don't stack.
 *
 * Renders nothing.
 */
export function RouteRefresher({ minIntervalMs = 8000 }: { minIntervalMs?: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const lastRef = useRef(0)

  // Fresh data whenever a folder view is shown (mount + folder change).
  useEffect(() => {
    lastRef.current = Date.now()
    router.refresh()
  }, [router, pathname])

  // Fresh data when the user returns to the tab.
  useEffect(() => {
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastRef.current < minIntervalMs) return
      lastRef.current = now
      router.refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router, minIntervalMs])

  return null
}
