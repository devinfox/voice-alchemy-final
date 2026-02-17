'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'

// ============================================================================
// DEV ONLY - Quick Login Component
// ============================================================================

interface DevUser {
  id: string
  name: string
  role: string
  email: string
}

function DevQuickLogin() {
  const [users, setUsers] = useState<DevUser[]>([])
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const fetchUsers = useCallback(async () => {
    if (users.length > 0) return // Already loaded
    setLoading(true)
    try {
      const res = await fetch('/api/dev/login-as')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      console.error('Failed to fetch dev users:', err)
    } finally {
      setLoading(false)
    }
  }, [users.length])

  const handleQuickLogin = async (email: string, name: string) => {
    setLoggingIn(email)
    try {
      const res = await fetch('/api/dev/login-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      if (res.ok) {
        const data = await res.json()
        if (data.verifyUrl) {
          // Navigate to the verification URL which will set the session
          window.location.href = data.verifyUrl
        }
      } else {
        const error = await res.json()
        alert(`Login failed: ${error.error}`)
        setLoggingIn(null)
      }
    } catch (err) {
      console.error('Quick login failed:', err)
      alert('Quick login failed')
      setLoggingIn(null)
    }
  }

  // Find Julia specifically (teacher)
  const julia = users.find(u =>
    u.name.toLowerCase().includes('julia') &&
    (u.role === 'teacher' || u.role === 'instructor')
  )

  // Group users by role
  const teachers = users.filter(u => u.role === 'teacher' || u.role === 'instructor' || u.role === 'admin')
  const students = users.filter(u => u.role === 'student')

  return (
    <div className="mt-6 pt-6 border-t border-dashed border-orange-500/30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-orange-400 uppercase tracking-wider">Dev Mode</span>
        <span className="text-[10px] text-orange-500/60 bg-orange-500/10 px-2 py-0.5 rounded">localhost only</span>
      </div>

      {/* Quick Julia Button */}
      {julia ? (
        <button
          onClick={() => handleQuickLogin(julia.email, julia.name)}
          disabled={!!loggingIn}
          className="w-full mb-3 py-3 px-4 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-medium text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loggingIn === julia.email ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Logging in...
            </>
          ) : (
            <>
              <span>Login as {julia.name}</span>
              <span className="text-xs opacity-70">(Teacher)</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={() => { setExpanded(true); fetchUsers(); }}
          className="w-full mb-3 py-3 px-4 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 font-medium text-sm transition-all"
        >
          {loading ? 'Loading users...' : 'Show Quick Login Options'}
        </button>
      )}

      {/* Expandable User List */}
      {expanded && (
        <div className="space-y-2">
          <button
            onClick={() => { setExpanded(!expanded); if (!expanded) fetchUsers(); }}
            className="text-xs text-orange-400/70 hover:text-orange-400 underline"
          >
            {expanded ? 'Hide all users' : 'Show all users'}
          </button>

          {loading ? (
            <div className="text-center py-4">
              <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {teachers.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Teachers</p>
                  <div className="grid grid-cols-2 gap-2">
                    {teachers.map(user => (
                      <button
                        key={user.id}
                        onClick={() => handleQuickLogin(user.email, user.name)}
                        disabled={!!loggingIn}
                        className="py-2 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs transition-all disabled:opacity-50 text-left"
                      >
                        {loggingIn === user.email ? (
                          <span className="flex items-center gap-1">
                            <div className="w-3 h-3 border border-purple-300/50 border-t-purple-300 rounded-full animate-spin" />
                            ...
                          </span>
                        ) : (
                          <span className="truncate block">{user.name || user.email}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {students.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Students</p>
                  <div className="grid grid-cols-2 gap-2">
                    {students.slice(0, 6).map(user => (
                      <button
                        key={user.id}
                        onClick={() => handleQuickLogin(user.email, user.name)}
                        disabled={!!loggingIn}
                        className="py-2 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs transition-all disabled:opacity-50 text-left"
                      >
                        {loggingIn === user.email ? (
                          <span className="flex items-center gap-1">
                            <div className="w-3 h-3 border border-blue-300/50 border-t-blue-300 rounded-full animate-spin" />
                            ...
                          </span>
                        ) : (
                          <span className="truncate block">{user.name || user.email}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toggle expand/collapse */}
      {!expanded && users.length === 0 && !julia && (
        <button
          onClick={() => { setExpanded(true); fetchUsers(); }}
          className="text-xs text-orange-400/70 hover:text-orange-400"
        >
          Load available test accounts
        </button>
      )}

      {!expanded && (teachers.length > 0 || students.length > 0) && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-orange-400/70 hover:text-orange-400 underline"
        >
          Show {teachers.length + students.length} more accounts
        </button>
      )}
    </div>
  )
}

// Check if we're in dev mode (client-side check)
function useIsDevMode() {
  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    // Check if running on localhost or dev environment
    const isLocalhost = window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname.includes('.local')
    setIsDev(isLocalhost)
  }, [])

  return isDev
}

// Known Microsoft email domains
const MICROSOFT_DOMAINS = [
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'outlook.co.uk',
  'hotmail.co.uk',
  'live.co.uk',
  'citadelgold.com',
]

function isMicrosoftDomain(domain: string): boolean {
  return MICROSOFT_DOMAINS.includes(domain.toLowerCase())
}

function LoginForm({ showDevLogin }: { showDevLogin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(errorParam)
  const [loading, setLoading] = useState(false)
  // Async organization check result (for custom domains) - keyed by domain
  const [orgCheckResult, setOrgCheckResult] = useState<{ domain: string; allows: boolean } | null>(null)

  // Check if it's a known Microsoft domain (synchronous/derived)
  const domain = email.split('@')[1]?.toLowerCase() || ''
  const isKnownMicrosoftDomain = domain ? isMicrosoftDomain(domain) : false

  // Derived: either known Microsoft domain OR org allows it (for matching domain)
  const isMicrosoftEmail = isKnownMicrosoftDomain || (orgCheckResult?.domain === domain && orgCheckResult?.allows)

  useEffect(() => {
    // Skip org check if no domain or already a known Microsoft domain
    if (!domain || isKnownMicrosoftDomain) {
      return
    }

    // Check organization settings for custom domains
    let cancelled = false
    const checkOrganization = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('organizations')
        .select('allow_microsoft_login')
        .eq('domain', domain)
        .single()

      if (!cancelled) {
        setOrgCheckResult({ domain, allows: data?.allow_microsoft_login === true })
      }
    }

    checkOrganization()

    return () => {
      cancelled = true
    }
  }, [domain, isKnownMicrosoftDomain])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const domain = email.split('@')[1]?.toLowerCase()

    let shouldUseMicrosoft = false

    if (domain) {
      if (isMicrosoftDomain(domain)) {
        shouldUseMicrosoft = true
      } else {
        const supabase = createClient()
        const { data } = await supabase
          .from('organizations')
          .select('allow_microsoft_login')
          .eq('domain', domain)
          .single()

        shouldUseMicrosoft = data?.allow_microsoft_login === true
      }
    }

    if (shouldUseMicrosoft) {
      try {
        const response = await fetch('/api/auth/microsoft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, redirect }),
        })

        const data = await response.json()

        if (data.authUrl) {
          window.location.href = data.authUrl
          return
        } else {
          setError(data.error || 'Failed to initiate Microsoft login')
          setLoading(false)
        }
      } catch {
        setError('Failed to connect to Microsoft')
        setLoading(false)
      }
      return
    }

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      {error && (
        <div className="bg-red-500/10 backdrop-blur-sm border border-red-400/30 text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full px-4 py-3.5 glass-input rounded-xl"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full px-4 py-3.5 glass-input rounded-xl"
            placeholder="Enter your password"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 px-4 rounded-xl text-sm font-bold text-[#171229] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg, #e0c97d 0%, #CEB466 30%, #b59d52 60%, #9c8644 100%)',
          boxShadow: '0 10px 40px rgba(206, 180, 102, 0.35), 0 4px 12px rgba(0,0,0,0.1)',
        }}
      >
        <span className="relative z-10 tracking-wide uppercase">
          {loading
            ? isMicrosoftEmail
              ? 'Connecting to Microsoft...'
              : 'Signing in...'
            : isMicrosoftEmail
            ? 'Continue with Microsoft'
            : 'Login'}
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>

      {isMicrosoftEmail && (
        <p className="text-center text-xs text-white/80">
          You&apos;ll be redirected to Microsoft to sign in
        </p>
      )}

      <div className="flex items-center justify-center gap-4 text-sm pt-2">
        <Link href="/forgot-password" className="text-gray-400 hover:text-[#CEB466] transition-colors duration-300">
          Forgot Password?
        </Link>
        <span className="text-gray-600">|</span>
        <Link href="/signup" className="text-gray-400 hover:text-[#CEB466] transition-colors duration-300">
          Create Account
        </Link>
      </div>

      {/* Dev Quick Login (localhost only) */}
      {showDevLogin && <DevQuickLogin />}
    </form>
  )
}

export default function LoginPage() {
  const isDev = useIsDevMode()

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f0b1e 0%, #171229 25%, #1f1839 50%, #171229 75%, #0f0b1e 100%)',
      }}
    >
      {/* Futuristic background overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 20%, rgba(206, 180, 102, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(168, 85, 247, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(31, 24, 57, 0.8) 0%, transparent 70%)
          `,
        }}
      />

      {/* Animated gradient orbs */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-gradient-to-br from-[#CEB466]/20 to-transparent rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-br from-purple-500/15 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Glass Card */}
      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glass-card p-8 border border-white/10">
          {/* Logo Header */}
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-4">
              <Image
                src="/voice-alchemy-logo-stacked.png"
                alt="Voice Alchemy Academy"
                width={180}
                height={44}
                className="object-contain"
                priority
              />
              <p className="text-gray-400 text-sm">Welcome back</p>
            </div>
          </div>

          {/* Login Form */}
          <Suspense fallback={
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#CEB466]/30 border-t-[#CEB466] rounded-full animate-spin" />
            </div>
          }>
            <LoginForm showDevLogin={isDev} />
          </Suspense>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-center text-xs text-gray-500">
              Voice lessons made simple
            </p>
          </div>
        </div>

        {/* Decorative glow effect under the card */}
        <div
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 blur-2xl opacity-50"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(206, 180, 102, 0.4), transparent)',
          }}
        />
      </div>
    </div>
  )
}
