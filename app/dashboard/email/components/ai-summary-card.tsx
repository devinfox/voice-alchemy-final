'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Copy, Check, RefreshCw } from 'lucide-react'
import { NIMBUS_ANALYSIS_ENABLED } from '@/lib/nimbus/config'

interface AiSummaryCardProps {
  threadId: string
  summary?: string | null
  sentiment?: string | null
  actionItems?: string[] | null
  onRefresh?: () => void
}

export function AiSummaryCard({
  threadId,
  summary,
  sentiment,
  actionItems,
  onRefresh,
}: AiSummaryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  if (!summary && !sentiment && (!actionItems || actionItems.length === 0)) {
    return null
  }

  const handleCopy = async () => {
    const textToCopy = [
      summary,
      sentiment ? `Sentiment: ${sentiment}` : null,
      actionItems?.length ? `Action Items:\n${actionItems.map(a => `- ${a}`).join('\n')}` : null,
    ].filter(Boolean).join('\n\n')

    await navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRefresh = async () => {
    if (!NIMBUS_ANALYSIS_ENABLED || refreshing) return
    setRefreshing(true)

    try {
      const response = await fetch(`/api/email/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      })

      if (response.ok) {
        onRefresh?.()
      }
    } catch (error) {
      console.error('Error refreshing analysis:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const getSentimentColor = (s: string | null) => {
    switch (s?.toLowerCase()) {
      case 'positive':
        return 'text-green-400 bg-green-500/10'
      case 'negative':
        return 'text-red-400 bg-red-500/10'
      case 'neutral':
        return 'text-gray-400 bg-gray-500/10'
      default:
        return 'text-gray-400 bg-gray-500/10'
    }
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.08) 0%, rgba(59, 130, 246, 0.05) 50%, rgba(236, 72, 153, 0.03) 100%)',
        border: '1px solid rgba(147, 51, 234, 0.15)',
        boxShadow: expanded
          ? '0 8px 32px rgba(147, 51, 234, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      {/* Subtle glow overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 pointer-events-none" />

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="relative w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-all duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">AI Summary</span>
          {sentiment && (
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${getSentimentColor(sentiment)}`}>
              {sentiment}
            </span>
          )}
        </div>
        <div className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="relative px-4 pb-4 space-y-4">
          {/* Summary */}
          {summary && (
            <p className="text-sm text-gray-300 leading-relaxed pl-[52px]">
              {summary}
            </p>
          )}

          {/* Action Items */}
          {actionItems && actionItems.length > 0 && (
            <div className="space-y-2 pl-[52px]">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Action Items</span>
              <ul className="space-y-1.5">
                {actionItems.map((item, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3 pl-[52px] border-t border-white/[0.06]">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] rounded-lg transition-all duration-200"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
            {NIMBUS_ANALYSIS_ENABLED && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] rounded-lg transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Analyzing...' : 'Refresh'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
