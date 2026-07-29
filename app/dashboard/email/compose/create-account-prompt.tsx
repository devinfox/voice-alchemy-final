'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Loader2, CheckCircle } from 'lucide-react'

interface Props {
  sharedDomain: {
    id: string
    domain: string
    verification_status: string
  }
  userName: string
}

export function CreateEmailAccountPrompt({ sharedDomain, userName }: Props) {
  const router = useRouter()
  const [username, setUsername] = useState(() => {
    // Suggest username based on user's name (e.g., "John Doe" -> "john.doe")
    if (userName) {
      return userName.toLowerCase().replace(/\s+/g, '.')
    }
    return ''
  })
  const [displayName, setDisplayName] = useState(userName)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Validate username format
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
          domain_id: sharedDomain.id,
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

      // Refresh the page to show the compose form
      setTimeout(() => {
        router.refresh()
      }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="glass-card p-8 rounded-2xl max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl font-light text-white mb-2">Email Account Created!</h2>
        <p className="text-gray-400">
          Your email address <span className="text-white">{username}@{sharedDomain.domain}</span> is ready.
        </p>
        <p className="text-gray-500 text-sm mt-4">Redirecting to compose...</p>
      </div>
    )
  }

  return (
    <div className="glass-card p-8 rounded-2xl max-w-md w-full">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-xl font-light text-white mb-2">Create Your Email Address</h2>
        <p className="text-gray-400 text-sm">
          Choose a username for your email account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Email Username</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="yourname"
              className="flex-1 px-4 py-3 glass-input rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-amber-500/50 outline-none"
              disabled={isLoading}
              autoFocus
            />
            <span className="text-gray-400 text-sm">@{sharedDomain.domain}</span>
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
            disabled={isLoading}
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
          disabled={isLoading || !username}
          className="w-full py-3 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
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

      <p className="text-center text-gray-500 text-xs mt-6">
        Your email will be ready to send immediately after creation
      </p>
    </div>
  )
}
