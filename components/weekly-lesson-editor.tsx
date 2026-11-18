'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CalendarClock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'

export interface WeeklyLessonOption {
  bookingId: string
  studentName: string
  dayOfWeek: number | null
  time: string | null
  durationMinutes: number | null
  timezone: string | null
}

export interface LessonException {
  originalDate: string
  kind: 'cancelled' | 'rescheduled'
  newDate: string | null
  newTime: string | null
  newDurationMinutes: number | null
}

/** One dated lesson on the calendar, so a single week can be changed. */
export interface LessonOccurrence {
  /** The date the lesson normally falls on (yyyy-MM-dd). */
  originalDate: string
  exception?: LessonException | null
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180]
const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
]
const DEFAULT_TIMEZONE = 'America/New_York'

interface WeeklyLessonEditorProps {
  /** Students whose weekly lesson can be edited here. One entry locks the student. */
  lessons: WeeklyLessonOption[]
  initialBookingId?: string
  /** When set, the editor can change just this one date as well as every week. */
  occurrence?: LessonOccurrence
  onClose: () => void
  onSaved?: () => void
}

/** Modal to set, change or remove a student's weekly lesson slot. */
export function WeeklyLessonEditor({ lessons, initialBookingId, occurrence, onClose, onSaved }: WeeklyLessonEditorProps) {
  const router = useRouter()
  const [bookingId, setBookingId] = useState(initialBookingId ?? lessons[0]?.bookingId ?? '')
  const selected = lessons.find((l) => l.bookingId === bookingId)

  const [day, setDay] = useState<number | null>(selected?.dayOfWeek ?? null)
  const [time, setTime] = useState((selected?.time ?? '').slice(0, 5))
  const [duration, setDuration] = useState(selected?.durationMinutes ?? 60)
  const [timezone, setTimezone] = useState(selected?.timezone || DEFAULT_TIMEZONE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Just this date" (one-off) versus "Every week" (the repeating slot).
  const [scope, setScope] = useState<'once' | 'weekly'>(occurrence ? 'once' : 'weekly')
  const existing = occurrence?.exception ?? null
  const [onceDate, setOnceDate] = useState(existing?.newDate || occurrence?.originalDate || '')
  const [onceTime, setOnceTime] = useState((existing?.newTime || selected?.time || '').slice(0, 5))
  const [onceDuration, setOnceDuration] = useState(existing?.newDurationMinutes ?? selected?.durationMinutes ?? 60)

  // Picking a different student loads that student's current slot.
  const chooseStudent = (id: string) => {
    setBookingId(id)
    const next = lessons.find((l) => l.bookingId === id)
    setDay(next?.dayOfWeek ?? null)
    setTime((next?.time ?? '').slice(0, 5))
    setDuration(next?.durationMinutes ?? 60)
    setTimezone(next?.timezone || DEFAULT_TIMEZONE)
    setError(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const timezones = useMemo(() => {
    const set = new Set(COMMON_TIMEZONES)
    if (timezone) set.add(timezone)
    return [...set]
  }, [timezone])

  const durations = useMemo(
    () => [...new Set([...DURATIONS, duration])].sort((a, b) => a - b),
    [duration]
  )

  const hasSchedule = selected ? selected.dayOfWeek !== null || Boolean(selected.time) : false

  const send = async (body: Record<string, unknown> | null, target: 'weekly' | 'once' = 'weekly', method = 'PATCH') => {
    if (!bookingId) {
      setError('Choose a student first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url =
        target === 'weekly'
          ? `/api/teachers/${bookingId}/schedule`
          : `/api/teachers/${bookingId}/schedule/exceptions${method === 'DELETE' ? `?date=${occurrence?.originalDate}` : ''}`
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not save the lesson time.')
      router.refresh()
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the lesson time.')
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    if (day === null) return setError('Choose a day of the week.')
    if (!time) return setError('Choose a start time.')
    void send({ lessonDayOfWeek: day, lessonTime: time, durationMinutes: duration, timezone })
  }

  const remove = () => void send({ lessonDayOfWeek: null, lessonTime: null })

  // One-off changes for the chosen date only
  const saveOnce = () => {
    if (!occurrence) return
    if (!onceDate) return setError('Choose the new date.')
    if (!onceTime) return setError('Choose the new start time.')
    void send(
      {
        originalDate: occurrence.originalDate,
        kind: 'rescheduled',
        newDate: onceDate,
        newTime: onceTime,
        newDurationMinutes: onceDuration,
      },
      'once',
      'POST'
    )
  }
  const cancelOnce = () => {
    if (!occurrence) return
    void send({ originalDate: occurrence.originalDate, kind: 'cancelled' }, 'once', 'POST')
  }
  const restoreOnce = () => void send(null, 'once', 'DELETE')

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-0" onClick={() => !saving && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weekly lesson"
        className="relative w-full max-w-md space-y-5 overflow-y-auto rounded-3xl border border-gold-400/30 bg-ink-800 p-6 shadow-2xl shadow-black/60 max-h-[calc(100dvh-2rem)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-white font-luxury">Weekly Lesson</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {occurrence && scope === 'once'
                ? `Change only ${formatLongDate(occurrence.originalDate)}${selected ? ` for ${selected.studentName}` : ''}.`
                : selected
                  ? `The lesson repeats every week for ${selected.studentName}.`
                  : 'Choose a student and a weekly time.'}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => !saving && onClose()} aria-label="Close">
            <X />
          </Button>
        </div>

        {occurrence && (
          <Segmented
            aria-label="What to change"
            className="w-full [&>button]:flex-1"
            value={scope}
            onChange={(next) => {
              setScope(next)
              setError(null)
            }}
            options={[
              { value: 'once', label: 'Just this date' },
              { value: 'weekly', label: 'Every week' },
            ]}
          />
        )}

        {occurrence && scope === 'once' ? (
          <>
            {existing && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {existing.kind === 'cancelled'
                  ? 'This date is currently cancelled.'
                  : 'This date has already been moved from its usual time.'}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Move to date</label>
                <input
                  type="date"
                  value={onceDate}
                  onChange={(e) => setOnceDate(e.target.value)}
                  className="glass-input h-10 w-full px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Start time</label>
                  <input
                    type="time"
                    value={onceTime}
                    onChange={(e) => setOnceTime(e.target.value)}
                    className="glass-input h-10 w-full px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Length</label>
                  <select
                    value={onceDuration}
                    onChange={(e) => setOnceDuration(parseInt(e.target.value))}
                    className="w-full glass-select text-sm"
                  >
                    {[...new Set([...DURATIONS, onceDuration])].sort((x, y) => x - y).map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2">
                {existing?.kind !== 'cancelled' && (
                  <Button variant="danger" onClick={cancelOnce} disabled={saving}>
                    Cancel this date
                  </Button>
                )}
                {existing && (
                  <Button onClick={restoreOnce} disabled={saving}>
                    Back to usual time
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose} disabled={saving}>
                  Close
                </Button>
                <Button variant="primary" onClick={saveOnce} disabled={saving}>
                  {saving ? 'Saving…' : 'Move lesson'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
        <div className="space-y-4">
          {lessons.length > 1 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Student</label>
              <select
                value={bookingId}
                onChange={(e) => chooseStudent(e.target.value)}
                className="w-full glass-select text-sm"
              >
                {lessons.map((l) => (
                  <option key={l.bookingId} value={l.bookingId}>
                    {l.studentName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Day</label>
              <select
                value={day ?? ''}
                onChange={(e) => setDay(e.target.value === '' ? null : parseInt(e.target.value))}
                className="w-full glass-select text-sm"
              >
                <option value="">Select day</option>
                {DAYS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Start time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="glass-input h-10 w-full px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Length</label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full glass-select text-sm"
              >
                {durations.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Time zone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full glass-select text-sm"
              >
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          {hasSchedule ? (
            <Button variant="danger" onClick={remove} disabled={saving}>
              Remove weekly lesson
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

interface EditWeeklyLessonButtonProps {
  lessons: WeeklyLessonOption[]
  initialBookingId?: string
  occurrence?: LessonOccurrence
  className?: string
  title?: string
  children?: ReactNode
}

/** Button that opens the weekly lesson editor; usable from server-rendered pages. */
export function EditWeeklyLessonButton({ lessons, initialBookingId, occurrence, className, title, children }: EditWeeklyLessonButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={className}
        title={title}
      >
        {children ?? (
          <>
            <CalendarClock className="w-3.5 h-3.5" />
            <span>Edit time</span>
          </>
        )}
      </button>
      {open && (
        <WeeklyLessonEditor
          lessons={lessons}
          initialBookingId={initialBookingId}
          occurrence={occurrence}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
