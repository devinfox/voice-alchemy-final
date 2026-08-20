'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ProfileRole } from '@/types/database.types'
import { GraduationCap, Mail, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}

function SignupForm() {
  const searchParams = useSearchParams()
  const initialRole: ProfileRole = searchParams.get('role') === 'teacher' ? 'teacher' : 'student'

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<ProfileRole>(initialRole)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required name fields
    if (!firstName.trim()) {
      setError('First name is required')
      return
    }

    if (!lastName.trim()) {
      setError('Last name is required')
      return
    }

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
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
  }

  const handleGoogleSignup = async () => {
    setError(null)
    setGoogleLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?role=${role}`,
      },
    })

    // On success the browser redirects to Google; only errors land here
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
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
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[#CEB466]/30">
              <Mail className="w-8 h-8 text-[#171229]" />
            </div>
            <h2 className="text-2xl font-semibold text-[#CEB466] mb-3">
              Check your email for confirmation!
            </h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
              Open that email and click the link to activate your Voice Alchemy Academy account.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mt-4">
              Once confirmed, you&apos;ll be able to sign in and continue your vocal journey.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <a
                href="https://mail.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 rounded-xl bg-white/[0.08] border border-white/10 text-sm font-semibold text-white hover:border-[#CEB466]/40 hover:text-[#CEB466] transition-colors"
              >
                Open Gmail
              </a>
              <a
                href="https://outlook.live.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 rounded-xl bg-white/[0.08] border border-white/10 text-sm font-semibold text-white hover:border-[#CEB466]/40 hover:text-[#CEB466] transition-colors"
              >
                Open Outlook
              </a>
            </div>

            <Link
              href="/login"
              className="mt-6 block w-full py-3 px-4 rounded-xl text-sm font-bold text-[#171229] transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, #e0c97d 0%, #CEB466 30%, #b59d52 60%, #9c8644 100%)',
                boxShadow: '0 10px 40px rgba(206, 180, 102, 0.25), 0 4px 12px rgba(0,0,0,0.1)',
              }}
            >
              Back to Sign In
            </Link>

            <p className="text-xs text-gray-500 mt-5">
              Don&apos;t see it? Check your spam or promotions folder.
            </p>
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
              <p className="text-gray-400 text-sm">Create your Voice Alchemy account</p>
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
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-300">
                  Creating a {role === 'student' ? 'Student' : 'Teacher'} account
                </label>
                <Link href="/" className="text-xs font-medium text-[#CEB466] hover:text-[#e0c97d] transition-colors">
                  Change
                </Link>
              </div>
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
                {loading ? 'Creating account...' : 'Create my account'}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>


            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-gray-500 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={googleLoading}
              className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/15 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              {googleLoading ? 'Connecting to Google...' : `Continue with Google as ${role === 'teacher' ? 'Teacher' : 'Student'}`}
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
