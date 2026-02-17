'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Clock, Calendar, Video, ChevronRight, Loader2 } from 'lucide-react'

interface Teacher {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  avatar_url: string | null
  bio: string | null
}

interface Booking {
  id: string
  status: string
  created_at: string
  updated_at: string
  lesson_day_of_week: number | null
  lesson_time: string | null
  lesson_duration_minutes: number | null
  lesson_timezone: string | null
  instructor: Teacher
}

interface PendingRequest {
  id: string
  status: string
  created_at: string
  instructor: Teacher
}

function getTeacherDisplayName(teacher: Teacher): string {
  if (teacher.name) return teacher.name
  if (teacher.first_name || teacher.last_name) {
    return `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim()
  }
  return 'Teacher'
}

function getTeacherInitials(teacher: Teacher): string {
  const name = getTeacherDisplayName(teacher)
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatRecurringSchedule(dayOfWeek: number | null, time: string | null): string {
  if (dayOfWeek === null || !time) return 'Schedule not set'
  const day = DAYS_OF_WEEK[dayOfWeek] || 'Unknown'
  // Format time from HH:MM:SS to readable format
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `Every ${day} at ${hour12}:${minutes} ${ampm}`
}

export default function MyLessonsPage() {
  const [teachers, setTeachers] = useState<Booking[]>([])
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTeachers()
  }, [])

  const fetchTeachers = async () => {
    try {
      const response = await fetch('/api/students/my-teachers')
      const data = await response.json()

      console.log('[my-lessons] API response:', response.status, data)

      if (!response.ok) {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error
        throw new Error(errorMsg || 'Failed to fetch teachers')
      }

      setTeachers(data.teachers || [])
      setPendingRequests(data.pendingRequests || [])
    } catch (err) {
      console.error('[my-lessons] Error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Lessons</h1>
          <p className="text-gray-400 mt-1">Your teachers and upcoming lessons</p>
        </div>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <h3 className="text-amber-400 font-medium mb-3">Pending Requests</h3>
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between bg-black/20 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                    {getTeacherInitials(request.instructor)}
                  </div>
                  <div>
                    <p className="font-medium text-white">{getTeacherDisplayName(request.instructor)}</p>
                    <p className="text-sm text-gray-400">Awaiting approval</p>
                  </div>
                </div>
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teachers Grid */}
      {teachers.length === 0 && pendingRequests.length === 0 ? (
        <div className="text-center py-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
          <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No lessons yet</h3>
          <p className="text-gray-400 mb-4">Your assigned teacher will appear here automatically.</p>
        </div>
      ) : (
        teachers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teachers.map((booking) => (
              <Link
                key={booking.id}
                href={`/dashboard/my-lessons/${booking.id}`}
                className="group bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-lg">
                      {getTeacherInitials(booking.instructor)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-[#CEB466] transition-colors">
                        {getTeacherDisplayName(booking.instructor)}
                      </h3>
                      {booking.instructor.bio && (
                        <p className="text-sm text-gray-400 line-clamp-1">{booking.instructor.bio}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                </div>

                <div className="mt-4 space-y-2">
                  {booking.lesson_day_of_week !== null && booking.lesson_time ? (
                    <>
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Calendar className="w-4 h-4 text-[#CEB466]" />
                        <span>{formatRecurringSchedule(booking.lesson_day_of_week, booking.lesson_time)}</span>
                      </div>
                      {booking.lesson_duration_minutes && (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span>{booking.lesson_duration_minutes} minutes</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-amber-400">
                      <Clock className="w-4 h-4" />
                      <span>Schedule not set</span>
                    </div>
                  )}
                </div>

                {/* Go to Class Button */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.location.href = `/dashboard/my-lessons/${booking.id}`
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-medium rounded-lg transition-all"
                  >
                    <Video className="w-5 h-5" />
                    <span>Go to Class</span>
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
