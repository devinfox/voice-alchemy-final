'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface RecipientInputProps {
  label: string
  recipients: string[]
  onRecipientsChange: (recipients: string[]) => void
  placeholder?: string
  showToggleButtons?: boolean
  onShowCc?: () => void
  onShowBcc?: () => void
  hideCc?: boolean
  hideBcc?: boolean
}

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RecipientInput({
  label,
  recipients,
  onRecipientsChange,
  placeholder = '',
  showToggleButtons = false,
  onShowCc,
  onShowBcc,
  hideCc = true,
  hideBcc = true,
}: RecipientInputProps) {
  const [inputValue, setInputValue] = useState('')

  const addRecipient = (email: string) => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!emailRegex.test(trimmedEmail)) return false

    if (!recipients.includes(trimmedEmail)) {
      onRecipientsChange([...recipients, trimmedEmail])
      setInputValue('')
    }
    return true
  }

  const removeRecipient = (email: string) => {
    onRecipientsChange(recipients.filter(e => e !== email))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      if (inputValue) addRecipient(inputValue)
    }
    if (e.key === 'Backspace' && !inputValue) {
      if (recipients.length > 0) {
        onRecipientsChange(recipients.slice(0, -1))
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const emails = text.split(/[,;\s]+/).filter(Boolean)
    const newRecipients = [...recipients]
    emails.forEach(email => {
      const trimmed = email.trim().toLowerCase()
      if (emailRegex.test(trimmed) && !newRecipients.includes(trimmed)) {
        newRecipients.push(trimmed)
      }
    })
    onRecipientsChange(newRecipients)
  }

  return (
    <div className="flex items-start gap-2 px-4 py-2 border-b border-white/10">
      <label className="text-sm text-gray-400 w-14 pt-1">{label}</label>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {recipients.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded text-sm text-white"
          >
            {email}
            <button
              onClick={() => removeRecipient(email)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => inputValue && addRecipient(inputValue)}
          className="flex-1 min-w-[150px] bg-transparent text-white text-sm outline-none"
          placeholder={recipients.length === 0 ? placeholder : ''}
        />
      </div>
      {showToggleButtons && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {hideCc && onShowCc && (
            <button onClick={onShowCc} className="hover:text-white">
              Cc
            </button>
          )}
          {hideBcc && onShowBcc && (
            <button onClick={onShowBcc} className="hover:text-white">
              Bcc
            </button>
          )}
        </div>
      )}
    </div>
  )
}
