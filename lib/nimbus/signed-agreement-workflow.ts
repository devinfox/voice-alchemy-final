/** Stub: signed-agreement workflow is sales-CRM specific. */

export async function queueAgreementConversionSuggestion(..._args: unknown[]): Promise<{
  success: boolean
  actionId?: string
}> {
  return { success: false, actionId: undefined }
}

export async function saveSignedAgreementToLeadDocuments(..._args: unknown[]): Promise<{
  success: boolean
  documentId?: string
}> {
  return { success: false }
}
