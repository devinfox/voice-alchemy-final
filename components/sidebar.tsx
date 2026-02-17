'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  GraduationCap,
  Search,
  BookOpen,
  Calendar,
  Music,
  Feather,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@/types/database.types'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

// Teacher navigation
const teacherNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Students', href: '/dashboard/students', icon: Users },
  { name: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
  { name: 'Training Center', href: '/dashboard/pitch-training', icon: Music },
  { name: 'Songwriting', href: '/dashboard/songwriting', icon: Feather },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
]

// Student navigation
const studentNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Lessons', href: '/dashboard/my-lessons', icon: BookOpen },
  { name: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
  { name: 'Training Center', href: '/dashboard/pitch-training', icon: Music },
  { name: 'Songwriting', href: '/dashboard/songwriting', icon: Feather },
  { name: 'Find Teacher', href: '/dashboard/find-teacher', icon: Search },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
]

const bottomNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  user: User | null
  unreadEmailCount?: number
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Determine which navigation to show based on role
  const isTeacher = user?.role === 'teacher' || user?.role === 'instructor' || user?.role === 'admin'
  const navigation = isTeacher ? teacherNavigation : studentNavigation

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

    return (
      <Link
        key={item.name}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
          isActive
            ? 'bg-gradient-to-r from-[#CEB466]/20 via-[#CEB466]/10 to-transparent text-[#CEB466] border border-[#CEB466]/30 shadow-lg shadow-[#CEB466]/10'
            : 'text-gray-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
        }`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          isActive ? 'bg-[#CEB466]/20' : 'bg-white/5'
        }`}>
          <item.icon className={`w-4 h-4 ${isActive ? 'text-[#CEB466]' : 'text-gray-400'}`} />
        </div>
        <span className="flex-1">{item.name}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-gradient-to-r from-[#CEB466] to-[#9c8644] text-[#171229] text-xs font-bold rounded-full shadow-lg shadow-[#CEB466]/30">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="hidden lg:flex w-64 glass-card flex-col relative z-10 m-2 mr-0 rounded-2xl border-white/[0.08]">
      {/* Logo */}
      <div className="h-20 flex items-center justify-center px-4 border-b border-white/[0.08] bg-white/[0.02]">
        <Link href="/dashboard" className="flex items-center justify-center">
          <Image
            src="/voice-alchemy-logo-stacked.png"
            alt="Voice Alchemy Academy"
            width={140}
            height={34}
            className="object-contain"
            priority
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => renderNavItem(item))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-white/[0.08] space-y-1.5 bg-white/[0.01]">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-r from-[#CEB466]/20 via-[#CEB466]/10 to-transparent text-[#CEB466] border border-[#CEB466]/30 shadow-lg shadow-[#CEB466]/10'
                  : 'text-gray-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isActive ? 'bg-[#CEB466]/20' : 'bg-white/5'
              }`}>
                <item.icon className={`w-4 h-4 ${isActive ? 'text-[#CEB466]' : 'text-gray-400'}`} />
              </div>
              {item.name}
            </Link>
          )
        })}

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300 border border-transparent"
        >
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
            <LogOut className="w-4 h-4 text-gray-400" />
          </div>
          Sign out
        </button>
      </div>

      {/* User Info */}
      {user && (
        <div className="px-3 py-4 border-t border-white/[0.08] bg-gradient-to-t from-white/[0.02] to-transparent">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-white/[0.05] to-transparent border border-white/[0.06]">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-sm shadow-lg shadow-[#CEB466]/20 ring-2 ring-[#CEB466]/20">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-xs text-[#CEB466]/70 truncate capitalize">
                {user.role || 'User'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
