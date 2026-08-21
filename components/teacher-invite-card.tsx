'use client'

import { useState } from 'react'
import { Copy, Check, Share2, Sparkles, UserPlus } from 'lucide-react'

interface TeacherInviteCardProps {
  teacherId: string
  teacherName?: string | null
}

export function TeacherInviteCard({ teacherId, teacherName }: TeacherInviteCardProps) {
  const [copied, setCopied] = useState(false)

  // Construct invite link
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const inviteUrl = `${origin}/signup?role=student&teacher=${encodeURIComponent(teacherId)}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div className="glass-card-gold rounded-2xl p-6 border border-[#CEB466]/40 relative overflow-hidden">
      {/* Background glow orb */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#CEB466]/15 to-transparent rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/20 border border-[#CEB466]/40 text-[#CEB466] text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Your Private Studio Invite Link
          </div>
          <h2 className="text-xl font-bold text-white">
            Onboard Your Students in One Click
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Share this link via SMS, email, or social media. New students will automatically link to your studio and private video classroom.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="px-4 py-3 bg-black/40 rounded-xl border border-white/15 text-xs text-gray-300 font-mono select-all truncate max-w-xs lg:max-w-sm">
            {inviteUrl || `/signup?role=student&teacher=${teacherId}`}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-[#171229] transition-all duration-300 shadow-lg shadow-[#CEB466]/25 hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #e0c97d 0%, #CEB466 30%, #b59d52 60%, #9c8644 100%)',
            }}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#171229]" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#171229]" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
