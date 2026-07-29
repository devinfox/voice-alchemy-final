'use client'

import { useState } from 'react'
import {
  Globe,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { EmailDomain, DNSRecord } from '@/types/email.types'
import { useRouter } from 'next/navigation'
import { isValidDomain } from '@/lib/email-utils'

interface DomainsListProps {
  domains: EmailDomain[]
  userId: string
}

export function DomainsList({ domains, userId }: DomainsListProps) {
  const router = useRouter()
  const [showAddDomain, setShowAddDomain] = useState(domains.length === 0)
  const [newDomain, setNewDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set(domains.filter(d => d.verification_status !== 'verified').map(d => d.id))
  )
  const [verifyingDomains, setVerifyingDomains] = useState<Set<string>>(new Set())

  const toggleExpanded = (domainId: string) => {
    const newExpanded = new Set(expandedDomains)
    if (newExpanded.has(domainId)) {
      newExpanded.delete(domainId)
    } else {
      newExpanded.add(domainId)
    }
    setExpandedDomains(newExpanded)
  }

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const domain = newDomain.trim().toLowerCase()

    if (!domain) {
      setError('Please enter a domain')
      return
    }

    if (!isValidDomain(domain)) {
      setError('Please enter a valid domain (e.g., company.com)')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add domain')
      }

      setNewDomain('')
      setShowAddDomain(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    }

    setLoading(false)
  }

  const handleVerifyDomain = async (domainId: string) => {
    setVerifyingDomains(prev => new Set(prev).add(domainId))

    try {
      const response = await fetch(`/api/email/domains/${domainId}/verify`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Verification failed')
      }

      router.refresh()
    } catch (err) {
      console.error('Verification error:', err)
    }

    setVerifyingDomains(prev => {
      const newSet = new Set(prev)
      newSet.delete(domainId)
      return newSet
    })
  }

  const handleDeleteDomain = async (domainId: string) => {
    if (!confirm('Are you sure you want to delete this domain? This will also delete all associated email accounts.')) {
      return
    }

    try {
      const response = await fetch(`/api/email/domains/${domainId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete domain')
      }

      router.refresh()
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getStatusBadge = (status: EmailDomain['verification_status']) => {
    switch (status) {
      case 'verified':
        return (
          <span className="flex items-center gap-1.5 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            Verified
          </span>
        )
      case 'verifying':
        return (
          <span className="flex items-center gap-1.5 text-yellow-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Verifying
          </span>
        )
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 text-red-400 text-sm">
            <XCircle className="w-4 h-4" />
            Failed
          </span>
        )
      default:
        return (
          <span className="flex items-center gap-1.5 text-gray-400 text-sm">
            <Clock className="w-4 h-4" />
            Pending
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Domain Form */}
      {showAddDomain ? (
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-white mb-4">Add a New Domain</h3>

          <form onSubmit={handleAddDomain} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Domain Name
              </label>
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="company.com"
                className="glass-input w-full px-4 py-3 text-lg"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-2">
                Enter your domain without http:// or www
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Domain'}
              </button>
              {domains.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddDomain(false)}
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
          onClick={() => setShowAddDomain(true)}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 glass-card hover:bg-white/5 rounded-xl transition-colors"
        >
          <Plus className="w-5 h-5 text-yellow-400" />
          <span className="text-white font-medium">Add Domain</span>
        </button>
      )}

      {/* Domains List */}
      {domains.map((domain) => (
        <div key={domain.id} className="glass-card overflow-hidden">
          {/* Domain Header */}
          <div
            className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => toggleExpanded(domain.id)}
          >
            <button className="text-gray-400">
              {expandedDomains.has(domain.id) ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>

            <Globe className="w-5 h-5 text-yellow-400" />

            <div className="flex-1">
              <h4 className="text-white font-medium">{domain.domain}</h4>
              <p className="text-sm text-gray-400">
                Added {new Date(domain.created_at).toLocaleDateString()}
              </p>
            </div>

            {getStatusBadge(domain.verification_status)}

            <div className="flex items-center gap-2">
              {domain.verification_status !== 'verified' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleVerifyDomain(domain.id)
                  }}
                  disabled={verifyingDomains.has(domain.id)}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-yellow-400 transition-colors"
                  title="Verify DNS"
                >
                  <RefreshCw className={`w-5 h-5 ${verifyingDomains.has(domain.id) ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteDomain(domain.id)
                }}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                title="Delete domain"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* DNS Records */}
          {expandedDomains.has(domain.id) && (
            <div className="px-4 pb-4 border-t border-white/10">
              <div className="pt-4">
                <h5 className="text-sm font-medium text-white mb-3">DNS Records</h5>
                <p className="text-sm text-gray-400 mb-4">
                  Add these DNS records to your domain provider (Squarespace, GoDaddy, Cloudflare, etc.)
                </p>

                <div className="space-y-3">
                  {(domain.dns_records as DNSRecord[])?.map((record, index) => (
                    <div key={index} className="bg-white/5 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded uppercase">
                          {record.type}
                        </span>
                        {record.verified ? (
                          <span className="flex items-center gap-1 text-green-400 text-xs">
                            <CheckCircle className="w-3 h-3" />
                            Verified
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-500 text-xs">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <label className="text-gray-500 text-xs uppercase block mb-1">Host / Name</label>
                          <div className="flex items-center gap-2">
                            <code className="text-white bg-black/30 px-2 py-1 rounded text-xs flex-1 truncate">
                              {record.host}
                            </code>
                            <button
                              onClick={() => copyToClipboard(record.host)}
                              className="p-1 text-gray-400 hover:text-yellow-400"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-gray-500 text-xs uppercase block mb-1">
                            Value {record.priority !== undefined && `(Priority: ${record.priority})`}
                          </label>
                          <div className="flex items-center gap-2">
                            <code className="text-white bg-black/30 px-2 py-1 rounded text-xs flex-1 truncate">
                              {record.value}
                            </code>
                            <button
                              onClick={() => copyToClipboard(record.value)}
                              className="p-1 text-gray-400 hover:text-yellow-400"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {domain.verification_status !== 'verified' && (
                  <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-sm text-yellow-400">
                      <strong>Note:</strong> DNS changes can take up to 48 hours to propagate.
                      We'll automatically check every few minutes.
                    </p>
                  </div>
                )}

                {domain.verification_error && (
                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm text-red-400">
                      <strong>Error:</strong> {domain.verification_error}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Help Section */}
      <div className="glass-card-subtle p-6">
        <h4 className="text-white font-medium mb-3">Need Help?</h4>
        <p className="text-sm text-gray-400 mb-4">
          Here are guides for popular domain providers:
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Squarespace', url: 'https://support.squarespace.com/hc/en-us/articles/360002101888' },
            { name: 'GoDaddy', url: 'https://www.godaddy.com/help/manage-dns-records-680' },
            { name: 'Cloudflare', url: 'https://developers.cloudflare.com/dns/manage-dns-records/' },
            { name: 'Namecheap', url: 'https://www.namecheap.com/support/knowledgebase/article.aspx/767' },
          ].map((provider) => (
            <a
              key={provider.name}
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 glass-button rounded-lg text-sm"
            >
              {provider.name}
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
