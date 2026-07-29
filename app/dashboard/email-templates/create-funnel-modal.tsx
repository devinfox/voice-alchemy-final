'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, GripVertical, Mail, Clock, ChevronDown, Sparkles } from 'lucide-react'
import { EmailTemplate } from '@/types/database.types'

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
  editingFunnel?: {
    id: string
    name: string
    description: string | null
    status: string
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
}: CreateFunnelModalProps) {
  const [name, setName] = useState(editingFunnel?.name || '')
  const [description, setDescription] = useState(editingFunnel?.description || '')
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
      setError('Please describe what this funnel is for - this helps AI match leads automatically')
      return
    }

    if (phases.length === 0) {
      setError('At least one phase is required')
      return
    }

    // Check if all phases have templates
    const hasEmptyTemplates = phases.some((p) => !p.template_id)
    if (hasEmptyTemplates) {
      setError('All phases must have a template assigned')
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
          status: 'draft',
          phases: phases.map((p) => ({
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
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden glass-card rounded-2xl">
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
              placeholder="e.g., New Lead Welcome Sequence"
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
                Describe who should receive this funnel. Our AI will automatically match calls to this funnel based on your description.
              </p>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., This is for when someone finds us through Google Ads and calls us as a new lead interested in gold investment"
              className="glass-input w-full px-4 py-3 h-24 resize-none"
            />
            <p className="text-gray-500 text-xs">
              Be specific! Include details like: how they found you, whether they&apos;re new or existing, their interest level, what they&apos;re looking for.
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
              {phases.map((phase, index) => (
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
              ))}
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
    </div>
  )
}
