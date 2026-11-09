'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmailTemplate } from '@/types/database.types'
import { FunnelSteps, type FunnelStepLike } from '../../funnel-steps'
import { StepEmailViewer } from '../../step-email-viewer'

interface FunnelStepsInteractiveProps {
  funnelId: string
  funnelName: string
  steps: FunnelStepLike[]
  templates: EmailTemplate[]
  currentUserId?: string | null
}

/** The step strip on a funnel's page: click a step to preview or edit its email. */
export function FunnelStepsInteractive({ funnelId, funnelName, steps, templates, currentUserId = null }: FunnelStepsInteractiveProps) {
  const router = useRouter()
  const [view, setView] = useState<{ step: FunnelStepLike; index: number; template: EmailTemplate } | null>(null)

  const handleSaved = async (saved: EmailTemplate, mode: 'updated' | 'created') => {
    if (mode === 'created' && view) {
      // Point this step at the copy; the original email is left as it was.
      const phases = [...steps]
        .sort((a, b) => a.phase_order - b.phase_order)
        .map((p) => ({
          id: p.id,
          template_id: p.id === view.step.id ? saved.id : p.template_id,
          name: p.name,
          delay_days: p.delay_days,
          delay_hours: p.delay_hours,
        }))
      try {
        const response = await fetch(`/api/email-funnels/${funnelId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phases }),
        })
        if (!response.ok) {
          const result = await response.json()
          alert(`The copy was saved, but the step could not be switched to it: ${result.error}`)
        }
      } catch {
        alert('The copy was saved, but the step could not be switched to it. Please try again from Edit steps.')
      }
    }
    router.refresh()
  }

  return (
    <>
      <FunnelSteps
        steps={steps}
        onStepClick={(step, index) => {
          const template = templates.find((t) => t.id === step.template_id)
          if (template) setView({ step, index, template })
        }}
      />
      {view && (
        <StepEmailViewer
          template={view.template}
          contextNote={`Step ${view.index + 1} of ${funnelName}`}
          currentUserId={currentUserId}
          onClose={() => setView(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
