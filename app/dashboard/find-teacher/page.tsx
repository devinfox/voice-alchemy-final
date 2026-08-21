'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Search, UserPlus, Check, Clock, X, Sparkles } from 'lucide-react'

interface Teacher {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  avatar_url: string | null
  bio: string | null
  relationshipStatus: 'pending' | 'confirmed' | 'cancelled' | null
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

export default function FindTeacherPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchTeachers()
  }, [])

  const fetchTeachers = async (query: string = '') => {
    try {
      setLoading(true)
      const url = query
        ? `/api/students/find-teachers?q=${encodeURIComponent(query)}`
        : '/api/students/find-teachers'

      const response = await fetch(url)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch teachers')
      }

      setTeachers(data.teachers || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchTeachers(searchQuery)
  }

  const handleRequestJoin = async (teacherId: string, teacherName: string) => {
    setRequestingId(teacherId)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/students/request-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send request')
      }

      // Update the teacher's status in the list
      setTeachers((prev) => prev.map((t) => (t.id === teacherId ? { ...t, relationshipStatus: 'pending' } : t)))

      setSuccessMessage(`Request sent to ${teacherName}!`)
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request')
    } finally {
      setRequestingId(null)
    }
  }

  const getStatusButton = (teacher: Teacher) => {
    if (teacher.relationshipStatus === 'confirmed') {
      return (
        <Link
          href={`/dashboard/my-lessons`}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          <Check className="w-4 h-4" />
          <span>Enrolled</span>
        </Link>
      )
    }

    if (teacher.relationshipStatus === 'pending') {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg">
          <Clock className="w-4 h-4" />
          <span>Pending</span>
        </div>
      )
    }

    if (teacher.relationshipStatus === 'cancelled') {
      return (
        <button
          onClick={() => handleRequestJoin(teacher.id, getTeacherDisplayName(teacher))}
          disabled={requestingId === teacher.id}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {requestingId === teacher.id ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          <span>Request Again</span>
        </button>
      )
    }

    return (
      <button
        onClick={() => handleRequestJoin(teacher.id, getTeacherDisplayName(teacher))}
        disabled={requestingId === teacher.id}
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold rounded-xl transition-all shadow-md shadow-[#CEB466]/20 disabled:opacity-50"
      >
        {requestingId === teacher.id ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#171229]"></div>
        ) : (
          <UserPlus className="w-4 h-4 text-[#171229]" />
        )}
        <span>Request to Join</span>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/my-lessons"
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Find a Vocal Mentor</h1>
          <p className="text-gray-400 mt-1">Explore academy teachers and request to join their private studio</p>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teachers by name or specialty..."
            className="w-full pl-11 pr-4 py-3 glass-input rounded-xl text-white placeholder-gray-500"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold rounded-xl transition-all shadow-lg shadow-[#CEB466]/20"
        >
          Search
        </button>
      </form>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-400" />
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/15 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Teachers List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#CEB466]"></div>
        </div>
      ) : teachers.length === 0 ? (
        <div className="text-center py-12 glass-card rounded-2xl border border-white/10 p-8">
          <Search className="w-12 h-12 text-[#CEB466]/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No teachers found</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            {searchQuery
              ? 'Try a different search term or clear the filter.'
              : 'Our faculty members will appear here. Check back shortly or contact support.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teachers.map((teacher) => (
            <div
              key={teacher.id}
              className="glass-card rounded-2xl border border-white/10 p-6 flex flex-col justify-between hover:border-[#CEB466]/40 transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold text-xl flex-shrink-0 shadow-lg shadow-[#CEB466]/20 ring-2 ring-[#CEB466]/30">
                  {getTeacherInitials(teacher)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white text-lg truncate">
                    {getTeacherDisplayName(teacher)}
                  </h3>
                  <p className="text-xs text-[#CEB466] font-medium uppercase tracking-wider mb-2">
                    Vocal Instructor
                  </p>
                  {teacher.bio ? (
                    <p className="text-sm text-gray-300 line-clamp-3 leading-relaxed">
                      {teacher.bio}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      Voice Alchemy Academy Certified Vocal Coach.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  Private 1-on-1 Lessons
                </div>
                {getStatusButton(teacher)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
