'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Check, AlertCircle } from 'lucide-react'

interface StarterStatus {
  funnels: { trigger_key: string; name: string; phases: number; installed: { id: string } | null }[]
  templates: { key: string; name: string; manual: boolean; installed: { id: string } | null }[]
}

interface StarterPackPanelProps {
  tab: 'emails' | 'funnels'
}

/**
 * One card that installs the academy campaign (funnels and their emails).
 * Disappears once everything is installed.
 */
export function StarterPackPanel({ tab }: StarterPackPanelProps) {
  const router = useRouter()
  const [status, setStatus] = useState<StarterStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'campaign' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/email-funnels/starter', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) {
        setStatusError(result.hint || result.error || 'Could not check the standard campaign')
        return
      }
      setStatus(result.data)
    } catch {
      setStatusError('Could not check the standard campaign')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const installCampaign = async () => {
    setBusy('campaign')
    setError(null)
    try {
      const response = await fetch('/api/email-funnels/starter', { method: 'POST' })
      const result = await response.json()
      if (!response.ok || result.errors?.length) {
        throw new Error(result.hint || result.error || (result.errors || []).join('; ') || 'Install failed')
      }
      await load()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setBusy(null)
    }
  }

  const missingFunnels = status ? status.funnels.filter((f) => !f.installed).length : 0
  const missingTemplates = status ? status.templates.filter((t) => !t.installed).length : 0
  const campaignMissing = missingFunnels > 0 || missingTemplates > 0

  if (!statusError && status && !campaignMissing) return null
  if (!status && !statusError) return null

  const totalFunnels = status?.funnels.length || 0
  const totalTemplates = status?.templates.length || 0

  return (
    <div className="glass-card p-4 border border-yellow-500/20 bg-yellow-500/5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400 flex-shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Standard academy emails &amp; funnels</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {statusError
              ? statusError
              : tab === 'funnels'
              ? `${totalFunnels} ready-made funnels (new students, website leads, teacher demos, mentorship applications) and the ${totalTemplates} emails they send. Add them once, then edit anything you like.`
              : `The ${totalTemplates} campaign emails used by the standard funnels. Add them once, then edit anything you like.`}
          </p>
          {error && (
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {!statusError && campaignMissing && (
              <button
                onClick={installCampaign}
                disabled={busy !== null}
                className="flex items-center gap-2 px-3 py-1.5 glass-button-gold rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {busy === 'campaign' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {missingFunnels === 0
                  ? `Add ${missingTemplates} missing ${missingTemplates === 1 ? 'email' : 'emails'}`
                  : `Add ${missingFunnels} ${missingFunnels === 1 ? 'funnel' : 'funnels'} + ${missingTemplates} emails`}
              </button>
            )}
            {!statusError && !campaignMissing && status && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <Check className="w-3.5 h-3.5" />
                Campaign installed
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
