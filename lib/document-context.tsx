/**
 * Minimal document-context stand-in for email compose.
 * CRM's full ByeTalk documents panel is not ported.
 */

'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/** Document library items that can be attached to an email (ByeTalk-style). */
export interface PendingDocumentAttachment {
  public_url?: string | null
  file_name: string
  mime_type?: string | null
}

interface DocumentContextValue {
  pendingAttachments: PendingDocumentAttachment[]
  clearPendingAttachments: () => void
  openPanel: () => void
  setPendingAttachments: (files: PendingDocumentAttachment[]) => void
}

const DocumentContext = createContext<DocumentContextValue>({
  pendingAttachments: [],
  clearPendingAttachments: () => {},
  openPanel: () => {},
  setPendingAttachments: () => {},
})

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [pendingAttachments, setPendingAttachments] = useState<PendingDocumentAttachment[]>([])
  return (
    <DocumentContext.Provider
      value={{
        pendingAttachments,
        setPendingAttachments,
        clearPendingAttachments: () => setPendingAttachments([]),
        openPanel: () => {},
      }}
    >
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocuments() {
  return useContext(DocumentContext)
}
