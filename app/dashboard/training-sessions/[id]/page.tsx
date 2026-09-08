import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase-server'
import { ManageTrainingClient } from './manage-client'

export const metadata: Metadata = { title: 'Manage training session' }

export default async function ManageTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <ManageTrainingClient sessionId={id} />
}
