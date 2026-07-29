'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, Pencil, Trash2, UserPlus, Tag } from 'lucide-react'
import { FunnelStatus } from '@/types/database.types'
import { ImportLeadsByTagsModal } from '@/components/import-leads-by-tags-modal'
import { FunnelTagsEditor } from '@/components/funnel-tags-editor'

interface FunnelDetailClientProps {
  funnelId: string
  funnelName: string
  currentStatus: FunnelStatus
  currentTags: string[]
  autoEnrollEnabled: boolean
}

export function FunnelDetailClient({ funnelId, funnelName, currentStatus, currentTags, autoEnrollEnabled }: FunnelDetailClientProps) {
  const router = useRouter()
  const [status, setStatus] = useState<FunnelStatus>(currentStatus)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showTagsEditor, setShowTagsEditor] = useState(false)
  const [tags, setTags] = useState<string[]>(currentTags)
  const [autoEnroll, setAutoEnroll] = useState(autoEnrollEnabled)

  const toggleStatus = async () => {
    const newStatus: FunnelStatus = status === 'active' ? 'paused' : 'active'
    setUpdating(true)

    try {
      const response = await fetch(`/api/email-funnels/${funnelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        setStatus(newStatus)
        router.refresh()
      } else {
        const result = await response.json()
        alert(`Failed to update status: ${result.error}`)
      }
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status')
    }
    setUpdating(false)
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this funnel? This action cannot be undone.')) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(`/api/email-funnels/${funnelId}`, { method: 'DELETE' })

      if (response.ok) {
        router.push('/dashboard/email-templates?tab=funnels')
      } else {
        const result = await response.json()
        alert(`Failed to delete funnel: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting funnel:', error)
      alert('Failed to delete funnel')
    }
    setDeleting(false)
  }

  const handleSaveTags = async (newTags: string[], newAutoEnroll: boolean) => {
    const response = await fetch(`/api/email-funnels/${funnelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags, auto_enroll_enabled: newAutoEnroll }),
    })

    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Failed to save tags')
    }

    setTags(newTags)
    setAutoEnroll(newAutoEnroll)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Import Leads Button */}
        {status === 'active' && (
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Import Leads by Tags
          </button>
        )}

        {/* Play/Pause Button */}
        {status !== 'archived' && (
          <button
            onClick={toggleStatus}
            disabled={updating}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all disabled:opacity-50 ${
              status === 'active'
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
            }`}
          >
            {status === 'active' ? (
              <>
                <Pause className="w-4 h-4" />
                {updating ? 'Pausing...' : 'Pause Funnel'}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {updating ? 'Activating...' : 'Activate Funnel'}
              </>
            )}
          </button>
        )}

        {/* Tags Button */}
        <button
          onClick={() => setShowTagsEditor(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl transition-all"
        >
          <Tag className="w-4 h-4" />
          Tags {tags.length > 0 && `(${tags.length})`}
        </button>

        {/* Edit Button */}
        <button
          onClick={() => router.push(`/dashboard/email-templates?tab=funnels&edit=${funnelId}`)}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-xl transition-all"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      {/* Import Leads Modal */}
      {showImportModal && (
        <ImportLeadsByTagsModal
          funnelId={funnelId}
          funnelName={funnelName}
          onClose={() => setShowImportModal(false)}
          onSuccess={(_count?: number) => {
            setShowImportModal(false)
            router.refresh()
          }}
        />
      )}

      {/* Tags Editor Modal */}
      {showTagsEditor && (
        <FunnelTagsEditor
          funnelId={funnelId}
          currentTags={tags}
          autoEnrollEnabled={autoEnroll}
          onSave={handleSaveTags}
          onClose={() => setShowTagsEditor(false)}
        />
      )}
    </>
  )
}
