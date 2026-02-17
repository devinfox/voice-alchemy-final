'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, UserPlus, Check, Clock, X } from 'lucide-react'

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
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        {requestingId === teacher.id ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        ) : (
          <UserPlus className="w-4 h-4" />
        )}
        <span>Request to Join</span>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/my-lessons" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Find a Teacher</h1>
          <p className="text-gray-400 mt-1">Search for teachers and request to join their lessons</p>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Search
        </button>
      </form>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500 text-green-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Teachers List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : teachers.length === 0 ? (
        <div className="text-center py-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
          <Search className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No teachers found</h3>
          <p className="text-gray-400">{searchQuery ? 'Try a different search term.' : 'No teachers are available yet.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {teachers.map((teacher) => (
            <div key={teacher.id} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl">
                    {getTeacherInitials(teacher)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-lg">{getTeacherDisplayName(teacher)}</h3>
                    {teacher.bio && <p className="text-gray-400 line-clamp-2">{teacher.bio}</p>}
                  </div>
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
