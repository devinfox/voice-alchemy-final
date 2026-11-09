'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { X, Plus, Trash2, Mail, Clock, ChevronDown, Sparkles, Eye, Pencil, Zap, Tag as TagIcon, GitBranch } from 'lucide-react'
import { TemplateThumbnail } from './template-thumbnail'
import { StepEmailViewer } from './step-email-viewer'
import { EmailTemplate } from '@/types/database.types'
import { FUNNEL_TRIGGERS } from '@/lib/email-leads'
import type { EmailAudience } from '@/lib/email-audiences'
import { TagMultiSelect } from '@/components/tags/tag-multi-select'
import { useTags } from '@/components/tags/use-tags'

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
  /** Recorded as the owner of emails copied with "Save as new email" */
  currentUserId?: string | null
  /** An email was edited or copied from inside this form; parents refresh their template lists */
  onTemplatesChanged?: () => void
  editingFunnel?: {
    id: string
    name: string
    description: string | null
    status: string
    trigger_key?: string | null
    audience_id?: string | null
    trigger_tag_ids?: string[] | null
    exit_tag_ids?: string[] | null
    complete_tag_ids?: string[] | null
    phases?: Array<{
      id: string
      name: string | null
      template_id: string | null
      delay_days: number
      delay_hours: number
    }>
  } | null
}

