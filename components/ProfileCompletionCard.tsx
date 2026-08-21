'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, UserRound } from 'lucide-react'

export default function ProfileCompletionCard() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name')
      return
    }

    setLoading(true)

    const response = await fetch('/api/profile/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ firstName, lastName }),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(result.error || 'Could not save your profile')
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
    router.refresh()
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[#CEB466]/35 bg-[#CEB466]/10 px-5 py-4 text-sm text-[#CEB466]">
        <div className="flex items-center gap-2 font-semibold">
          <Check className="h-4 w-4" />
          Profile saved
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#CEB466]/30 bg-[#CEB466]/10 p-5"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#CEB466]/20 text-[#CEB466]">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Finish your profile</h2>
          <p className="text-sm text-gray-400">Add your name so teachers and students know who you are.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="text"
          autoComplete="given-name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className="glass-input rounded-xl px-4 py-3"
          placeholder="First name"
        />
        <input
          type="text"
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          className="glass-input rounded-xl px-4 py-3"
          placeholder="Last name"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl px-5 py-3 text-sm font-bold text-[#171229] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #e0c97d 0%, #CEB466 45%, #9c8644 100%)' }}
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}
