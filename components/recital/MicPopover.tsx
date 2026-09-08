'use client'

import { useEffect, useRef } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { LevelReading } from '@/lib/recital/audio-pipeline'
import { LevelIndicator } from './LevelIndicator'

interface MicPopoverProps {
  open: boolean
  onClose: () => void
  preference: number
  onPreferenceChange: (value: number) => void
  reading: LevelReading
}

/** The only mic control users ever see: Quieter ↔ Louder, three quick buttons, Reset. */
export function MicPopover({ open, onClose, preference, onPreferenceChange, reading }: MicPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose, open])

  if (!open) return null

  const quick = (value: number, label: string) => {
    const active = Math.abs(preference - value) < 0.05
    return (
      <button
        type="button"
        onClick={() => onPreferenceChange(value)}
        className={`flex-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition-all active:scale-95 ${
          active
            ? 'bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] shadow-lg shadow-[#CEB466]/20'
            : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-[22rem] max-w-[calc(100vw-2rem)] modal-solid rounded-2xl border-2 border-[#CEB466]/50 shadow-2xl shadow-black/80 p-5 z-40 animate-slide-up"
      role="dialog"
      aria-label="Mic adjustment"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#CEB466]/15 text-[#CEB466] border border-[#CEB466]/30">
          <SlidersHorizontal className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-white font-luxury">Mic adjustment</h3>
          <p className="text-xs text-gray-300 mt-0.5">Everything is set automatically. Nudge it if you like.</p>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <LevelIndicator reading={reading} />

      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
          <span>Quieter</span>
          <span>Louder</span>
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={preference}
          onChange={(e) => onPreferenceChange(parseFloat(e.target.value))}
          className="w-full accent-[#CEB466]"
          aria-label="Mic volume preference"
        />
      </div>

      <div className="mt-3 flex gap-2">
        {quick(0.6, 'I sound too quiet')}
        {quick(0, 'Just right')}
        {quick(-0.6, 'I sound too loud')}
      </div>

      <button type="button" onClick={() => onPreferenceChange(0)} className="mt-3 w-full text-xs text-gray-400 hover:text-[#CEB466] transition-colors">
        Reset to automatic
      </button>
    </div>
  )
}
