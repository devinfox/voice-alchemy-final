import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Settings, User } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()
  const profile = await getCurrentUser()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!profile || !authUser) {
    redirect('/login')
  }

  const displayName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
  const roleDisplay = profile.role?.replace('_', ' ') || 'User'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Settings className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400">Manage your account and preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Section */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
          <div className="flex items-center gap-2 mb-6">
            <User className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Profile</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium text-lg">{displayName}</p>
                <p className="text-gray-400 capitalize">{roleDisplay}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <p className="text-white font-medium">{authUser.email}</p>
              </div>

              {profile.bio && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Bio</label>
                  <p className="text-white">{profile.bio}</p>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Member Since</label>
                <p className="text-white">
                  {new Date(profile.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Coming Soon */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Preferences</h2>
          <p className="text-gray-400">
            Profile editing and preferences coming soon.
          </p>
        </div>
      </div>
    </div>
  )
}
