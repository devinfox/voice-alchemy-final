'use client'

import React, { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** Style the confirm button as destructive (red) instead of gold. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    // Capture phase so Escape closes this dialog before any parent modal.
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative modal-solid rounded-2xl border-2 border-[#CEB466]/50 shadow-2xl shadow-black/80 w-full max-w-sm p-5 sm:p-6 animate-slide-up"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              destructive
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'bg-[#CEB466]/15 text-[#CEB466] border border-[#CEB466]/30'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white font-luxury">{title}</h3>
            <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white text-xs font-semibold transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              destructive
                ? 'bg-red-500/90 hover:bg-red-500 text-white shadow-lg shadow-red-500/20'
                : 'bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] shadow-lg shadow-[#CEB466]/20 hover:brightness-110'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
