'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, GripVertical, Mail, Clock, ChevronDown, Sparkles, Eye } from 'lucide-react'
import { TemplateThumbnail } from './template-thumbnail'
import { TemplatePreviewModal } from './template-preview-modal'
import { EmailTemplate } from '@/types/database.types'
import { FUNNEL_TRIGGERS } from '@/lib/email-leads'
import type { EmailAudience } from '@/lib/email-audiences'

interface FunnelPhase {
  id: string
  name: string
  template_id: string | null
  delay_days: number
  delay_hours: number
}

interface CreateFunnelModalProps {
  onClose: () => void
  onSuccess: () => void
  templates: EmailTemplate[]
  /** User types to file the funnel under (empty when the audiences migration is not applied) */
  audiences?: EmailAudience[]
  /** Preselected user type when creating from a section header */
  defaultAudienceId?: string | null
  editingFunnel?: {
    id: string
    name: string
    description: string | null
    status: string
    trigger_key?: string | null
    audience_id?: string | null
    phases?: Array<{
      id: string
      name: string | null
      template_id: string | null
      delay_days: number
      delay_hours: number
    }>
  } | null
}

export function CreateFunnelModal({
  onClose,
  onSuccess,
  templates,
  editingFunnel,
  audiences = [],
  defaultAudienceId = null,
}: CreateFunnelModalProps) {
  const [name, setName] = useState(editingFunnel?.name || '')
  const [description, setDescription] = useState(editingFunnel?.description || '')
  const [triggerKey, setTriggerKey] = useState<string>(editingFunnel?.trigger_key || '')
  const [audienceId, setAudienceId] = useState<string>(editingFunnel?.audience_id || defaultAudienceId || '')
  const [phases, setPhases] = useState<FunnelPhase[]>(() => {
    if (editingFunnel?.phases && editingFunnel.phases.length > 0) {
      return editingFunnel.phases.map((p, i) => ({
        id: p.id || `phase-${i}`,
        name: p.name || `Phase ${i + 1}`,
        template_id: p.template_id,
        delay_days: p.delay_days,
        delay_hours: p.delay_hours,
      }))
    }
    return [{ id: 'phase-1', name: 'Phase 1', template_id: null, delay_days: 0, delay_hours: 0 }]
  })
  const [saving, setSaving] = useState(false)
  // Full-size preview of a step's email, opened from the snapshot beside it
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null)
  const templateById = new Map(templates.map((t) => [t.id, t]))
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!editingFunnel

  const addPhase = () => {
    const newPhase: FunnelPhase = {
      id: `phase-${Date.now()}`,
      name: `Phase ${phases.length + 1}`,
      template_id: null,
      delay_days: phases.length === 0 ? 0 : 1,
      delay_hours: 0,
    }
    setPhases([...phases, newPhase])
  }

  const removePhase = (id: string) => {
    if (phases.length <= 1) return
    setPhases(phases.filter((p) => p.id !== id))
  }

  const updatePhase = (id: string, updates: Partial<FunnelPhase>) => {
    setPhases(phases.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Funnel name is required')
      return
    }

    if (!description.trim()) {
      setError('Describe who this funnel is for. It appears on the funnel list and lets the inbox assistant suggest enrollments.')
      return
    }

    if (phases.length === 0) {
      setError('At least one phase is required')
      return
    }

    // Check if all phases have templates
    const hasEmptyTemplates = phases.some((p) => !p.template_id)
    if (hasEmptyTemplates) {
      setError('Every phase needs a template')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const url = isEditing
        ? `/api/email-funnels/${editingFunnel.id}`
        : '/api/email-funnels'
      const method = isEditing ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          trigger_key: triggerKey || null,
          audience_id: audienceId || null,
          // Only stamp a status on create. On edit, omitting it preserves the
          // funnel's current status instead of silently demoting active
          // funnels back to draft.
          ...(isEditing ? {} : { status: 'draft' }),
          // Pass phase ids through so the API can update existing phases in
          // place (preserving logs/stats) instead of delete-and-reinsert.
          // Client-generated placeholder ids ("phase-...") are treated as new.
          phases: phases.map((p) => ({
            id: p.id,
            template_id: p.template_id,
            name: p.name,
            delay_days: p.delay_days,
            delay_hours: p.delay_hours,
          })),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to save funnel')
        return
      }

      onSuccess()
    } catch (err) {
      console.error('Error saving funnel:', err)
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden glass-card modal-solid rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">
            {isEditing ? 'Edit Funnel' : 'Create New Funnel'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Funnel Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Funnel Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., New Student Welcome Sequence"
              className="glass-input w-full px-4 py-2"
            />
          </div>

          {/* AI Matching Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              What is this funnel for? *
            </label>
            <div className="flex items-start gap-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg mb-2">
              <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-purple-300 text-xs">
                Describe who should receive this sequence. With auto-enrollment on, inbound emails that match this description are suggested for enrollment on the Suggested tab.
              </p>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., A new student who just created an account and has not booked a first lesson yet"
              className="glass-input w-full px-4 py-3 h-24 resize-none"
            />
            <p className="text-gray-500 text-xs">
              Be specific: new or returning student, what they asked about, and what you want this sequence to lead to.
            </p>
          </div>

          {/* User type */}
          {audiences.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                User type
              </label>
              <div className="relative">
                <select
                  value={audienceId}
                  onChange={(e) => setAudienceId(e.target.value)}
                  className="glass-select w-full px-4 pr-8 py-2 text-sm appearance-none"
                >
                  <option value="">Not filed under a user type</option>
                  {audiences.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-gray-500 text-xs mt-1">
                Groups this funnel on the Funnels page with the others for the same kind of person.
              </p>
            </div>
          )}

          {/* Trigger */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Starts automatically when
            </label>
            <div className="relative">
              <select
                value={triggerKey}
                onChange={(e) => setTriggerKey(e.target.value)}
                className="glass-select w-full px-4 pr-8 py-2 text-sm appearance-none"
              >
                <option value="">Nobody is enrolled automatically (enroll by hand)</option>
                {FUNNEL_TRIGGERS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} — {t.description}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <p className="text-gray-500 text-xs mt-1">
              Website form submissions and new student accounts enroll people here while the funnel is active. Each trigger can start only one funnel.
            </p>
          </div>

          {/* Phases */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-gray-300">
                Funnel Phases
              </label>
              <button
                onClick={addPhase}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Phase
              </button>
            </div>

            <div className="space-y-3">
              {phases.map((phase, index) => {
                const selected = phase.template_id ? templateById.get(phase.template_id) : undefined
                return (
                <div
                  key={phase.id}
                  className="glass-card p-4 border border-white/10 rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    {/* Phase Number */}
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-400 font-bold text-sm flex-shrink-0 mt-1">
                      {index + 1}
                    </div>

                    <div className="flex-1 space-y-3">
                      {/* Phase Name */}
                      <input
                        type="text"
                        value={phase.name}
                        onChange={(e) => updatePhase(phase.id, { name: e.target.value })}
                        placeholder="Phase name"
                        className="glass-input w-full px-3 py-1.5 text-sm"
                      />

                      {/* Template Selection */}
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <select
                          value={phase.template_id || ''}
                          onChange={(e) =>
                            updatePhase(phase.id, {
                              template_id: e.target.value || null,
                            })
                          }
                          className="glass-select w-full pl-10 pr-8 py-2 text-sm appearance-none"
                        >
                          <option value="">Select a template...</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} - {t.subject}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>

                      {/* Delay */}
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-400">
                          {index === 0 ? 'Send immediately' : 'Send after'}
                        </span>
                        {index > 0 && (
                          <>
                            <input
                              type="number"
                              min="0"
                              value={phase.delay_days}
                              onChange={(e) =>
                                updatePhase(phase.id, {
                                  delay_days: parseInt(e.target.value) || 0,
                                })
                              }
                              className="glass-input w-16 px-2 py-1 text-sm text-center"
                            />
                            <span className="text-sm text-gray-400">days</span>
                            <input
                              type="number"
                              min="0"
                              max="23"
                              value={phase.delay_hours}
                              onChange={(e) =>
                                updatePhase(phase.id, {
                                  delay_hours: parseInt(e.target.value) || 0,
                                })
                              }
                              className="glass-input w-16 px-2 py-1 text-sm text-center"
                            />
                            <span className="text-sm text-gray-400">hours</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Snapshot of the chosen email: header, copy and image, scaled */}
                    {selected && (
                      <div className="w-44 flex-shrink-0 space-y-2">
                        <button
                          type="button"
                          onClick={() => setPreviewTemplate(selected)}
                          title="Open full preview"
                          className="block w-full rounded-lg overflow-hidden border border-white/10 hover:border-yellow-500/40 transition-colors"
                        >
                          <TemplateThumbnail template={selected} className="w-full aspect-[3/4]" />
                        </button>
                        <p className="text-[11px] text-gray-400 leading-snug line-clamp-2" title={selected.subject}>
                          {selected.subject}
                        </p>
                        <button
                          type="button"
                          onClick={() => setPreviewTemplate(selected)}
                          className="flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Full preview
                        </button>
                      </div>
                    )}

                    {/* Delete Button */}
                    {phases.length > 1 && (
                      <button
                        onClick={() => removePhase(phase.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 glass-button-gold rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Update Funnel' : 'Create Funnel'}
          </button>
        </div>
      </div>

      {previewTemplate && (
        <TemplatePreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      )}
    </div>
  )
}
