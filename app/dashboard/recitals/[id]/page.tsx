import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase-server'
import { ManageRecitalClient } from './manage-client'

export const metadata: Metadata = { title: 'Manage recital' }

export default async function ManageRecitalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <ManageRecitalClient recitalId={id} />
}
