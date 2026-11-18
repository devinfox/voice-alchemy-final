import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthUser, getCurrentUser } from '@/lib/supabase-server'
import { canAccessEmailTools } from '@/lib/email-access'

export const metadata: Metadata = { title: 'Leads', description: 'Website leads and the funnels that picked them up.' }

/** Same gate as the email tools: Julia (or an admin) only. */
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser()
  const user = await getAuthUser()
  if (!profile || !user) redirect('/login')
  if (!canAccessEmailTools(profile, user.email)) redirect('/dashboard')
  return children
}
