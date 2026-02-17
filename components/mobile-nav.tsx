'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import {
  Menu,
  X,
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
import type { User } from '@/types/database.types'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const teacherNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Students', href: '/dashboard/students', icon: Users },
  { name: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
  { name: 'Training Center', href: '/dashboard/pitch-training', icon: Music },
  { name: 'Songwriting', href: '/dashboard/songwriting', icon: Feather },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
]

const studentNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Lessons', href: '/dashboard/my-lessons', icon: BookOpen },
  { name: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
  { name: 'Training Center', href: '/dashboard/pitch-training', icon: Music },
  { name: 'Songwriting', href: '/dashboard/songwriting', icon: Feather },
  { name: 'Find Teacher', href: '/dashboard/find-teacher', icon: Search },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
]

interface MobileNavProps {
  user: User | null
}

export function MobileNav({ user }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isTeacher = user?.role === 'teacher' || user?.role === 'instructor' || user?.role === 'admin'
  const navigation = isTeacher ? teacherNavigation : studentNavigation

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 glass-overlay border-b border-white/10 px-4 flex items-center justify-between z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2.5 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        <Link href="/dashboard" className="flex items-center">
          <Image
            src="/voice-alchemy-logo-stacked.png"
            alt="Voice Alchemy Academy"
            width={100}
            height={24}
            className="object-contain"
            priority
          />
        </Link>

        {/* User Avatar */}
        {user && (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-xs shadow-lg shadow-[#CEB466]/20 ring-2 ring-[#CEB466]/20">
            {user.first_name?.[0]}{user.last_name?.[0]}
          </div>
        )}
      </header>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0 glass-overlay"
            onClick={() => setIsOpen(false)}
          />

          {/* Slide-in Menu */}
          <div className="absolute top-0 left-0 bottom-0 w-[280px] bg-gradient-to-b from-[#1a1535] to-[#171229] border-r border-white/10 flex flex-col animate-slide-in shadow-2xl shadow-black/50">
            {/* Menu Header */}
            <div className="h-20 flex items-center justify-between px-4 border-b border-white/10 bg-white/[0.02]">
              <Link href="/dashboard" className="flex items-center" onClick={() => setIsOpen(false)}>
                <Image
                  src="/voice-alchemy-logo-stacked.png"
                  alt="Voice Alchemy Academy"
                  width={120}
                  height={29}
                  className="object-contain"
                />
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#CEB466]/20 via-[#CEB466]/10 to-transparent text-[#CEB466] border border-[#CEB466]/30 shadow-lg shadow-[#CEB466]/10'
                        : 'text-gray-300 hover:bg-white/[0.06] hover:text-white active:bg-white/10 border border-transparent'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      isActive
                        ? 'bg-[#CEB466]/20'
                        : 'bg-white/5'
                    }`}>
                      <item.icon className={`w-5 h-5 ${isActive ? 'text-[#CEB466]' : 'text-gray-400'}`} />
                    </div>
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Bottom Section */}
            <div className="px-3 py-4 border-t border-white/10 space-y-1.5 bg-white/[0.01]">
              <Link
                href="/dashboard/settings"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all duration-300 ${
                  pathname === '/dashboard/settings'
                    ? 'bg-gradient-to-r from-[#CEB466]/20 via-[#CEB466]/10 to-transparent text-[#CEB466] border border-[#CEB466]/30 shadow-lg shadow-[#CEB466]/10'
                    : 'text-gray-300 hover:bg-white/[0.06] hover:text-white active:bg-white/10 border border-transparent'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  pathname === '/dashboard/settings' ? 'bg-[#CEB466]/20' : 'bg-white/5'
                }`}>
                  <Settings className={`w-5 h-5 ${pathname === '/dashboard/settings' ? 'text-[#CEB466]' : 'text-gray-400'}`} />
                </div>
                Settings
              </Link>

              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium text-gray-300 hover:bg-red-500/10 hover:text-red-400 active:bg-red-500/15 transition-all duration-300 border border-transparent"
              >
                <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-gray-400" />
                </div>
                Sign out
              </button>
            </div>

            {/* User Info */}
            {user && (
              <div className="px-3 py-4 border-t border-white/10 bg-gradient-to-t from-white/[0.02] to-transparent">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-white/[0.05] to-transparent border border-white/[0.06]">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold shadow-lg shadow-[#CEB466]/20 ring-2 ring-[#CEB466]/20">
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-white truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-sm text-[#CEB466]/70 truncate capitalize">
                      {user.role || 'User'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS for slide-in animation */}
      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.2s ease-out;
        }
      `}</style>
    </>
  )
}
