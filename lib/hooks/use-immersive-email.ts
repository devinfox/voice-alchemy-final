'use client'

import { usePathname } from 'next/navigation'

/**
 * Immersive email mode.
 *
 * Returns true when the user is inside the main email experience
 * (`/dashboard/email` and its subroutes: inbox, sent, drafts, thread views,
 * settings, etc.). When true, the surrounding dashboard chrome — top search
 * navbar (Header), task sidebar (TaskSidebar), and the persistent left Sidebar —
 * collapses so the email client renders full-bleed as its own immersive view.
 *
 * Deliberately excludes sibling routes that merely share the "email" prefix but
 * are ordinary dashboard pages (`/dashboard/email-templates`,
 * `/dashboard/email-export`).
 */
export function useImmersiveEmail(): boolean {
  const pathname = usePathname() || ''
  return pathname === '/dashboard/email' || pathname.startsWith('/dashboard/email/')
}
