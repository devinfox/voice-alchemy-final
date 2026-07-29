import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase-server'
import { StudentDirectory } from './student-directory'

export const dynamic = 'force-dynamic'

export default async function AdminStudentsPage() {
  const profile = await getCurrentUser()

  if (!profile) redirect('/login')
  // Server-side gate. The API route enforces this again independently.
  if (profile.role !== 'admin') redirect('/dashboard')

  return <StudentDirectory />
}
