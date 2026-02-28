import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { MobileNav } from '@/components/mobile-nav'
import { DashboardFloatingButtons } from '@/components/dashboard-floating-buttons'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getCurrentUser()

  return (
    <div
      className="min-h-screen flex"
      style={{
        background: 'linear-gradient(135deg, #0f0b1e 0%, #171229 25%, #1f1839 50%, #171229 75%, #0f0b1e 100%)',
      }}
    >
      {/* Futuristic overlay with subtle grid pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 20%, rgba(206, 180, 102, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(206, 180, 102, 0.05) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(31, 24, 57, 0.5) 0%, transparent 70%)
          `,
        }}
      />

      {/* Mobile Navigation */}
      <MobileNav user={profile} />

      {/* Desktop Sidebar */}
      <Sidebar user={profile} />

      <div className="flex-1 flex flex-col relative z-10">
        {/* Desktop Header */}
        <Header user={profile} />

        {/* Main Content - add top padding on mobile for fixed header */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto pt-20 lg:pt-6">
          {children}
        </main>
      </div>

      {/* Floating Buttons - adjusted position for mobile */}
      {profile && (
        <DashboardFloatingButtons currentUserId={profile.id} />
      )}
    </div>
  )
}
