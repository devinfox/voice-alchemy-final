import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase-server'
import { TrainingSessionsClient } from './training-client'

export const metadata: Metadata = { title: 'Training Sessions', description: 'Host community training sessions.' }

export default async function TrainingSessionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const isTeacher = user.role === 'teacher' || user.role === 'instructor' || user.role === 'admin'
  if (!isTeacher) redirect('/dashboard')
  return <TrainingSessionsClient />
}
