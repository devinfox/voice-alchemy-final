'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, ChevronRight, ChevronLeft, HelpCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export interface SpotlightStep {
  target: string // CSS selector e.g. '[data-tour="dashboard-practice-arena"]'
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
}

export interface WelcomePromptConfig {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

interface SpotlightTourProps {
  tourKey: string
  steps: SpotlightStep[]
  autoStartOnFirstVisit?: boolean
  welcomePrompt?: WelcomePromptConfig
  onComplete?: () => void
}

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
  bottom: number
  right: number
}

export function SpotlightTour({
  tourKey,
  steps,
  autoStartOnFirstVisit = true,
  welcomePrompt,
  onComplete,
}: SpotlightTourProps) {
  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMounted(true)
    return () => {
      // Ensure body scroll is unlocked on unmount
      if (typeof document !== 'undefined') {
        document.body.style.overflow = ''
        document.body.style.touchAction = ''
        document.documentElement.style.overflow = ''
        document.documentElement.style.touchAction = ''
      }
    }
  }, [])

  // Check if first visit (checks both localStorage and DB user_metadata)
  useEffect(() => {
    if (!autoStartOnFirstVisit || !isMounted) return

    const storageKey = `vaaa_spotlight_v4_${tourKey}`
    const localStatus = localStorage.getItem(storageKey)

    if (localStatus) return

    // Also check Supabase user metadata for cross-device persistence
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      const completedTours = (user?.user_metadata?.completed_tours || {}) as Record<string, boolean>
      if (completedTours[tourKey]) {
        localStorage.setItem(storageKey, 'completed')
        return
      }

      // If never done or dismissed, open the welcome prompt
      const timer = setTimeout(() => {
        if (welcomePrompt) {
          setIsPromptOpen(true)
        } else {
          setIsActive(true)
          setCurrentStepIndex(0)
        }
      }, 500)

      return () => clearTimeout(timer)
    })
  }, [tourKey, autoStartOnFirstVisit, welcomePrompt, isMounted])

  // Save completion/dismissal to both localStorage and Supabase DB
  const persistTourStatus = useCallback((status: 'completed' | 'dismissed') => {
    const storageKey = `vaaa_spotlight_v4_${tourKey}`
    localStorage.setItem(storageKey, status)

    try {
      const supabase = createClient()
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (user) {
          const completedTours = (user.user_metadata?.completed_tours || {}) as Record<string, boolean>
          completedTours[tourKey] = true
          await supabase.auth.updateUser({
            data: { completed_tours: completedTours },
          })
        }
      })
    } catch (e) {
      console.warn('Failed to sync tour status to DB:', e)
    }
  }, [tourKey])

  // Unlock scroll explicitly whenever tour ends
  const cleanupScrollLock = useCallback(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      document.documentElement.style.overflow = ''
      document.documentElement.style.touchAction = ''
    }
  }, [])

  // Listen for custom manual launch event (e.g. from "How to" button)
  useEffect(() => {
    const handleStartTour = () => {
      setIsPromptOpen(false)
      setIsActive(true)
      setCurrentStepIndex(0)
    }

    window.addEventListener(`start-spotlight-${tourKey}`, handleStartTour)
    return () => window.removeEventListener(`start-spotlight-${tourKey}`, handleStartTour)
  }, [tourKey])

  const currentStep = steps[currentStepIndex]

  // Update target element positioning (with smooth scroll and element detection)
  const updateTargetRect = useCallback(() => {
    if (!isActive || !currentStep) return

    const el = document.querySelector(currentStep.target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      const rect = el.getBoundingClientRect()
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      })
    } else {
      setTargetRect(null)
    }
  }, [isActive, currentStep])

  useEffect(() => {
    if (!isActive) return

    // Immediately measure target then re-measure after smooth scrollsettles
    updateTargetRect()
    const timer = setTimeout(updateTargetRect, 60)
    window.addEventListener('resize', updateTargetRect)
    window.addEventListener('scroll', updateTargetRect, true)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateTargetRect)
      window.removeEventListener('scroll', updateTargetRect, true)
    }
  }, [isActive, currentStepIndex, updateTargetRect])

  const handleStartFromPrompt = () => {
    setIsPromptOpen(false)
    setIsActive(true)
    setCurrentStepIndex(0)
  }

  const handleDismissPrompt = () => {
    setIsPromptOpen(false)
    persistTourStatus('dismissed')
    cleanupScrollLock()
  }

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      handleFinish()
    }
  }

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }

  const handleFinish = () => {
    setIsActive(false)
    persistTourStatus('completed')
    cleanupScrollLock()
    if (onComplete) onComplete()
  }

  const handleDismiss = () => {
    setIsActive(false)
    persistTourStatus('dismissed')
    cleanupScrollLock()
  }

  if (!isMounted) return null

  // 1. RENDER SOLID OPAQUE ROYAL PURPLE WELCOME MODAL
  if (isPromptOpen && welcomePrompt) {
    return createPortal(
      <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
        {/* Dark backdrop overlay */}
        <div
          className="fixed inset-0 bg-black/85 transition-opacity"
          onClick={handleDismissPrompt}
        />

        {/* Solid High-Contrast Opaque Purple Welcome Card */}
        <div
          className="relative z-[9995] w-full max-w-lg p-6 sm:p-8 rounded-3xl border-2 border-[#CEB466] shadow-[0_25px_70px_rgba(0,0,0,0.95)] text-center bg-[#1b1233] text-white max-h-[90dvh] overflow-y-auto"
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#CEB466] text-[#171229] flex items-center justify-center shadow-xl shadow-[#CEB466]/25 mb-4">
            <Sparkles className="w-7 h-7" />
          </div>

          <h3 className="text-xl sm:text-2xl font-bold text-white font-luxury mb-3">
            {welcomePrompt.title || 'Welcome to Voice Alchemy Academy'}
          </h3>

          <p className="text-sm sm:text-base text-gray-200 leading-relaxed mb-6">
            {welcomePrompt.message}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleStartFromPrompt}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] font-bold text-xs sm:text-sm shadow-xl shadow-[#CEB466]/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{welcomePrompt.confirmText || 'Yes, Walk Me Around'}</span>
            </button>

            <button
              onClick={handleDismissPrompt}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 hover:text-white text-xs sm:text-sm font-semibold transition-colors border border-white/10"
            >
              {welcomePrompt.cancelText || 'No thanks'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  if (!isActive) return null

  // 2. CALCULATE DYNAMIC TOOLTIP PLACEMENT (SMOOTH & RESPONSIVE)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  let tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10000,
    maxWidth: '420px',
    width: 'calc(100vw - 2rem)',
    transition: 'top 0.25s cubic-bezier(0.16, 1, 0.3, 1), left 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  }

  if (targetRect) {
    if (isMobile) {
      // Mobile Smart Positioning: Top vs Bottom of screen depending on element position
      const isTargetInBottomHalf = targetRect.top > (window.innerHeight / 2)
      if (isTargetInBottomHalf) {
        tooltipStyle.top = '16px'
        tooltipStyle.bottom = 'auto'
        tooltipStyle.left = '16px'
        tooltipStyle.right = '16px'
        tooltipStyle.width = 'auto'
        tooltipStyle.maxWidth = 'none'
      } else {
        tooltipStyle.bottom = '16px'
        tooltipStyle.top = 'auto'
        tooltipStyle.left = '16px'
        tooltipStyle.right = '16px'
        tooltipStyle.width = 'auto'
        tooltipStyle.maxWidth = 'none'
      }
    } else {
      // Desktop Adaptive Placement
      const padding = 16
      const tooltipWidth = Math.min(420, window.innerWidth - 32)
      const tooltipHeight = 220

      const spaceAbove = targetRect.top
      const spaceBelow = window.innerHeight - targetRect.bottom
      const spaceLeft = targetRect.left
      const spaceRight = window.innerWidth - targetRect.right

      const preferred = currentStep?.placement || 'auto'

      if (preferred === 'bottom' || (preferred === 'auto' && spaceBelow >= tooltipHeight)) {
        tooltipStyle.top = `${Math.min(window.innerHeight - tooltipHeight - 16, targetRect.bottom + padding)}px`
        tooltipStyle.left = `${Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, targetRect.left + targetRect.width / 2 - tooltipWidth / 2))}px`
      } else if (preferred === 'top' || (preferred === 'auto' && spaceAbove >= tooltipHeight)) {
        tooltipStyle.top = `${Math.max(16, targetRect.top - tooltipHeight - padding)}px`
        tooltipStyle.left = `${Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, targetRect.left + targetRect.width / 2 - tooltipWidth / 2))}px`
      } else if (preferred === 'right' && spaceRight >= tooltipWidth) {
        tooltipStyle.top = `${Math.max(16, targetRect.top + targetRect.height / 2 - tooltipHeight / 2)}px`
        tooltipStyle.left = `${targetRect.right + padding}px`
      } else if (preferred === 'left' && spaceLeft >= tooltipWidth) {
        tooltipStyle.top = `${Math.max(16, targetRect.top + targetRect.height / 2 - tooltipHeight / 2)}px`
        tooltipStyle.left = `${Math.max(16, targetRect.left - tooltipWidth - padding)}px`
      } else {
        tooltipStyle.top = '50%'
        tooltipStyle.left = '50%'
        tooltipStyle.transform = 'translate(-50%, -50%)'
      }
    }
  } else {
    tooltipStyle.top = '50%'
    tooltipStyle.left = '50%'
    tooltipStyle.transform = 'translate(-50%, -50%)'
  }

  const maskId = `spotlight-mask-${tourKey}`

  return createPortal(
    <div className="fixed inset-0 z-[9990] pointer-events-auto">
      {/* 1. CRYSTAL-CLEAR SVG CUTOUT MASK (ZERO BLUR, REASONABLE 55% SOFT OPACITY) */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ width: '100vw', height: '100vh' }}
      >
        <defs>
          <mask id={maskId}>
            {/* White covers the entire viewport (renders dim overlay) */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black cuts out the target element completely (100% crystal clear, 0 blur) */}
            {targetRect && (
              <rect
                x={Math.max(0, targetRect.left - 6)}
                y={Math.max(0, targetRect.top - 6)}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="16"
                ry="16"
                fill="black"
              />
            )}
          </mask>
        </defs>

        {/* Soft 55% dark dim overlay */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 11, 30, 0.55)"
          mask={`url(#${maskId})`}
          className="pointer-events-auto cursor-pointer"
          onClick={handleDismiss}
        />
      </svg>

      {/* 2. GLOWING GOLD BORDER RING AROUND REAL TARGET */}
      {targetRect && (
        <div
          className="fixed pointer-events-none transition-all duration-300 z-[9995]"
          style={{
            top: `${Math.max(0, targetRect.top - 6)}px`,
            left: `${Math.max(0, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
            borderRadius: '16px',
            border: '2px solid #CEB466',
            boxShadow: '0 0 25px rgba(206, 180, 102, 0.5), inset 0 0 10px rgba(206, 180, 102, 0.2)',
          }}
        >
          {/* Corner indicators */}
          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 border-t-2 border-l-2 border-[#CEB466] rounded-tl" />
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 border-t-2 border-r-2 border-[#CEB466] rounded-tr" />
          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 border-b-2 border-l-2 border-[#CEB466] rounded-bl" />
          <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 border-b-2 border-r-2 border-[#CEB466] rounded-br" />
        </div>
      )}

      {/* 3. POSITIONED SPOTLIGHT TOOLTIP CARD */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="pointer-events-auto"
      >
        <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 border-[#CEB466] shadow-[0_20px_60px_rgba(0,0,0,0.95)] relative overflow-hidden bg-[#1b1233] text-white">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2.5 sm:pb-3 border-b border-white/[0.08] relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-[#CEB466] text-[#171229] flex items-center justify-center font-bold flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#CEB466] uppercase">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
            </div>

            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close Walkthrough"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="py-2.5 sm:py-3.5 relative z-10">
            <h4 className="text-sm sm:text-lg font-bold text-white font-luxury">
              {currentStep?.title}
            </h4>
            <p className="text-xs sm:text-sm text-gray-200 mt-1 sm:mt-1.5 leading-relaxed">
              {currentStep?.content}
            </p>
          </div>

          {/* Footer Controls */}
          <div className="pt-2.5 sm:pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2 relative z-10">
            <button
              onClick={handleDismiss}
              className="text-[11px] text-gray-400 hover:text-white transition-colors"
            >
              Exit Tour
            </button>

            <div className="flex items-center gap-2">
              {currentStepIndex > 0 && (
                <button
                  onClick={handlePrev}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1 border border-white/10"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              )}

              <button
                onClick={handleNext}
                className="px-3.5 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] font-bold text-xs shadow-md shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1"
              >
                <span>
                  {currentStepIndex === steps.length - 1 ? 'Got it' : 'Next'}
                </span>
                {currentStepIndex < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Reusable "How to" trigger button to place on every tool header
 */
export function SpotlightTriggerButton({
  tourKey,
  label = 'How to',
  className = '',
}: {
  tourKey: string
  label?: string
  className?: string
}) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent(`start-spotlight-${tourKey}`))}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#CEB466]/10 hover:bg-[#CEB466]/20 text-[#CEB466] border border-[#CEB466]/30 text-xs font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm ${className}`}
      title={`How to use this tool`}
    >
      <HelpCircle className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  )
}
