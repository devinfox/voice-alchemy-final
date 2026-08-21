import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ComposePageClient } from './compose-client'
import { CreateEmailAccountPrompt } from './create-account-prompt'
import { getOrgEmailDomain } from '@/lib/email-domain'

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string; resumeDraftId?: string }>
}) {
  const params = await searchParams
  const draftId = params.draftId
  const resumeDraftId = params.resumeDraftId
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get user's email accounts (use admin client to bypass RLS for domain join)
  const { data: accounts } = await supabaseAdmin
    .from('email_accounts')
    .select(`
      *,
      domain:email_domains(id, domain, verification_status)
    `)
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })

  // Get the verified email domain
  const sharedDomain = await getOrgEmailDomain(null)

  // If no accounts, show prompt to create email username
  if (!accounts || accounts.length === 0) {
    if (sharedDomain && sharedDomain.verification_status === 'verified') {
      return (
        <div className="h-full flex flex-col">
          {/* Back button */}
          <div className="p-4 border-b border-white/10">
            <Link
              href="/dashboard/email"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Inbox
            </Link>
          </div>

          {/* Create account prompt */}
          <div className="flex-1 flex items-center justify-center p-6">
            <CreateEmailAccountPrompt
              sharedDomain={sharedDomain}
              userName={user.name || ''}
            />
          </div>
        </div>
      )
    } else {
      // No shared domain configured or not verified
      redirect('/dashboard/email/settings/accounts')
    }
  }

  // Filter to accounts that can send emails:
  // - Third-party providers (microsoft, gmail) - always allowed (they use their own infrastructure)
  // - SendGrid accounts - require verified domain
  const verifiedAccounts = accounts.filter(
    (a: any) =>
      a.provider === 'microsoft' ||
      a.provider === 'gmail' ||
      a.domain?.verification_status === 'verified'
  )

  if (verifiedAccounts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-light text-white mb-3">Domain Verification Required</h2>
          <p className="text-gray-400 mb-6">
            You need to verify your domain before you can send emails.
            Please complete the DNS setup process.
          </p>
          <Link
            href="/dashboard/email/settings/domains"
            className="inline-flex items-center gap-2 px-6 py-3 glass-button-gold rounded-xl text-sm font-medium"
          >
            Verify Domain
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Compose form centered (the Back to Inbox link now lives in the compose header).
          items-stretch lets the card fill the height so the editor grows. */}
      <div className="flex-1 flex items-stretch justify-center p-6 overflow-hidden min-h-0">
        <ComposePageClient accounts={verifiedAccounts} draftId={draftId} resumeDraftId={resumeDraftId} />
      </div>
    </div>
  )
}
