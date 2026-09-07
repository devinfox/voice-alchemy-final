import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { canAccessEmailTools } from '@/lib/email-access'

export const metadata: Metadata = { title: 'Emails & Funnels', description: 'Reusable emails and automated sequences for students, leads, teachers and mentorship applicants.' }

export default async function EmailTemplatesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentUser()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!profile || !user) {
    redirect('/login')
  }

  if (!canAccessEmailTools(profile, user.email)) {
    redirect('/dashboard')
  }

  return children
}
