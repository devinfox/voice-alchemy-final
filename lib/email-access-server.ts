// Server-side gate for email API routes: returns the caller's profile when
// they may use email tools, otherwise null.
//
// Lives in its own file (rather than lib/email-access.ts) because that module
// is imported by client components (sidebar, mobile-nav) and edge middleware,
// which must not pull in `@/lib/supabase-server` / `next/headers`.

import type { Profile } from '@/types/database.types'
import { canAccessEmailTools } from '@/lib/email-access'
import { getAuthUser, getCurrentUser } from '@/lib/supabase-server'

export async function requireEmailAccess(): Promise<Profile | null> {
  const profile = await getCurrentUser()
  if (!profile) return null

  // canAccessEmailTools also matches on the auth email (profiles has no
  // email column), so pass the auth user's email alongside the profile.
  const user = await getAuthUser()
  return canAccessEmailTools(profile, user?.email) ? profile : null
}
