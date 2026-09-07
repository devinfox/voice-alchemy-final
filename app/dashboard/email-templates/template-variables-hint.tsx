'use client'

import { useState } from 'react'
import { Braces, Check } from 'lucide-react'
import { EMAIL_VARIABLES } from '@/lib/email-variables'

/**
 * Compact list of the placeholders a template can use. Clicking one copies it
 * so it can be pasted into a text block or the subject line.
 */
export function TemplateVariablesHint() {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(key)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      /* clipboard unavailable; nothing to do */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="flex items-center gap-1 text-gray-500">
        <Braces className="w-3.5 h-3.5" />
        Placeholders (click to copy):
      </span>
      {EMAIL_VARIABLES.map((group) => (
        <span key={group.name} className="flex flex-wrap items-center gap-1">
          <span className="text-gray-600">{group.name}</span>
          {group.variables.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => copy(v.key)}
              title={v.description}
              className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300 hover:text-yellow-400 hover:border-yellow-500/40 font-mono transition-colors"
            >
              {copied === v.key ? <Check className="w-3 h-3 inline text-green-400" /> : v.key}
            </button>
          ))}
        </span>
      ))}
    </div>
  )
}
