import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { SignupGateway } from '@/components/signup-gateway'

export const metadata: Metadata = {
  title: { absolute: 'Voice Alchemy Academy · Start free: pitch, scale and rhythm trainers, lessons and courses' },
  description:
    'Create a free Voice Alchemy Academy account to practice with real-time pitch, scale and rhythm trainers, then add coaching feedback, online voice lessons and courses. Teachers: run your studio, lessons and student practice data here.',
  alternates: { canonical: '/' },
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return <SignupGateway />
}
