'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
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
  ClipboardList,
  Mail,
  FileText,
  Music2,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@/types/database.types'
import { canAccessEmailTools } from '@/lib/email-access'

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
  { name: 'Training Center', href: '/dashboard/training-center', icon: Music },
  { name: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
  { name: 'Email', href: '/dashboard/email', icon: Mail },
  { name: 'Email Templates', href: '/dashboard/email-templates', icon: FileText },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
]

// Admin-only navigation
const adminNavigation: NavItem[] = [
  { name: 'Student Directory', href: '/dashboard/admin/students', icon: ClipboardList },
]

// Student navigation
const studentNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Training Center', href: '/dashboard/training-center', icon: Music },
  { name: 'My Lessons', href: '/dashboard/my-lessons', icon: BookOpen },
  { name: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
  { name: 'Find Teacher', href: '/dashboard/find-teacher', icon: Search },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
]

const bottomNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface MobileNavProps {
  user: User | null
  userEmail?: string | null
  unreadEmailCount?: number
}

export function MobileNav({ user, userEmail }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
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
  const isAdmin = user?.role === 'admin'
  const hasEmailAccess = canAccessEmailTools(user, userEmail)
  const visibleTeacherNavigation = teacherNavigation.filter((item) => {
    if (item.href.startsWith('/dashboard/email')) return hasEmailAccess
    return true
  })
  const navigation = isTeacher
    ? (isAdmin ? [...visibleTeacherNavigation, ...adminNavigation] : visibleTeacherNavigation)
    : studentNavigation

  return (
    <div className="lg:hidden">
      {/* Mobile Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-[#120d24]/90 backdrop-blur-xl sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center">
          <Image
            src="/voice-alchemy-logo-stacked.png"
            alt="Voice Alchemy Academy"
            width={130}
            height={32}
            className="object-contain"
            priority
          />
        </Link>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          aria-label="Toggle Menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] glass-card-luxe bg-[#171229]/95 border-r border-white/[0.08] flex flex-col p-4 space-y-4 shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <Image
                src="/voice-alchemy-logo-stacked.png"
                alt="Voice Alchemy Academy"
                width={130}
                height={32}
                className="object-contain"
              />
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-[#CEB466]/20 text-[#CEB466] border border-[#CEB466]/40'
                        : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Bottom Links & User Profile */}
            <div className="pt-4 border-t border-white/[0.08] space-y-2">
              <button
                onClick={() => {
                  setIsOpen(false)
                  const dashboardTourKey = isTeacher ? 'teacher_dashboard_v4' : 'student_dashboard_v4'
                  window.dispatchEvent(new CustomEvent(`start-spotlight-${dashboardTourKey}`))
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#CEB466] hover:bg-[#CEB466]/10 transition-colors text-left"
              >
                <Sparkles className="w-4 h-4 text-[#CEB466]" />
                <span>Page Tour</span>
              </button>

              {bottomNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white"
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              ))}

              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
