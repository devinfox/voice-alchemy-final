'use client'

import { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Video,
  Calendar as CalendarIcon,
  User,
} from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import Link from 'next/link'

interface User {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
}

interface Booking {
  id: string
  status: string
  lesson_day_of_week: number | null
  lesson_time: string | null
  lesson_duration_minutes: number | null
  lesson_timezone: string | null
  student: User | User[]
  instructor: User | User[]
}

interface CalendarEvent {
  booking: Booking
  date: Date
  time: string
}

interface CalendarViewProps {
  bookings: Booking[]
  currentUser: { id: string; first_name: string; last_name: string; name: string; role: string }
  userTimezone: string
  isTeacher: boolean
}

// Helper to get the first item from array or the object itself
function getUser(data: User | User[] | null): User | null {
  if (!data) return null
  if (Array.isArray(data)) return data[0] || null
  return data
}

function getUserDisplayName(user: User | null): string {
  if (!user) return 'Unknown'
  if (user.name) return user.name
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim()
  }
  return 'Unknown'
}

export function CalendarView({ bookings, currentUser, userTimezone, isTeacher }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')

  // Debug: log bookings on client
  console.log('[Calendar Client] Received bookings:', bookings.length, bookings)

  // Generate recurring events for the visible date range
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {}

    // Get the date range we need to generate events for (extend beyond visible to catch edge cases)
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const rangeStart = startOfWeek(addDays(monthStart, -7))
    const rangeEnd = endOfWeek(addDays(monthEnd, 7))

    bookings.forEach((booking) => {
      // Skip bookings without recurring schedule
      if (booking.lesson_day_of_week === null || !booking.lesson_time) return

      // Generate events for each occurrence in the date range
      let day = rangeStart
      while (day <= rangeEnd) {
        // Check if this day matches the lesson day of week
        if (day.getDay() === booking.lesson_day_of_week) {
          const dateKey = format(day, 'yyyy-MM-dd')
          if (!grouped[dateKey]) {
            grouped[dateKey] = []
          }
          grouped[dateKey].push({
            booking,
            date: day,
            time: booking.lesson_time,
          })
        }
        day = addDays(day, 1)
      }
    })
    return grouped
  }, [bookings, currentDate])

  // Get events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return []
    const dateKey = format(selectedDate, 'yyyy-MM-dd')
    return eventsByDate[dateKey] || []
  }, [selectedDate, eventsByDate])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const startDate = startOfWeek(monthStart)
    const endDate = endOfWeek(monthEnd)

    const days: Date[] = []
    let day = startDate
    while (day <= endDate) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentDate])

  // Week view days
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate)
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i))
    }
    return days
  }, [currentDate])

  const navigatePrev = () => {
    if (view === 'month') {
      setCurrentDate(subMonths(currentDate, 1))
    } else {
      setCurrentDate(addDays(currentDate, -7))
    }
  }

  const navigateNext = () => {
    if (view === 'month') {
      setCurrentDate(addMonths(currentDate, 1))
    } else {
      setCurrentDate(addDays(currentDate, 7))
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  // Format time from HH:MM:SS to readable format
  const formatLessonTime = (time: string) => {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lesson Calendar</h1>
          <p className="text-gray-400 mt-1">Your scheduled lessons</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-1 rounded-xl">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                view === 'month' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                view === 'week' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Week
            </button>
          </div>
          <button
            onClick={goToToday}
            className="px-4 py-2 text-sm bg-white/10 rounded-xl text-gray-300 hover:text-white transition-all"
          >
            Today
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={navigatePrev}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-blue-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-white">
              {view === 'month'
                ? format(currentDate, 'MMMM yyyy')
                : `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`}
            </h2>
            <button
              onClick={navigateNext}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-blue-400"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-400 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          {view === 'month' ? (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayEvents = eventsByDate[dateKey] || []
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const isCurrentMonth = isSameMonth(day, currentDate)

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`min-h-[80px] p-1.5 rounded-xl text-left transition-all ${
                      isSelected ? 'bg-blue-500/20 border border-blue-500/50' : 'hover:bg-white/5'
                    } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                  >
                    <div
                      className={`text-sm font-medium mb-1 ${
                        isToday(day)
                          ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center'
                          : 'text-gray-300 px-1'
                      }`}
                    >
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event, idx) => (
                        <div
                          key={`${event.booking.id}-${idx}`}
                          className="text-xs px-1.5 py-0.5 rounded truncate bg-green-500/20 text-green-300"
                        >
                          {formatLessonTime(event.time)}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-gray-500 px-1">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            /* Week View */
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, index) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayEvents = eventsByDate[dateKey] || []
                const isSelected = selectedDate && isSameDay(day, selectedDate)

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`min-h-[300px] p-2 rounded-xl text-left transition-all ${
                      isSelected ? 'bg-blue-500/20 border border-blue-500/50' : 'hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`text-sm font-medium mb-2 ${
                        isToday(day) ? 'bg-blue-600 text-white px-2 py-1 rounded-lg inline-block' : 'text-gray-300'
                      }`}
                    >
                      {format(day, 'EEE d')}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((event, idx) => (
                        <div key={`${event.booking.id}-${idx}`} className="text-xs p-1.5 rounded-lg bg-green-500/20 text-green-300">
                          <div className="font-medium truncate">{formatLessonTime(event.time)}</div>
                          <div className="truncate">
                            {isTeacher
                              ? getUserDisplayName(getUser(event.booking.student))
                              : getUserDisplayName(getUser(event.booking.instructor))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Day Lessons */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4 text-blue-400" />
            </div>
            {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a day'}
          </h3>

          {selectedDateEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                <CalendarIcon className="w-8 h-8 opacity-50" />
              </div>
              <p>No lessons scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateEvents
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((event, idx) => {
                  const otherUser = isTeacher ? getUser(event.booking.student) : getUser(event.booking.instructor)
                  const lessonPath = isTeacher
                    ? `/dashboard/students/${event.booking.id}`
                    : `/dashboard/my-lessons/${event.booking.id}`

                  return (
                    <Link key={`${event.booking.id}-${idx}`} href={lessonPath} className="block">
                      <div className="bg-white/5 hover:bg-white/10 transition-colors p-4 rounded-xl">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold">
                            {getUserDisplayName(otherUser).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white">{getUserDisplayName(otherUser)}</span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                              <Clock className="w-3 h-3" />
                              <span>
                                {formatLessonTime(event.time)}
                                {event.booking.lesson_duration_minutes && ` (${event.booking.lesson_duration_minutes} min)`}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-green-400">
                              <Video className="w-3 h-3" />
                              <span>Weekly Lesson</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
