'use client'

import { useState, useRef, useEffect } from 'react'
import { Clock, Calendar, Sun, Coffee, Moon, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface SnoozePickerProps {
  threadId: string
  snoozedUntil?: string | null
  onSnooze?: (until: Date | null) => void
}

export function SnoozePicker({ threadId, snoozedUntil, onSnooze }: SnoozePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('09:00')
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const isSnoozed = !!snoozedUntil

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowCustom(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const getPresets = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    return [
      {
        label: 'Later today',
        icon: Coffee,
        getDate: () => {
          const later = new Date()
          later.setHours(later.getHours() + 3)
          // Round to next hour
          later.setMinutes(0, 0, 0)
          return later
        },
      },
      {
        label: 'This evening',
        icon: Moon,
        getDate: () => {
          const evening = new Date(today)
          evening.setHours(18, 0, 0, 0)
          if (evening <= now) {
            evening.setDate(evening.getDate() + 1)
          }
          return evening
        },
      },
      {
        label: 'Tomorrow morning',
        icon: Sun,
        getDate: () => {
          const tomorrow = new Date(today)
          tomorrow.setDate(tomorrow.getDate() + 1)
          tomorrow.setHours(9, 0, 0, 0)
          return tomorrow
        },
      },
      {
        label: 'Next week',
        icon: Calendar,
        getDate: () => {
          const nextWeek = new Date(today)
          const daysUntilMonday = (8 - today.getDay()) % 7 || 7
          nextWeek.setDate(nextWeek.getDate() + daysUntilMonday)
          nextWeek.setHours(9, 0, 0, 0)
          return nextWeek
        },
      },
    ]
  }

  const handleSnooze = async (until: Date | null) => {
    if (saving) return

    setSaving(true)
    setIsOpen(false)
    setShowCustom(false)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('email_threads')
        .update({
          workflow_state: until ? 'snoozed' : null,
          snoozed_until: until?.toISOString() || null,
          folder: until ? 'archive' : 'inbox', // Move to archive when snoozed
        })
        .eq('id', threadId)

      if (error) {
        console.error('Error snoozing thread:', error)
      } else {
        onSnooze?.(until)
        router.refresh()
      }
    } catch (error) {
      console.error('Error snoozing thread:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCustomSnooze = () => {
    if (!customDate) return
    const [year, month, day] = customDate.split('-').map(Number)
    const [hours, minutes] = customTime.split(':').map(Number)
    const snoozeDate = new Date(year, month - 1, day, hours, minutes)
    handleSnooze(snoozeDate)
  }

  const formatSnoozeDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === now.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    } else {
      return date.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
          isSnoozed
            ? 'bg-orange-500/20 text-orange-400'
            : 'text-gray-400 hover:bg-white/10 hover:text-white'
        }`}
        title={isSnoozed ? `Snoozed until ${formatSnoozeDate(snoozedUntil!)}` : 'Snooze'}
      >
        <Clock className="w-3.5 h-3.5" />
        {isSnoozed && <span>Snoozed</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-white/10">
            <span className="text-xs font-medium text-gray-400 uppercase">Snooze Until</span>
          </div>

          {showCustom ? (
            <div className="p-3 space-y-3">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-white/20"
              />
              <input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-white/20"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCustomSnooze}
                  disabled={!customDate || saving}
                  className="flex-1 px-2 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 rounded text-xs text-orange-400 transition-colors disabled:opacity-50"
                >
                  Snooze
                </button>
                <button
                  onClick={() => setShowCustom(false)}
                  className="px-2 py-1.5 hover:bg-white/10 rounded text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="py-1">
                {getPresets().map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleSnooze(preset.getDate())}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                  >
                    <preset.icon className="w-4 h-4 text-gray-400" />
                    <span className="flex-1 text-left text-sm text-white">{preset.label}</span>
                    <span className="text-xs text-gray-500">
                      {preset.getDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </button>
                ))}
              </div>
              <div className="p-2 border-t border-white/10">
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  Pick date & time
                </button>
              </div>
              {isSnoozed && (
                <div className="p-2 border-t border-white/10">
                  <button
                    onClick={() => handleSnooze(null)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded text-sm text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Remove snooze
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
