import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { AccountsList } from '../../components/accounts-list'

export default async function AccountsSettingsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get user's domains (for creating new accounts)
  const { data: domains } = await supabase
    .from('email_domains')
    .select('id, domain, verification_status')
    .eq('created_by', user.id)
    .eq('is_deleted', false)
    .order('domain', { ascending: true })

  // Get user's email accounts
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select(`
      *,
      domain:email_domains(id, domain, verification_status)
    `)
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-light text-white mb-2">Email Accounts</h1>
          <p className="text-gray-400">
            Create and manage email addresses for your connected domains.
          </p>
        </div>

        {/* Accounts List & Add New */}
        <AccountsList
          accounts={accounts || []}
          domains={domains || []}
          userId={user.id}
        />
      </div>
    </div>
  )
}