/** One labelled setting: label and explanation on the left, control on the right. */
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-6 items-start">
      <div>
        <label className="block text-sm font-medium text-gray-200">
          {label}
          {required && <span className="text-red-400"> *</span>}
        </label>
        {hint && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** A titled group of fields. */
function Section({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="glass-card-subtle rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-yellow-500/15 text-yellow-400 flex items-center justify-center flex-shrink-0">{icon}</span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white leading-tight">{title}</h3>
            {description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  )
}

export function CreateFunnelModal({
  onClose,
  onSuccess,
  templates,
  editingFunnel,
  audiences = [],
  defaultAudienceId = null,
  currentUserId = null,
  onTemplatesChanged,
}: CreateFunnelModalProps) {
  const [name, setName] = useState(editingFunnel?.name || '')
  const [description, setDescription] = useState(editingFunnel?.description || '')
  const [triggerKey, setTriggerKey] = useState<string>(editingFunnel?.trigger_key || '')
  const [audienceId, setAudienceId] = useState<string>(editingFunnel?.audience_id || defaultAudienceId || '')
  const [triggerTagIds, setTriggerTagIds] = useState<string[]>(editingFunnel?.trigger_tag_ids || [])
  const [exitTagIds, setExitTagIds] = useState<string[]>(editingFunnel?.exit_tag_ids || [])
  const [completeTagIds, setCompleteTagIds] = useState<string[]>(editingFunnel?.complete_tag_ids || [])
  const { error: tagsError, hint: tagsHint } = useTags()
  const [phases, setPhases] = useState<FunnelPhase[]>(() => {
    if (editingFunnel?.phases && editingFunnel.phases.length > 0) {
      return editingFunnel.phases.map((p, i) => ({
        id: p.id || `phase-${i}`,
        name: p.name || `Step ${i + 1}`,
        template_id: p.template_id,
        delay_days: p.delay_days,
        delay_hours: p.delay_hours,
      }))
    }
    return [{ id: 'phase-1', name: 'Step 1', template_id: null, delay_days: 0, delay_hours: 0 }]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Emails edited or copied from inside this form, layered over the list the
  // parent passed in so the dropdowns and snapshots update straight away.
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, EmailTemplate>>({})
  const [addedTemplates, setAddedTemplates] = useState<EmailTemplate[]>([])
  const allTemplates = useMemo(() => {
    const base = templates.map((t) => templateOverrides[t.id] || t)
    const known = new Set(base.map((t) => t.id))
    return [...base, ...addedTemplates.filter((t) => !known.has(t.id)).map((t) => templateOverrides[t.id] || t)]
  }, [templates, templateOverrides, addedTemplates])
  const templateById = useMemo(() => new Map(allTemplates.map((t) => [t.id, t])), [allTemplates])

  // Preview / edit of a step's email, opened from the snapshot beside it
  const [viewing, setViewing] = useState<{ phaseId: string; template: EmailTemplate; edit: boolean } | null>(null)

  const isEditing = !!editingFunnel

  const addPhase = () => {
    const newPhase: FunnelPhase = {
      id: `phase-${Date.now()}`,
      name: `Step ${phases.length + 1}`,
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

  const handleEmailSaved = (saved: EmailTemplate, mode: 'updated' | 'created') => {
    if (mode === 'updated') {
      setTemplateOverrides((prev) => ({ ...prev, [saved.id]: saved }))
    } else {
      setAddedTemplates((prev) => [...prev, saved])
      // The copy belongs to the step it was made from; the original stays as it was.
      if (viewing) updatePhase(viewing.phaseId, { template_id: saved.id })
    }
    onTemplatesChanged?.()
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Give the funnel a name.')
      return
    }

    if (!description.trim()) {
      setError('Describe who this funnel is for. It appears on the funnel list and lets the inbox assistant suggest enrollments.')
      return
    }

    if (phases.length === 0) {
      setError('Add at least one step.')
      return
    }

    if (phases.some((p) => !p.template_id)) {
      setError('Every step needs an email. Pick one for each step below.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const url = isEditing ? `/api/email-funnels/${editingFunnel.id}` : '/api/email-funnels'
      const method = isEditing ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          trigger_key: triggerKey || null,
          audience_id: audienceId || null,
          // Tag automation. Omitted when tags are unavailable so an old schema
          // does not reject the save.
          ...(tagsError ? {} : { trigger_tag_ids: triggerTagIds, exit_tag_ids: exitTagIds, complete_tag_ids: completeTagIds }),
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

  const stepCount = phases.length
  const readySteps = phases.filter((p) => p.template_id).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden glass-card modal-solid rounded-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white">{isEditing ? 'Edit funnel' : 'New funnel'}</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {isEditing
                ? 'Change the details, who gets enrolled, or the emails and timing of each step.'
                : 'Chain a few emails together and let them send on a schedule.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">{error}</div>
          )}

          {/* 1. Basics */}
          <Section icon={<GitBranch className="w-4 h-4" />} title="About this funnel">
            <Field label="Name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., New Student Welcome Sequence"
                className="glass-input w-full px-4 py-2 text-sm"
              />
            </Field>

            <Field
              label="Who is it for?"
              required
              hint="Shown on the funnel list. Be specific: new or returning student, what they asked about, and what you want this sequence to lead to."
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., A new student who just created an account and has not booked a first lesson yet"
                className="glass-input w-full px-4 py-3 h-24 resize-none text-sm"
              />
              <p className="flex items-start gap-2 text-xs text-purple-300 mt-2">
                <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                With auto-enrollment on, inbound emails that match this description are suggested for enrollment on the Suggested tab.
              </p>
            </Field>

            {audiences.length > 0 && (
              <Field
                label="User type"
                hint="Groups this funnel on the Funnels page with the others for the same kind of person."
              >
                <SelectWrap>
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
                </SelectWrap>
              </Field>
            )}
          </Section>

          {/* 2. Enrollment */}
          <Section
            icon={<Zap className="w-4 h-4" />}
            title="Who gets enrolled, and when"
            description="People can always be added by hand. These rules enroll them automatically while the funnel is on."
          >
            <Field
              label="Starts automatically when"
              hint="Website form submissions and new student accounts enroll people here while the funnel is active. Each trigger can start only one funnel."
            >
              <SelectWrap>
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
              </SelectWrap>
            </Field>

            <div className="border-t border-white/10 pt-5 space-y-5">
              <div className="flex items-start gap-2">
                <TagIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  Tags work like Mailchimp tags: put one on a lead or student and any funnel listening for it reacts. Several funnels can listen to the same tag.
                </p>
              </div>

              {tagsError ? (
                <p className="text-xs text-amber-300/90">
                  Tags are not set up yet: {tagsError}
                  {tagsHint && <span className="text-gray-500"> {tagsHint}</span>}
                </p>
              ) : (
                <>
                  <Field label="Also starts when someone is tagged">
                    <TagMultiSelect value={triggerTagIds} onChange={setTriggerTagIds} placeholder="Choose start tags" />
                  </Field>
                  <Field
                    label="Stops for someone when they are tagged"
                    hint="Handy for “Booked a lesson” or “Enrolled”, so the sequence ends the moment it has done its job."
                  >
                    <TagMultiSelect value={exitTagIds} onChange={setExitTagIds} placeholder="Choose stop tags" />
                  </Field>
                  <Field
                    label="When they finish the last step, tag them"
                    hint="If another funnel starts on that tag, finishing this one hands them straight into it."
                  >
                    <TagMultiSelect value={completeTagIds} onChange={setCompleteTagIds} placeholder="Choose finish tags" />
                  </Field>
                </>
              )}
            </div>
          </Section>

          {/* 3. Steps */}
          <Section
            icon={<Mail className="w-4 h-4" />}
            title="Steps"
            description={
              <>
                {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                {readySteps < stepCount && ` · ${stepCount - readySteps} still ${stepCount - readySteps === 1 ? 'needs' : 'need'} an email`}
                . Click an email’s picture to preview it, or Edit to change it right here. Saving updates that email everywhere it is used; “Save as new email” keeps the original and swaps in a copy for this step.
              </>
            }
            action={
              <button
                type="button"
                onClick={addPhase}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add step
              </button>
            }
          >
            <div className="space-y-3">
              {phases.map((phase, index) => {
                const selected = phase.template_id ? templateById.get(phase.template_id) : undefined
                const missingTemplate = !!phase.template_id && !selected
                return (
                  <div key={phase.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start gap-4">
                      {/* Step number */}
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-400 font-bold text-sm flex-shrink-0">
                        {index + 1}
                      </div>

                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Name + timing on one row */}
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="text"
                            value={phase.name}
                            onChange={(e) => updatePhase(phase.id, { name: e.target.value })}
                            placeholder={`Step ${index + 1} name`}
                            aria-label="Step name"
                            className="glass-input flex-1 min-w-[10rem] px-3 py-1.5 text-sm"
                          />
                          <div className="flex items-center gap-2 text-sm text-gray-400 flex-shrink-0">
                            <Clock className="w-4 h-4 text-gray-500" />
                            {index === 0 ? (
                              <span>Sends right away</span>
                            ) : (
                              <>
                                <span>Sends</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={phase.delay_days}
                                  onChange={(e) => updatePhase(phase.id, { delay_days: parseInt(e.target.value) || 0 })}
                                  aria-label="Days after the previous step"
                                  className="glass-input w-14 px-2 py-1 text-sm text-center"
                                />
                                <span>days</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="23"
                                  value={phase.delay_hours}
                                  onChange={(e) => updatePhase(phase.id, { delay_hours: parseInt(e.target.value) || 0 })}
                                  aria-label="Hours after the previous step"
                                  className="glass-input w-14 px-2 py-1 text-sm text-center"
                                />
                                <span>hours after the previous step</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Email */}
                        <div>
                          <SelectWrap>
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <select
                              value={phase.template_id || ''}
                              onChange={(e) => updatePhase(phase.id, { template_id: e.target.value || null })}
                              aria-label="Email to send"
                              // .glass-select sets its own padding, which beats the pl-10 utility
                              style={{ paddingLeft: '2.5rem' }}
                              className={`glass-select w-full pr-8 py-2 text-sm appearance-none ${!phase.template_id ? 'text-gray-400' : ''}`}
                            >
                              <option value="">Choose the email to send…</option>
                              {allTemplates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} — {t.subject}
                                </option>
                              ))}
                              {missingTemplate && <option value={phase.template_id!}>Hidden or removed email</option>}
                            </select>
                          </SelectWrap>
                          {selected && (
                            <p className="text-xs text-gray-500 mt-1.5 truncate" title={selected.subject}>
                              Subject: <span className="text-gray-400">{selected.subject}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Snapshot of the chosen email with preview / edit */}
                      {selected && (
                        <div className="w-28 flex-shrink-0 space-y-2">
                          <button
                            type="button"
                            onClick={() => setViewing({ phaseId: phase.id, template: selected, edit: false })}
                            title="Preview this email"
                            className="block w-full rounded-lg overflow-hidden border border-white/10 hover:border-yellow-500/40 transition-colors"
                          >
                            <TemplateThumbnail template={selected} className="w-full aspect-[4/5]" />
                          </button>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setViewing({ phaseId: phase.id, template: selected, edit: false })}
                              className="flex items-center gap-1 text-xs text-gray-300 hover:text-white"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewing({ phaseId: phase.id, template: selected, edit: true })}
                              className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Remove step */}
                      {phases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePhase(phase.id)}
                          title="Remove this step"
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/10">
          <p className="text-xs text-gray-500">
            {isEditing ? 'Changes apply to everyone currently in the funnel.' : 'New funnels start turned off. Turn one on when it is ready.'}
          </p>
          <div className="flex items-center gap-3">
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
              {saving ? 'Saving…' : isEditing ? 'Save funnel' : 'Create funnel'}
            </button>
          </div>
        </div>
      </div>

      {viewing && (
        <StepEmailViewer
          template={viewing.template}
          startInEdit={viewing.edit}
          contextNote={`Step ${phases.findIndex((p) => p.id === viewing.phaseId) + 1}${name.trim() ? ` of ${name.trim()}` : ''}`}
          currentUserId={currentUserId}
          onClose={() => setViewing(null)}
          onSaved={handleEmailSaved}
        />
      )}
    </div>
  )
}
