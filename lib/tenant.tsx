/**
 * Voice Alchemy Academy tenant branding.
 * Simplified single-tenant stand-in for the CRM multi-tenant tenant module.
 * Gold accent matches VAAA branding (#CEB466).
 */

'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

export const VAAA_ACCENT = '#CEB466'
export const VAAA_ACCENT_LIGHT = '#e0c97d'
export const VAAA_ACCENT_DARK = '#b59d52'

export interface GradientConfig {
  accentColor: string
  accentColorLight: string
  accentColorDark: string
  from: string
  via: string
  to: string
}

export interface TenantContextValue {
  /** Always true for Voice Alchemy Academy gold-branded UI paths. */
  isVoiceAlchemy: boolean
  isCitadelGold: boolean
  isMeridian: boolean
  organizationName: string
  domain: string
  gradientConfig: GradientConfig
}

const DEFAULT_GRADIENT: GradientConfig = {
  accentColor: VAAA_ACCENT,
  accentColorLight: VAAA_ACCENT_LIGHT,
  accentColorDark: VAAA_ACCENT_DARK,
  from: VAAA_ACCENT,
  via: VAAA_ACCENT_LIGHT,
  to: VAAA_ACCENT_DARK,
}

const TenantContext = createContext<TenantContextValue>({
  isVoiceAlchemy: true,
  isCitadelGold: true,
  isMeridian: false,
  organizationName: 'Voice Alchemy Academy',
  domain: 'voicealchemyacademy.com',
  gradientConfig: DEFAULT_GRADIENT,
})

export function TenantProvider({ children }: { children: ReactNode }) {
  const value = useMemo<TenantContextValue>(
    () => ({
      isVoiceAlchemy: true,
      isCitadelGold: true,
      isMeridian: false,
      organizationName: 'Voice Alchemy Academy',
      domain: process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'voicealchemyacademy.com',
      gradientConfig: DEFAULT_GRADIENT,
    }),
    []
  )
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantContextValue {
  return useContext(TenantContext)
}

/** Server-safe tenant config (no React). */
export function getTenantConfig() {
  return {
    isVoiceAlchemy: true,
    isCitadelGold: true,
    isMeridian: false,
    organizationName: 'Voice Alchemy Academy',
    domain: process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'voicealchemyacademy.com',
    gradientConfig: DEFAULT_GRADIENT,
  }
}
