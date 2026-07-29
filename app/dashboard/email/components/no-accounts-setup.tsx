'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Globe, ArrowRight, Loader2, CheckCircle } from 'lucide-react'

interface SharedDomain {
  id: string
  domain: string
  verification_status: string
}

export function NoAccountsSetup() {
  const router = useRouter()
  const [sharedDomain, setSharedDomain] = useState<SharedDomain | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Check for shared domain
    fetch('/api/email/shared-domain')
      .then(res => res.json())
      .then(data => {
        if (data.domain && data.domain.verification_status === 'verified') {
          setSharedDomain(data.domain)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsCreating(true)

    try {
      const usernameRegex = /^[a-zA-Z0-9._%+-]+$/
      if (!usernameRegex.test(username)) {
        throw new Error('Username can only contain letters, numbers, and . _ % + -')
      }

      if (username.length < 2) {
        throw new Error('Username must be at least 2 characters')
      }

      const res = await fetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain_id: sharedDomain!.id,
          email_address: username,
          display_name: displayName || username,
          is_primary: true
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create email account')
      }

      setSuccess(true)
      setTimeout(() => router.refresh(), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    )
  }

  // If there's a shared domain, show simple username creation
  if (sharedDomain) {
    if (success) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="glass-card p-8 rounded-2xl max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-light text-white mb-2">Email Account Created!</h2>
            <p className="text-gray-400">
              Your email address <span className="text-white">{username}@{sharedDomain.domain}</span> is ready.
            </p>
            <p className="text-gray-500 text-sm mt-4">Loading your inbox...</p>
          </div>
        </div>
      )
    }

    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="glass-card p-8 rounded-2xl max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-light text-white mb-2">Create Your Email Address</h2>
            <p className="text-gray-400 text-sm">
              Choose a username for your company email
            </p>
          </div>

          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Email Username</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="yourname"
                  className="flex-1 px-4 py-3 glass-input rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-amber-500/50 outline-none"
                  disabled={isCreating}
                  autoFocus
                />
                <span className="text-gray-400 text-sm whitespace-nowrap">@{sharedDomain.domain}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Letters, numbers, and . _ % + - allowed
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your Name"
                className="w-full px-4 py-3 glass-input rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-amber-500/50 outline-none"
                disabled={isCreating}
              />
              <p className="text-xs text-gray-500 mt-1">
                This name will appear in sent emails
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isCreating || !username}
              className="w-full py-3 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Create Email Account
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // No shared domain - show the original domain setup instructions
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-yellow-400/20 to-yellow-600/20 flex items-center justify-center">
          <Mail className="w-10 h-10 text-yellow-400" />
        </div>

        <h2 className="text-2xl font-light text-white mb-3">
          Set Up Your Email
        </h2>

        <p className="text-gray-400 mb-8 leading-relaxed">
          Connect your domain to start sending and receiving emails directly within the CRM.
          You'll be able to manage all your business communications in one place.
        </p>

        <div className="glass-card p-6 mb-6 text-left">
          <h3 className="text-lg font-medium text-white mb-4">How it works</h3>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium text-yellow-400">1</span>
              </div>
              <div>
                <p className="text-white font-medium">Add your domain</p>
                <p className="text-sm text-gray-400">Enter your business domain (e.g., company.com)</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium text-yellow-400">2</span>
              </div>
              <div>
                <p className="text-white font-medium">Configure DNS records</p>
                <p className="text-sm text-gray-400">Add the required DNS records to your domain provider</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium text-yellow-400">3</span>
              </div>
              <div>
                <p className="text-white font-medium">Create email accounts</p>
                <p className="text-sm text-gray-400">Set up email addresses for your team</p>
              </div>
            </li>
          </ul>
        </div>

        <Link
          href="/dashboard/email/settings/domains"
          className="inline-flex items-center gap-2 px-6 py-3 glass-button-gold rounded-xl text-sm font-medium"
        >
          <Globe className="w-5 h-5" />
          Add Your Domain
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
