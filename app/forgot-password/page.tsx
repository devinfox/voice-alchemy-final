'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

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
            </div>
          </div>

          {success ? (
            /* Success State */
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Check your email</h2>
              <p className="text-gray-400 text-sm">
                We&apos;ve sent a password reset link to <span className="text-white font-medium">{email}</span>
              </p>
              <p className="text-gray-500 text-xs">
                Didn&apos;t receive the email? Check your spam folder or try again.
              </p>
              <div className="pt-4 space-y-3">
                <button
                  onClick={() => setSuccess(false)}
                  className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition-colors"
                >
                  Try a different email
                </button>
                <Link
                  href="/login"
                  className="block w-full py-3 px-4 rounded-xl text-sm font-medium text-[#171229] text-center transition-all duration-300"
                  style={{
                    background: 'linear-gradient(135deg, #e0c97d 0%, #CEB466 30%, #b59d52 60%, #9c8644 100%)',
                  }}
                >
                  Back to Login
                </Link>
              </div>
            </div>
          ) : (
            /* Form State */
            <>
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white mb-2">Forgot your password?</h2>
                <p className="text-gray-400 text-sm">
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="bg-red-500/10 backdrop-blur-sm border border-red-400/30 text-red-300 px-4 py-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-12 pr-4 py-3.5 glass-input rounded-xl"
                      placeholder="you@company.com"
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
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 text-gray-400 hover:text-[#CEB466] transition-colors duration-300 text-sm pt-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </Link>
              </form>
            </>
          )}

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
