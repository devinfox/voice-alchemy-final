import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthUser, getCurrentUser } from '@/lib/supabase-server'
import { canAccessEmailTools } from '@/lib/email-access'

export const metadata: Metadata = { title: 'Emails & Funnels', description: 'Reusable emails and automated sequences for students, leads, teachers and mentorship applicants.' }

export default async function EmailTemplatesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentUser()
  const user = await getAuthUser()

  if (!profile || !user) {
    redirect('/login')
  }

  if (!canAccessEmailTools(profile, user.email)) {
    redirect('/dashboard')
  }

  return children
}
