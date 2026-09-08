import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { canAccessEmailTools } from '@/lib/email-access'

export const metadata: Metadata = { title: 'Leads', description: 'Website leads and the funnels that picked them up.' }

/** Same gate as the email tools: Julia (or an admin) only. */
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!profile || !user) redirect('/login')
  if (!canAccessEmailTools(profile, user.email)) redirect('/dashboard')
  return children
}
