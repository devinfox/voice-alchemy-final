import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { DomainsList } from '../../components/domains-list'

export default async function DomainsSettingsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get user's domains
  const { data: domains } = await supabase
    .from('email_domains')
    .select('*')
    .eq('created_by', user.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-light text-white mb-2">Email Domains</h1>
          <p className="text-gray-400">
            Connect your domains to send and receive emails. You'll need to add DNS records to your domain provider.
          </p>
        </div>

        {/* Domains List & Add New */}
        <DomainsList domains={domains || []} userId={user.id} />
      </div>
    </div>
  )
}
