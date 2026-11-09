'use client'

import { useState } from 'react'
import { EmailTemplate } from '@/types/database.types'
import { TemplatePreviewModal } from './template-preview-modal'
import { EditTemplateModal } from './edit-template-modal'

interface StepEmailViewerProps {
  template: EmailTemplate
  /** Shown under the title, e.g. "Step 2 of New Student Welcome". */
  contextNote?: string
  /** Open straight in the editor instead of the preview. */
  startInEdit?: boolean
  /** Hide the Edit button (read-only preview). */
  canEdit?: boolean
  currentUserId?: string | null
  onClose: () => void
  /**
   * The email was saved. 'updated' changed it in place (every funnel using it
   * sees the change); 'created' made a separate copy via "Save as new email".
   */
  onSaved?: (saved: EmailTemplate, mode: 'updated' | 'created') => void
}

/**
 * Preview of a funnel step's email with a path straight into the editor, so
 * an email can be fixed from the funnel without a trip to the Emails tab.
 */
export function StepEmailViewer({
  template,
  contextNote,
  startInEdit = false,
  canEdit = true,
  currentUserId,
  onClose,
  onSaved,
}: StepEmailViewerProps) {
  const [editing, setEditing] = useState(startInEdit && canEdit)

  if (editing) {
    return (
      <EditTemplateModal
        template={template}
        contextNote={contextNote}
        allowSaveAsNew
        currentUserId={currentUserId}
        onClose={onClose}
        onSaved={onSaved}
        onSuccess={onClose}
      />
    )
  }

  return (
    <TemplatePreviewModal
      template={template}
      contextNote={contextNote}
      onClose={onClose}
      onEdit={canEdit ? () => setEditing(true) : undefined}
    />
  )
}
