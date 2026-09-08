import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase-server'
import { RecitalsClient } from './recitals-client'

export const metadata: Metadata = { title: 'Recitals', description: 'Host and join live group recitals.' }

export default async function RecitalsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const isTeacher = user.role === 'teacher' || user.role === 'instructor' || user.role === 'admin'
  return <RecitalsClient isTeacher={isTeacher} />
}
