'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Upload, X, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface GladiatorAvatarUploadProps {
  userId: string
  currentAvatar: string | null
}

// Default avatars that can be randomly assigned
const DEFAULT_AVATARS = ['/guy-1.png', '/guy-2.png', '/guy-3.png']

export default function GladiatorAvatarUpload({ userId, currentAvatar }: GladiatorAvatarUploadProps) {
  const [avatar, setAvatar] = useState<string | null>(currentAvatar)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB')
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClient()

      // Upload to storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${userId}/gladiator-avatar.${fileExt}`

      // Delete old avatar if exists
      await supabase.storage
        .from('gladiator-avatars')
        .remove([`${userId}/gladiator-avatar.png`, `${userId}/gladiator-avatar.jpg`, `${userId}/gladiator-avatar.jpeg`, `${userId}/gladiator-avatar.webp`])

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('gladiator-avatars')
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('gladiator-avatars')
        .getPublicUrl(fileName)

      const publicUrl = urlData.publicUrl

      // Update user record
      const { error: updateError } = await supabase
        .from('users')
        .update({ gladiator_avatar: publicUrl })
        .eq('id', userId)

      if (updateError) {
        throw updateError
      }

      setAvatar(publicUrl)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Upload error:', err)
      setError('Failed to upload avatar. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setIsUploading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Remove from storage
      await supabase.storage
        .from('gladiator-avatars')
        .remove([`${userId}/gladiator-avatar.png`, `${userId}/gladiator-avatar.jpg`, `${userId}/gladiator-avatar.jpeg`, `${userId}/gladiator-avatar.webp`])

      // Clear user record
      const { error: updateError } = await supabase
        .from('users')
        .update({ gladiator_avatar: null })
        .eq('id', userId)

      if (updateError) {
        throw updateError
      }

      setAvatar(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Remove error:', err)
      setError('Failed to remove avatar. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  // Deterministic default avatar based on user ID
  const getDefaultAvatar = () => {
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    const index = Math.abs(hash) % DEFAULT_AVATARS.length
    return DEFAULT_AVATARS[index]
  }

  const displayAvatar = avatar || getDefaultAvatar()
  const isCustomAvatar = !!avatar

  return (
    <div className="space-y-4">
      {/* Current Avatar Display */}
      <div className="flex items-center gap-4">
        <div className="relative w-32 h-32 rounded-xl overflow-hidden border-2 border-yellow-500/30 bg-black/20">
          <Image
            src={displayAvatar}
            alt="Gladiator Avatar"
            fill
            className="object-cover"
            unoptimized={displayAvatar.startsWith('http')}
          />
          {isCustomAvatar && (
            <button
              onClick={handleRemoveAvatar}
              disabled={isUploading}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>

        <div className="flex-1">
          <p className="text-sm text-gray-400 mb-2">
            {isCustomAvatar ? 'Custom avatar uploaded' : 'Using default avatar'}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload New Avatar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Default Avatars Preview */}
      <div>
        <p className="text-sm text-gray-500 mb-2">Default avatars:</p>
        <div className="flex gap-2">
          {DEFAULT_AVATARS.map((avatarPath, index) => (
            <div
              key={index}
              className={`relative w-12 h-12 rounded-lg overflow-hidden border ${
                !isCustomAvatar && displayAvatar === avatarPath
                  ? 'border-yellow-500'
                  : 'border-white/10'
              }`}
            >
              <Image
                src={avatarPath}
                alt={`Default avatar ${index + 1}`}
                fill
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <p className="text-red-400 text-sm flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </p>
      )}

      {success && (
        <p className="text-green-400 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          Avatar updated successfully!
        </p>
      )}

      <p className="text-xs text-gray-500">
        For best results, use a square image (PNG or JPG) with a transparent or dark background.
        The gladiator avatars work best when the character is centered and facing forward.
      </p>
    </div>
  )
}
