'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, UserPlus, Tag } from 'lucide-react'
import { EmailTemplate, FunnelStatus } from '@/types/database.types'
import { Switch } from '@/components/ui/switch'
import { OverflowMenu } from '@/components/ui/overflow-menu'
import { EnrollStudentsModal } from '@/components/enroll-students-modal'
import { FunnelTagsEditor } from '@/components/funnel-tags-editor'
import { CreateFunnelModal } from '../../create-funnel-modal'
import type { EmailAudience } from '@/lib/email-audiences'

interface FunnelDetailClientProps {
  funnel: {
    id: string
    name: string
    description: string | null
    status: FunnelStatus
    tags: string[]
    auto_enroll_enabled: boolean
    trigger_key?: string | null
    audience_id?: string | null
    phases: Array<{
      id: string
      name: string | null
      template_id: string | null
      delay_days: number
      delay_hours: number
    }>
  }
  templates: EmailTemplate[]
  audiences?: EmailAudience[]
}

/** Header controls for one funnel: on/off, add students, and a menu for the rest. */
export function FunnelDetailClient({ funnel, templates, audiences = [] }: FunnelDetailClientProps) {
  const router = useRouter()
  const [status, setStatus] = useState<FunnelStatus>(funnel.status)
  const [updating, setUpdating] = useState(false)
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showTagsEditor, setShowTagsEditor] = useState(false)
  const [tags, setTags] = useState<string[]>(funnel.tags)
  const [autoEnroll, setAutoEnroll] = useState(funnel.auto_enroll_enabled)

  const isOn = status === 'active'

  const toggle = async (on: boolean) => {
    if (on && funnel.phases.some((p) => !p.template_id)) {
      alert('Every step needs an email before the funnel can be turned on. Use Edit steps to finish it.')
      return
    }
    const newStatus: FunnelStatus = on ? 'active' : 'paused'
    setUpdating(true)
    try {
      const response = await fetch(`/api/email-funnels/${funnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (response.ok) {
        setStatus(newStatus)
        router.refresh()
      } else {
        const result = await response.json()
        alert(`Could not update: ${result.error}`)
      }
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Could not update the funnel. Please try again.')
    }
    setUpdating(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${funnel.name}"? Students in it will stop receiving its emails.`)) return
    try {
      const response = await fetch(`/api/email-funnels/${funnel.id}`, { method: 'DELETE' })
      if (response.ok) {
        router.push('/dashboard/email-templates?tab=funnels')
      } else {
        const result = await response.json()
        alert(`Could not delete: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting funnel:', error)
      alert('Could not delete the funnel. Please try again.')
    }
  }

  const handleSaveTags = async (newTags: string[], newAutoEnroll: boolean) => {
    const response = await fetch(`/api/email-funnels/${funnel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags, auto_enroll_enabled: newAutoEnroll }),
    })
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Could not save')
    }
    setTags(newTags)
    setAutoEnroll(newAutoEnroll)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap justify-end">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <Switch checked={isOn} disabled={updating} onCheckedChange={toggle} aria-label="Funnel on or off" />
          <span className={isOn ? 'text-green-400' : 'text-gray-500'}>{isOn ? 'On' : 'Off'}</span>
        </label>

        <button
          onClick={() => setShowEnrollModal(true)}
          disabled={!isOn}
          title={isOn ? undefined : 'Turn the funnel on to add students'}
          className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UserPlus className="w-4 h-4" />
          Add students
        </button>

        <OverflowMenu
          items={[
            { label: 'Edit steps', icon: <Pencil className="w-4 h-4" />, onSelect: () => setShowEditModal(true) },
            {
              label: autoEnroll ? 'Auto-enroll: on' : 'Auto-enroll & tags',
              icon: <Tag className="w-4 h-4" />,
              onSelect: () => setShowTagsEditor(true),
            },
            { label: 'Delete funnel', icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: handleDelete },
          ]}
        />
      </div>

      {showEnrollModal && (
        <EnrollStudentsModal
          funnelId={funnel.id}
          funnelName={funnel.name}
          onClose={() => setShowEnrollModal(false)}
          onSuccess={() => {
            setShowEnrollModal(false)
            router.refresh()
          }}
        />
      )}

      {showEditModal && (
        <CreateFunnelModal
          templates={templates}
          audiences={audiences}
          editingFunnel={{ id: funnel.id, name: funnel.name, description: funnel.description, status, trigger_key: funnel.trigger_key ?? null, audience_id: funnel.audience_id ?? null, phases: funnel.phases }}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false)
            router.refresh()
          }}
        />
      )}

      {showTagsEditor && (
        <FunnelTagsEditor
          funnelId={funnel.id}
          currentTags={tags}
          autoEnrollEnabled={autoEnroll}
          onSave={handleSaveTags}
          onClose={() => setShowTagsEditor(false)}
        />
      )}
    </>
  )
}
