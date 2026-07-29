'use client'

import { useState } from 'react'
import {
  Mail,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Star,
  Edit2,
  Save,
  X,
  AlertTriangle,
} from 'lucide-react'
import { EmailAccount, EmailDomain } from '@/types/email.types'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AccountsListProps {
  accounts: (EmailAccount & { domain: Pick<EmailDomain, 'id' | 'domain' | 'verification_status'> | null })[]
  domains: Pick<EmailDomain, 'id' | 'domain' | 'verification_status'>[]
  userId: string
}

export function AccountsList({ accounts, domains, userId }: AccountsListProps) {
  const router = useRouter()
  const [showAddAccount, setShowAddAccount] = useState(accounts.length === 0)
  const [selectedDomainId, setSelectedDomainId] = useState<string>(domains[0]?.id || '')
  const [localPart, setLocalPart] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')

  const verifiedDomains = domains.filter(d => d.verification_status === 'verified')
  const selectedDomain = domains.find(d => d.id === selectedDomainId)

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const emailLocalPart = localPart.trim().toLowerCase()

    if (!emailLocalPart) {
      setError('Please enter an email address')
      return
    }

    if (!selectedDomainId) {
      setError('Please select a domain')
      return
    }

    // Validate local part
    const localPartRegex = /^[a-zA-Z0-9._%+-]+$/
    if (!localPartRegex.test(emailLocalPart)) {
      setError('Invalid email format. Use only letters, numbers, and ._%+-')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain_id: selectedDomainId,
          email_address: emailLocalPart,
          display_name: displayName.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account')
      }

      setLocalPart('')
      setDisplayName('')
      setShowAddAccount(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    }

    setLoading(false)
  }

  const handleSetDefault = async (accountId: string) => {
    try {
      const response = await fetch(`/api/email/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to set default')
      }

      router.refresh()
    } catch (err) {
      console.error('Set default error:', err)
    }
  }

  const handleUpdateDisplayName = async (accountId: string) => {
    try {
      const response = await fetch(`/api/email/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editDisplayName }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update')
      }

      setEditingId(null)
      router.refresh()
    } catch (err) {
      console.error('Update error:', err)
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this email account?')) {
      return
    }

    try {
      const response = await fetch(`/api/email/accounts/${accountId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete account')
      }

      router.refresh()
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const startEditing = (account: EmailAccount) => {
    setEditingId(account.id)
    setEditDisplayName(account.display_name || '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditDisplayName('')
  }

  if (domains.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <Mail className="w-12 h-12 mx-auto text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No Domains Connected</h3>
        <p className="text-gray-400 mb-6">
          You need to connect a domain before you can create email accounts.
        </p>
        <Link
          href="/dashboard/email/settings/domains"
          className="inline-flex items-center gap-2 px-6 py-3 glass-button-gold rounded-xl text-sm font-medium"
        >
          <Plus className="w-5 h-5" />
          Add Your Domain
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Warning for unverified domains */}
      {verifiedDomains.length === 0 && domains.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Domain Verification Required</p>
            <p className="text-sm text-yellow-400/80 mt-1">
              Your domains are not yet verified. You can create email accounts, but you won&apos;t be able to send emails until DNS verification is complete.
            </p>
            <Link
              href="/dashboard/email/settings/domains"
              className="text-sm text-yellow-400 underline mt-2 inline-block"
            >
              Verify your domains
            </Link>
          </div>
        </div>
      )}

      {/* Add Account Form */}
      {showAddAccount ? (
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-white mb-4">Create Email Account</h3>

          <form onSubmit={handleAddAccount} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Email Address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localPart}
                  onChange={(e) => setLocalPart(e.target.value)}
                  placeholder="sales"
                  className="glass-input flex-1 px-4 py-3"
                  disabled={loading}
                />
                <span className="flex items-center text-gray-400 text-lg">@</span>
                <select
                  value={selectedDomainId}
                  onChange={(e) => setSelectedDomainId(e.target.value)}
                  className="glass-input px-4 py-3"
                  disabled={loading}
                >
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.domain}
                      {domain.verification_status !== 'verified' && ' (unverified)'}
                    </option>
                  ))}
                </select>
              </div>
              {selectedDomain && selectedDomain.verification_status !== 'verified' && (
                <p className="text-xs text-yellow-400 mt-2">
                  This domain is not yet verified. Emails cannot be sent until verification is complete.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Display Name (optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Sales Team"
                className="glass-input w-full px-4 py-3"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-2">
                This name will appear as the sender name in emails
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Account'}
              </button>
              {accounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddAccount(false)}
                  className="px-6 py-2.5 glass-button rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setShowAddAccount(true)}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 glass-card hover:bg-white/5 rounded-xl transition-colors"
        >
          <Plus className="w-5 h-5 text-yellow-400" />
          <span className="text-white font-medium">Create Email Account</span>
        </button>
      )}

      {/* Accounts List */}
      {accounts.map((account) => (
        <div key={account.id} className="glass-card p-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-yellow-400" />
            </div>

            <div className="flex-1 min-w-0">
              {editingId === account.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="glass-input px-3 py-1 text-sm flex-1"
                    placeholder="Display name"
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdateDisplayName(account.id)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-green-400"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-medium truncate">
                      {account.display_name || account.email_address.split('@')[0]}
                    </h4>
                    {account.is_primary && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 truncate">{account.email_address}</p>
                </>
              )}
            </div>

            {/* Domain Status */}
            {account.domain && (
              <div className="flex-shrink-0">
                {account.domain.verification_status === 'verified' ? (
                  <span className="flex items-center gap-1 text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Active
                  </span>
                ) : account.domain.verification_status === 'verifying' ? (
                  <span className="flex items-center gap-1 text-yellow-400 text-sm">
                    <Clock className="w-4 h-4" />
                    Verifying
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-gray-400 text-sm">
                    <Clock className="w-4 h-4" />
                    Pending
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {!account.is_primary && (
                <button
                  onClick={() => handleSetDefault(account.id)}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-yellow-400 transition-colors"
                  title="Set as default"
                >
                  <Star className="w-5 h-5" />
                </button>
              )}
              {editingId !== account.id && (
                <button
                  onClick={() => startEditing(account)}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Edit display name"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => handleDeleteAccount(account.id)}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                title="Delete account"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Help Section */}
      <div className="glass-card-subtle p-6">
        <h4 className="text-white font-medium mb-3">Email Account Tips</h4>
        <ul className="space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
            <span>Create separate accounts for different purposes (sales@, support@, info@)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
            <span>The default account will be pre-selected when composing new emails</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
            <span>Display names help recipients identify who the email is from</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
