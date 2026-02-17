'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, FileText, ChevronDown, ChevronRight } from 'lucide-react'

interface Note {
  id: string
  class_started_at: string
  class_ended_at: string
  content: string
  content_html: string
  published: boolean
  created_at: string
}

function formatNoteDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTimeRange(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt)
  const end = new Date(endedAt)
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  return `${start.toLocaleTimeString('en-US', timeOpts)} – ${end.toLocaleTimeString('en-US', timeOpts)}`
}

export default function NotesArchivePage({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId: bookingId } = use(params)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchNotes()
  }, [bookingId])

  const fetchNotes = async () => {
    try {
      const response = await fetch(`/api/lessons/${bookingId}/notes/archive`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch notes')
      }

      const archivedNotes = data.archivedNotes || []
      setNotes(archivedNotes)

      // Auto-expand the most recent note
      if (archivedNotes.length > 0) {
        setExpandedNotes(new Set([archivedNotes[0].id]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const toggleNote = (noteId: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev)
      if (next.has(noteId)) {
        next.delete(noteId)
      } else {
        next.add(noteId)
      }
      return next
    })
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
      <div className="space-y-4">
        <Link
          href={`/dashboard/my-lessons/${bookingId}`}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to lesson
        </Link>
        <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/my-lessons/${bookingId}`}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Notes Archive</h1>
          <p className="text-gray-400">View past lesson notes</p>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No archived notes yet.</p>
          <p className="text-sm text-gray-500 mt-1">Notes from past classes will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isExpanded = expandedNotes.has(note.id)
            return (
              <div
                key={note.id}
                className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden"
              >
                {/* Accordion Header */}
                <button
                  onClick={() => toggleNote(note.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-[#CEB466]" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <Calendar className={`w-5 h-5 ${isExpanded ? 'text-[#CEB466]' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <h3 className={`font-semibold ${isExpanded ? 'text-[#CEB466]' : 'text-white'}`}>
                        {formatNoteDate(note.class_started_at)}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {formatTimeRange(note.class_started_at, note.class_ended_at)}
                      </p>
                    </div>
                  </div>
                  {!isExpanded && (note.content_html || note.content) && (
                    <p className="text-sm text-gray-500 max-w-md truncate hidden md:block">
                      {note.content_html?.replace(/<[^>]*>/g, '').slice(0, 80) || note.content?.slice(0, 80)}...
                    </p>
                  )}
                </button>

                {/* Accordion Content */}
                {isExpanded && (
                  <div className="border-t border-white/10 p-4">
                    <div className="bg-black/20 rounded-lg p-4 min-h-[200px]">
                      {note.content_html ? (
                        <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: note.content_html }} />
                      ) : note.content ? (
                        <div className="prose prose-invert max-w-none whitespace-pre-wrap">{note.content}</div>
                      ) : (
                        <p className="text-gray-500 italic">No notes were taken during this class.</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      Class ended: {new Date(note.class_ended_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
