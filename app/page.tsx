import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LandingPage from '@/components/LandingPage'

export const metadata = {
  title: 'Voice Alchemy Academy | Online Voice Lessons & Artist Mentorship',
  description: 'Unlock your voice with world-class online singing lessons, private mentorship, and exclusive music events. Develop vocal mastery, artistic confidence, and stage presence from anywhere.',
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return <LandingPage />
}
