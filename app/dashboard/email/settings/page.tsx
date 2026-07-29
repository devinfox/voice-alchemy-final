import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { SignatureEditor } from '../components/signature-editor'
import Link from 'next/link'
import { Mail, Globe, ArrowRight } from 'lucide-react'

export default async function EmailSettingsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get user's email accounts
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select(`
      id,
      email_address,
      display_name,
      signature_html,
      signature_text,
      is_primary,
      provider
    `)
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-light text-white mb-2">Email Settings</h1>
          <p className="text-gray-400">
            Configure your email preferences, signatures, and connected accounts.
          </p>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Link
            href="/dashboard/email/settings/accounts"
            className="glass-card p-4 hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Email Accounts</h3>
                  <p className="text-sm text-gray-400">
                    {accounts?.length || 0} account{accounts?.length !== 1 ? 's' : ''} connected
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
            </div>
          </Link>

          <Link
            href="/dashboard/email/settings/domains"
            className="glass-card p-4 hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Custom Domains</h3>
                  <p className="text-sm text-gray-400">Manage your email domains</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
            </div>
          </Link>
        </div>

        {/* Signatures Section */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-medium text-white mb-4">Email Signatures</h2>
          <p className="text-sm text-gray-400 mb-6">
            Your signature will be automatically appended to new emails.
          </p>

          {accounts && accounts.length > 0 ? (
            <div className="space-y-6">
              {accounts.map((account) => (
                <SignatureEditor
                  key={account.id}
                  accountId={account.id}
                  accountEmail={account.email_address}
                  initialSignatureHtml={account.signature_html || ''}
                  isPrimary={account.is_primary}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Mail className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400">No email accounts connected</p>
              <Link
                href="/dashboard/email/settings/accounts"
                className="inline-block mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
              >
                Add Email Account
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
