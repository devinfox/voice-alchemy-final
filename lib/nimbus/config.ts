/**
 * Nimbus AI analysis gate — ported as a simple env flag for VAAA.
 */

export const NIMBUS_ANALYSIS_ENABLED =
  process.env.NIMBUS_ANALYSIS_ENABLED === 'true' || process.env.EMAIL_AI_ENABLED === 'true'

export const NIMBUS_ANALYSIS_DISABLED_MESSAGE =
  'AI analysis is disabled for this Voice Alchemy Academy install.'

export function isNimbusAnalysisEnabled(): boolean {
  return NIMBUS_ANALYSIS_ENABLED
}
