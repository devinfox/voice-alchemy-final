import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { EmailSplitPaneLayout } from './components/email-split-pane-layout'
import { EmailMobileWrapper } from './components/email-mobile-wrapper'
import { RouteRefresher } from './components/route-refresher'
import { canAccessEmailTools } from '@/lib/email-access'

export default async function EmailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentUser()
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!profile || !authUser) {
    redirect('/login')
  }

  if (!canAccessEmailTools(profile, authUser.email)) {
    redirect('/dashboard')
  }

  // Get current path to conditionally hide sidebar on quick-send page
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || headersList.get('x-invoke-path') || ''
  const isQuickSend = pathname.includes('/quick-send')

  // Quick Send page renders without sidebar for more space
  if (isQuickSend) {
    return (
      <div className="h-full overflow-hidden">
        {children}
      </div>
    )
  }

  // Prefer users mirror (email shim); fall back to auth email
  const admin = getSupabaseAdmin()
  const { data: userRow } = await admin
    .from('users')
    .select('id, email')
    .eq('id', profile.id)
    .maybeSingle()

  const userEmail = userRow?.email || authUser.email || ''

  const { data: accounts } = await admin
    .from('email_accounts')
    .select(`
      *,
      domain:email_domains(id, domain, verification_status)
    `)
    .eq('user_id', profile.id)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })

  return (
    <>
      {/* Re-fetch folder data when the tab regains focus so long-open tabs
          don't show a stale list (e.g. Sent "stuck on Wednesday"). */}
      <RouteRefresher />

      {/* Desktop Layout - Split Pane */}
      <div className="hidden md:block h-full overflow-hidden">
        <EmailSplitPaneLayout userId={profile.id} accounts={accounts || []}>
          {children}
        </EmailSplitPaneLayout>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden h-full overflow-hidden">
        <EmailMobileWrapper userId={profile.id} userEmail={userEmail}>
          {children}
        </EmailMobileWrapper>
      </div>
    </>
  )
}
