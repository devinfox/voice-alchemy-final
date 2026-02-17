/**
 * Voice Alchemy Academy - Supabase Server Client
 * For use in Server Components, Server Actions, and Route Handlers
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Profile } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

/**
 * Get the current authenticated user's profile
 * In this schema, profiles.id matches auth.users.id directly
 * Auto-creates profile if it doesn't exist
 */
export async function getCurrentUser(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Try to get existing profile
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // If profile doesn't exist, create it
  if (!profile) {
    const name = user.user_metadata?.name || user.user_metadata?.full_name || null
    const firstName = user.user_metadata?.first_name || (name ? name.split(' ')[0] : null)

    const { data: newProfile, error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        name,
        first_name: firstName,
        avatar_url: user.user_metadata?.avatar_url || null,
        role: 'student', // Default role
      })
      .select()
      .single()

    if (error) {
      console.error('[getCurrentUser] Error creating profile:', error)
      return null
    }

    profile = newProfile
  }

  return profile
}

/**
 * Check if user is authenticated (for middleware/guards)
 */
export async function isAuthenticated() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

/**
 * Check if current user is a teacher/instructor/admin
 */
export async function isTeacher(): Promise<boolean> {
  const profile = await getCurrentUser()
  return profile?.role === 'teacher' || profile?.role === 'instructor' || profile?.role === 'admin'
}

/**
 * Check if current user is a student
 */
export async function isStudent(): Promise<boolean> {
  const profile = await getCurrentUser()
  return profile?.role === 'student'
}
