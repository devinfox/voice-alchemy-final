'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import type { ChatMessage } from '@/lib/recital/protocol'

interface ChatPanelProps {
  messages: ChatMessage[]
  meId: string
  onSend: (text: string) => void
}

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Community chat beside the stage. Warm, simple, no threads. */
export function ChatPanel({ messages, meId, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
    stickToBottom.current = true
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 text-gray-500">
            <div className="w-11 h-11 rounded-2xl bg-[#CEB466]/10 border border-[#CEB466]/20 flex items-center justify-center mb-3">
              <MessageCircle className="w-5 h-5 text-[#CEB466]" />
            </div>
            <p className="text-sm text-gray-300 font-medium">Say hello to everyone</p>
            <p className="text-xs mt-1">Cheer on the performers and share the moment.</p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.from === meId
          const host = m.senderRole === 'host'
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="flex items-baseline gap-1.5 px-1 mb-0.5">
                <span className={`text-[11px] font-semibold ${host ? 'text-[#CEB466]' : 'text-gray-300'}`}>
                  {mine ? 'You' : m.senderName}
                  {host && !mine && <span className="ml-1 text-[9px] uppercase tracking-wider text-[#CEB466]/80">Host</span>}
                </span>
                <span className="text-[10px] text-gray-500">{timeLabel(m.at)}</span>
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words ${
                  mine
                    ? 'bg-[#CEB466]/20 border border-[#CEB466]/30 text-white rounded-br-md'
                    : host
                    ? 'bg-[#CEB466]/10 border border-[#CEB466]/20 text-gray-100 rounded-bl-md'
                    : 'bg-white/[0.06] border border-white/10 text-gray-100 rounded-bl-md'
                }`}
              >
                {m.text}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            maxLength={500}
            placeholder="Send a message…"
            className="flex-1 px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#CEB466]/50"
            aria-label="Chat message"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className="p-2 bg-[#CEB466] hover:bg-[#e0c97d] disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            aria-label="Send"
          >
            <Send className="w-5 h-5 text-[#171229]" />
          </button>
        </div>
      </div>
    </div>
  )
}
