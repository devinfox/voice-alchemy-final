import type { Profile } from '@/types/database.types'

const JULIA_EMAILS = new Set([
  'hello@voicealchemyacademy.com',
  'julia@voicealchemyacademy.com',
])

export function canAccessEmailTools(
  profile: Pick<Profile, 'first_name' | 'last_name' | 'name' | 'role'> | null,
  email?: string | null
) {
  if (!profile) return false

  const role = String(profile.role || '')
  if (role === 'admin' || role === 'super_admin') return true

  const normalizedEmail = (email || '').trim().toLowerCase()
  const fullName = [
    profile.first_name,
    profile.last_name,
    profile.name,
  ].filter(Boolean).join(' ').toLowerCase()

  const isJulia = fullName.includes('julia') || JULIA_EMAILS.has(normalizedEmail)

  return (role === 'teacher' || role === 'instructor') && isJulia
}
