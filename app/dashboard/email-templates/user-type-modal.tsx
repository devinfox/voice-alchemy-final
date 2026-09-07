'use client'

import { useState } from 'react'
import { X, Loader2, Users } from 'lucide-react'
import type { EmailAudience } from '@/lib/email-audiences'

interface UserTypeModalProps {
  /** When set, edits this type instead of creating one */
  audience?: EmailAudience | null
  onClose: () => void
  onSaved: (audience: EmailAudience) => void
}

/** Create or rename a user type (audience). */
export function UserTypeModal({ audience = null, onClose, onSaved }: UserTypeModalProps) {
  const [name, setName] = useState(audience?.name || '')
  const [description, setDescription] = useState(audience?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) {
      setError('Give the user type a name')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(audience ? `/api/email-audiences/${audience.id}` : '/api/email-audiences', {
        method: audience ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.hint || result.error || 'Could not save')
        return
      }
      onSaved(result.data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-card modal-solid rounded-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-yellow-400" />
            </div>
            <h2 className="text-lg font-bold text-white">{audience ? 'Rename user type' : 'New user type'}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="e.g., Alumni, Group class students, Parents"
              className="glass-input w-full px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Who is this? <span className="text-gray-500 font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line so the team knows who belongs here."
              className="glass-input w-full px-4 py-2 h-20 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="px-5 py-2 glass-button-gold rounded-lg font-medium disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {audience ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
