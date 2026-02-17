'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, ChevronDown, Settings, LogOut, Users, GraduationCap, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database.types'

interface HeaderProps {
  user: User | null
}

interface SearchResult {
  id: string
  type: 'teacher' | 'student'
  name: string
  role?: string
}

export function Header({ user }: HeaderProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const isTeacher = user?.role === 'teacher' || user?.role === 'instructor' || user?.role === 'admin'

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search functionality
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      const supabase = createClient()

      try {
        // Search profiles based on user role
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, name, role')
          .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%`)
          .limit(10)

        const results: SearchResult[] = (profiles || []).map(p => ({
          id: p.id,
          type: (p.role === 'teacher' || p.role === 'instructor' || p.role === 'admin') ? 'teacher' : 'student',
          name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
          role: p.role,
        }))

        // Filter results based on user role
        const filteredResults = isTeacher
          ? results // Teachers can see everyone
          : results.filter(r => r.type === 'teacher') // Students only see teachers

        setSearchResults(filteredResults)
        setShowResults(true)
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(searchTimeout)
  }, [searchQuery, isTeacher])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false)
    setSearchQuery('')
    if (isTeacher && result.type === 'student') {
      router.push('/dashboard/students')
    } else if (result.type === 'teacher') {
      router.push('/dashboard/find-teacher')
    }
  }

  const searchPlaceholder = isTeacher
    ? 'Search students, teachers...'
    : 'Search teachers...'

  return (
    <header className="hidden lg:flex h-16 glass-card mx-2 mt-2 rounded-2xl px-6 items-center justify-between border-white/[0.08]">
      {/* Search */}
      <div className="flex-1 max-w-xl" ref={searchRef}>
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-[#CEB466]" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            className="w-full pl-11 pr-11 py-2.5 glass-input rounded-xl"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSearchResults([])
                setShowResults(false)
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Search Results Dropdown */}
          {showResults && (searchResults.length > 0 || isSearching) && (
            <div className="absolute top-full left-0 right-0 mt-2 glass-card rounded-xl shadow-2xl shadow-black/40 py-2 z-50 max-h-80 overflow-y-auto border border-white/10 animate-slide-up">
              {isSearching ? (
                <div className="px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#CEB466]/30 border-t-[#CEB466] rounded-full animate-spin" />
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">No results found</div>
              ) : (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.06] transition-all duration-200 border-l-2 border-transparent hover:border-[#CEB466]"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg ${
                      result.type === 'teacher'
                        ? 'bg-gradient-to-br from-[#CEB466] to-[#9c8644] shadow-[#CEB466]/20'
                        : 'bg-gradient-to-br from-blue-500 to-purple-600 shadow-purple-500/20'
                    }`}>
                      {result.type === 'teacher' ? (
                        <GraduationCap className="w-4 h-4 text-[#171229]" />
                      ) : (
                        <Users className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{result.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{result.type}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* User Menu with Dropdown */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 p-2 -m-2 rounded-xl hover:bg-white/[0.04] transition-all duration-200"
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">
                  {user.first_name} {user.last_name}
                </p>
                <p className="text-xs text-[#CEB466]/70 capitalize">
                  {user.role?.replace('_', ' ')}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-sm shadow-lg shadow-[#CEB466]/20 ring-2 ring-[#CEB466]/20">
                {user.first_name?.[0]}{user.last_name?.[0]}
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-52 glass-card rounded-xl shadow-2xl shadow-black/40 py-2 z-50 border border-white/10 animate-slide-up">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all duration-200 mx-2 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <Settings className="w-4 h-4" />
                  </div>
                  Settings
                </Link>
                <hr className="my-2 border-white/[0.06] mx-4" />
                <button
                  onClick={handleSignOut}
                  className="w-[calc(100%-16px)] flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 mx-2 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <LogOut className="w-4 h-4" />
                  </div>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
