'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  GraduationCap,
  Music,
} from 'lucide-react'
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
    if (users.length > 0) return
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

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleQuickLogin = async (email: string) => {
    setLoggingIn(email)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()

      const res = await fetch('/api/dev/login-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        const data = await res.json()

        if (data.usePasswordAuth && data.password) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
          })
          if (signInError) {
            alert(`Login failed: ${signInError.message}`)
            setLoggingIn(null)
            return
          }
          window.location.href = '/dashboard'
        } else if (data.useOtpAuth && data.tokenHash) {
          const { error: signInError } = await supabase.auth.verifyOtp({
            type: 'magiclink',
            token_hash: data.tokenHash,
          })

          if (signInError) {
            alert(`Login failed: ${signInError.message}`)
            setLoggingIn(null)
            return
          }

          window.location.href = '/dashboard'
        } else if (data.verifyUrl) {
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

  const julia = users.find(
    (u) =>
      u.name.toLowerCase().includes('julia') &&
      (u.role === 'teacher' || u.role === 'instructor')
  )

  const teachers = users.filter(
    (u) => u.role === 'teacher' || u.role === 'instructor' || u.role === 'admin'
  )
  const students = users.filter((u) => u.role === 'student')

  return (
    <div className="mt-6 pt-5 border-t border-white/[0.08]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono text-[#CEB466] uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3 h-3" /> Quick Switch (Dev Mode)
        </span>
        <span className="text-[9px] text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded-full">
          localhost
        </span>
      </div>

      {julia ? (
        <button
          type="button"
          onClick={() => handleQuickLogin(julia.email)}
          disabled={!!loggingIn}
          className="w-full mb-3 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#CEB466]/20 to-[#9c8644]/15 hover:from-[#CEB466]/30 hover:to-[#9c8644]/25 border border-[#CEB466]/40 text-[#CEB466] font-semibold text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loggingIn === julia.email ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-[#CEB466]/30 border-t-[#CEB466] rounded-full animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>Instant Login as Coach {julia.name}</span>
              <span className="text-[10px] opacity-70">(Teacher)</span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setExpanded(true)
            fetchUsers()
          }}
          className="w-full mb-3 py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-gray-300 text-xs transition-all"
        >
          {loading ? 'Loading personas...' : 'Show Test Accounts'}
        </button>
      )}

      {expanded && (
        <div className="space-y-3 animate-fade-in pt-1">
          <div className="flex justify-between items-center text-[10px] text-gray-400">
            <span>Select Persona</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-[#CEB466] hover:underline"
            >
              Hide
            </button>
          </div>

          {loading ? (
            <div className="text-center py-3">
              <div className="w-4 h-4 border-2 border-[#CEB466]/30 border-t-[#CEB466] rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {teachers.length > 0 && (
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">
                    Coaches / Teachers
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {teachers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickLogin(u.email)}
                        disabled={!!loggingIn}
                        className="py-1.5 px-2.5 rounded-lg bg-white/[0.04] hover:bg-[#CEB466]/20 border border-white/[0.06] hover:border-[#CEB466]/40 text-gray-200 hover:text-[#CEB466] text-[11px] transition-all text-left truncate"
                      >
                        {u.name || u.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {students.length > 0 && (
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">
                    Vocal Students
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {students.slice(0, 6).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickLogin(u.email)}
                        disabled={!!loggingIn}
                        className="py-1.5 px-2.5 rounded-lg bg-white/[0.04] hover:bg-emerald-500/20 border border-white/[0.06] hover:border-emerald-500/40 text-gray-200 hover:text-emerald-300 text-[11px] transition-all text-left truncate"
                      >
                        {u.name || u.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function useIsDevMode() {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('.local'))
  )
}

function LoginForm({ showDevLogin }: { showDevLogin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get('redirect') || '/dashboard'
  const redirect = (rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.includes('://')) ? rawRedirect : '/dashboard'
  const errorParam = searchParams.get('error')
  const confirmedParam = searchParams.get('confirmed')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(errorParam)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

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

  const handleGoogleLogin = async () => {
    setError(null)
    setGoogleLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    })

    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      {/* Confirmation & Status Alerts */}
      {confirmedParam === '1' && !error && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 animate-fade-in">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-emerald-300">Email Confirmed Successfully</p>
            <p className="text-gray-300 mt-0.5">Your sanctuary account is active. Sign in below.</p>
          </div>
        </div>
      )}

      {confirmedParam === 'expired' && !error && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          <p className="font-bold">Confirmation link expired</p>
          <p className="mt-0.5 text-gray-300">
            Try signing in below or{' '}
            <Link href="/signup" className="text-[#CEB466] underline font-semibold">
              sign up again
            </Link>.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-400/30 text-red-300 text-xs animate-fade-in">
          {error}
        </div>
      )}

      {/* Input Fields */}
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3.5 glass-input rounded-2xl text-sm"
              placeholder="you@voicealchemy.com"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-[#CEB466] hover:text-[#e0c97d] transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-11 py-3.5 glass-input rounded-2xl text-sm"
              placeholder="••••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Primary Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 px-6 rounded-2xl text-sm font-bold text-[#171229] transition-all duration-300 disabled:opacity-50 relative overflow-hidden group shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
        style={{
          background: 'linear-gradient(135deg, #e0c97d 0%, #CEB466 35%, #b59d52 70%, #9c8644 100%)',
          boxShadow: '0 10px 36px rgba(206, 180, 102, 0.3), 0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <span className="relative z-10 tracking-wider uppercase">
          {loading ? 'Authenticating...' : 'Sign In to Sanctuary'}
        </span>
        {!loading && <ArrowRight className="w-4 h-4 relative z-10" />}
        <div className="absolute inset-0 bg-gradient-to-r from-white/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1 h-px bg-white/[0.08]" />
        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">or</span>
        <div className="flex-1 h-px bg-white/[0.08]" />
      </div>

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className="w-full py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-white/20 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3 shadow-md"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
      </button>

      {/* Create Account Link */}
      <div className="text-center text-xs text-gray-400 pt-2">
        <span>New to Voice Alchemy Academy? </span>
        <Link
          href="/signup"
          className="text-[#CEB466] hover:text-[#e0c97d] font-semibold transition-colors"
        >
          Create account
        </Link>
      </div>

      {/* Dev Quick Login */}
      {showDevLogin && <DevQuickLogin />}
    </form>
  )
}

export default function LoginPage() {
  const isDev = useIsDevMode()

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a0715 0%, #120d24 25%, #191233 50%, #120d24 75%, #0a0715 100%)',
      }}
    >
      {/* Multi-layered Ambient Light & Specular Glows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 40% at 50% 10%, rgba(206, 180, 102, 0.18) 0%, transparent 60%),
            radial-gradient(ellipse 50% 50% at 85% 85%, rgba(168, 85, 247, 0.12) 0%, transparent 60%),
            radial-gradient(ellipse 50% 50% at 15% 75%, rgba(6, 182, 212, 0.08) 0%, transparent 60%)
          `,
        }}
      />

      {/* Animated Subtle Pulse Orbs */}
      <div className="absolute top-12 right-16 w-80 h-80 bg-[#CEB466]/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div
        className="absolute bottom-12 left-16 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse pointer-events-none"
        style={{ animationDelay: '1.5s' }}
      />

      {/* Luxury Glassmorphic Login Container */}
      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="glass-card-luxe p-7 sm:p-9 border border-[#CEB466]/30 shadow-2xl backdrop-blur-3xl relative overflow-hidden">
          {/* Top Specular Rim */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-gradient-to-b from-[#CEB466]/20 to-transparent blur-xl pointer-events-none" />

          {/* Logo & Header */}
          <div className="text-center mb-8 relative z-10">
            <div className="flex flex-col items-center gap-3">
              <Image
                src="/voice-alchemy-logo-stacked.png"
                alt="Voice Alchemy Academy"
                width={170}
                height={42}
                className="object-contain drop-shadow-md"
                priority
              />
              <div className="flex items-center gap-2 pt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CEB466]" />
                <p className="text-xs uppercase tracking-widest text-gray-300 font-semibold">
                  Voice Transformation Portal
                </p>
                <span className="w-1.5 h-1.5 rounded-full bg-[#CEB466]" />
              </div>
            </div>
          </div>

          {/* Form */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-[#CEB466]/30 border-t-[#CEB466] rounded-full animate-spin" />
              </div>
            }
          >
            <LoginForm showDevLogin={isDev} />
          </Suspense>

          {/* Micro Footer */}
          <div className="mt-8 pt-5 border-t border-white/[0.06] text-center relative z-10">
            <p className="text-[11px] text-gray-400 font-medium">
              Hybrid Singing Academy • AI Vocal Companion • Creative Studio
            </p>
          </div>
        </div>

        {/* Outer Glow Halo */}
        <div
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-10 blur-2xl opacity-60 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(206, 180, 102, 0.4), transparent)',
          }}
        />
      </div>
    </div>
  )
}
