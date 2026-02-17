'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { ProfileRole } from '@/types/database.types'
import { GraduationCap, Users } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<ProfileRole>('student')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role: role,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Auto-redirect after signup (if email confirmation is disabled)
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2000)
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          background: 'linear-gradient(135deg, #0f0b1e 0%, #171229 25%, #1f1839 50%, #171229 75%, #0f0b1e 100%)',
        }}
      >
        <div className="max-w-md w-full text-center">
          <div className="glass-card p-8 border border-[#CEB466]/30">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#CEB466]/30">
              <GraduationCap className="w-8 h-8 text-[#171229]" />
            </div>
            <h2 className="text-xl font-semibold text-[#CEB466] mb-2">Account Created!</h2>
            <p className="text-sm text-gray-400">
              Your account has been created successfully. Redirecting to dashboard...
            </p>
            <div className="mt-4">
              <div className="w-6 h-6 border-2 border-[#CEB466]/30 border-t-[#CEB466] rounded-full animate-spin mx-auto" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
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
      <div className="absolute top-20 right-20 w-64 h-64 bg-gradient-to-br from-[#CEB466]/20 to-transparent rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 left-20 w-80 h-80 bg-gradient-to-br from-purple-500/15 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="max-w-md w-full relative z-10 animate-slide-up">
        <div className="glass-card p-8 border border-white/10">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-4">
              <Image
                src="/voice-alchemy-logo-stacked.png"
                alt="Voice Alchemy Academy"
                width={160}
                height={39}
                className="object-contain"
                priority
              />
              <p className="text-gray-400 text-sm">Create your account</p>
            </div>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSignup} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 backdrop-blur-sm border border-red-400/30 text-red-300 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                I am a...
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-300 ${
                    role === 'student'
                      ? 'border-[#CEB466] bg-[#CEB466]/10 text-[#CEB466] shadow-lg shadow-[#CEB466]/10'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:bg-white/[0.08]'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${
                    role === 'student' ? 'bg-[#CEB466]/20' : 'bg-white/10'
                  }`}>
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <span className="font-medium">Student</span>
                  <span className="text-xs text-gray-500 mt-1">Learn from teachers</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('teacher')}
                  className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-300 ${
                    role === 'teacher'
                      ? 'border-[#CEB466] bg-[#CEB466]/10 text-[#CEB466] shadow-lg shadow-[#CEB466]/10'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:bg-white/[0.08]'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${
                    role === 'teacher' ? 'bg-[#CEB466]/20' : 'bg-white/10'
                  }`}>
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="font-medium">Teacher</span>
                  <span className="text-xs text-gray-500 mt-1">Teach students</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-300 mb-2">
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="block w-full px-4 py-3 glass-input rounded-xl"
                    placeholder="John"
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-300 mb-2">
                    Last name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="block w-full px-4 py-3 glass-input rounded-xl"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-4 py-3 glass-input rounded-xl"
                  placeholder="you@example.com"
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
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-3 glass-input rounded-xl"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full px-4 py-3 glass-input rounded-xl"
                  placeholder="Confirm your password"
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
                {loading ? 'Creating account...' : `Create ${role} account`}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>

            <p className="text-center text-sm text-gray-400">
              Already have an account?{' '}
              <Link href="/login" className="text-[#CEB466] hover:text-[#e0c97d] font-medium transition-colors duration-300">
                Sign in
              </Link>
            </p>
          </form>
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
