import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy-loaded admin client singleton
let adminClient: SupabaseClient | null = null

/**
 * Get Supabase admin client (bypasses RLS)
 * Lazy-loaded to avoid build-time errors when env vars aren't available
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables')
    }

    adminClient = createClient(supabaseUrl, serviceRoleKey)
  }
  return adminClient
}

/**
 * Create admin client inline (for files that need a fresh instance)
 * Only call this at runtime, not at module level
 */
export function createSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, serviceRoleKey)
}
