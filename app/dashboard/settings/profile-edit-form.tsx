'use client'

import { useState } from 'react'
import { Check, Loader2, X, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface ProfileEditFormProps {
  userId: string
  initialFirstName: string | null
  initialLastName: string | null
}

export default function ProfileEditForm({
  userId,
  initialFirstName,
  initialLastName,
}: ProfileEditFormProps) {
  const [firstName, setFirstName] = useState(initialFirstName || '')
  const [lastName, setLastName] = useState(initialLastName || '')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClient()

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        })
        .eq('id', userId)

      if (updateError) {
        throw updateError
      }

      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Update error:', err)
      setError('Failed to update profile. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setFirstName(initialFirstName || '')
    setLastName(initialLastName || '')
    setIsEditing(false)
    setError(null)
  }

  if (!isEditing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm text-gray-400 mb-1">First Name</label>
            <p className="text-white font-medium">
              {firstName || <span className="text-gray-500 italic">Not set</span>}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Last Name</label>
          <p className="text-white font-medium">
            {lastName || <span className="text-gray-500 italic">Not set</span>}
          </p>
        </div>

        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors mt-4"
        >
          <Pencil className="w-4 h-4" />
          Edit Name
        </button>

        {success && (
          <p className="text-green-400 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" />
            Profile updated successfully!
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">First Name</label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Enter your first name"
          className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          disabled={isSaving}
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Last Name</label>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Enter your last name"
          className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          disabled={isSaving}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save
            </>
          )}
        </button>

        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-gray-300 hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  )
}
