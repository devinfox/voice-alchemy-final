'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2 } from 'lucide-react'

type Status = 'pass' | 'warn' | 'fail'

interface Check {
  id: string
  label: string
  status: Status
  detail: string
  fix?: string
}

interface Report {
  checked_at: string
  domain: string
  checks: Check[]
  summary: { pass: number; warn: number; fail: number }
}

const STYLE: Record<Status, { icon: typeof CheckCircle2; color: string; ring: string }> = {
  pass: { icon: CheckCircle2, color: 'text-green-400', ring: 'border-green-500/20' },
  warn: { icon: AlertTriangle, color: 'text-amber-400', ring: 'border-amber-500/30' },
  fail: { icon: XCircle, color: 'text-red-400', ring: 'border-red-500/30' },
}

/** Live status of sending and receiving, from /api/email/health. */
export function EmailHealthPanel() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/email/health', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Health check failed')
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const headline = !report
    ? null
    : report.summary.fail > 0
    ? { text: `Sending is not working: ${report.summary.fail} blocking ${report.summary.fail === 1 ? 'issue' : 'issues'}`, color: 'text-red-400' }
    : report.summary.warn > 0
    ? { text: `Working, with ${report.summary.warn} ${report.summary.warn === 1 ? 'warning' : 'warnings'}`, color: 'text-amber-400' }
    : { text: 'Sending and receiving are fully connected', color: 'text-green-400' }

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-white">Email Health</h2>
            {headline ? (
              <p className={`text-sm ${headline.color}`}>{headline.text}</p>
            ) : (
              <p className="text-sm text-gray-400">Checking SendGrid, domain, inbound routing, and your mailbox…</p>
            )}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Re-check
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">{error}</div>
      )}

      {report && (
        <div className="space-y-2">
          {report.checks.map((check) => {
            const s = STYLE[check.status]
            const Icon = s.icon
            return (
              <div key={check.id} className={`flex items-start gap-3 p-3 rounded-lg border bg-white/[0.03] ${s.ring}`}>
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${s.color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{check.label}</p>
                  <p className="text-xs text-gray-400 break-words">{check.detail}</p>
                  {check.fix && check.status !== 'pass' && (
                    <p className="text-xs text-gray-300 mt-1">
                      <span className="text-gray-500">Fix:</span> {check.fix}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          <p className="text-xs text-gray-600 pt-1">
            Checked {new Date(report.checked_at).toLocaleTimeString()} for {report.domain}
          </p>
        </div>
      )}
    </div>
  )
}
