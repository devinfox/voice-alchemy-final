'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Music2, Sparkles, Clock, Star, Trash2, Search, Filter } from 'lucide-react'

interface SongwritingDocument {
  id: string
  title: string
  vibe: string | null
  mood: string | null
  genre: string | null
  status: string
  is_favorite: boolean
  word_count: number
  created_at: string
  updated_at: string
}

export default function SongwritingPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<SongwritingDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/songwriting')
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const createNewSong = async () => {
    setIsCreating(true)
    try {
      const response = await fetch('/api/songwriting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Song' })
      })
      const data = await response.json()
      if (data.document) {
        router.push(`/dashboard/songwriting/${data.document.id}`)
      }
    } catch (error) {
      console.error('Error creating document:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const deleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this song?')) return

    try {
      await fetch(`/api/songwriting/${id}`, { method: 'DELETE' })
      setDocuments(docs => docs.filter(d => d.id !== id))
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const toggleFavorite = async (id: string, currentValue: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/songwriting/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !currentValue })
      })
      setDocuments(docs => docs.map(d =>
        d.id === id ? { ...d, is_favorite: !currentValue } : d
      ))
    } catch (error) {
      console.error('Error toggling favorite:', error)
    }
  }

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.vibe?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.mood?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = !filterStatus || doc.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'in_progress': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7] via-[#7c3aed] to-[#4f46e5] flex items-center justify-center shadow-lg shadow-[#a855f7]/20">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            Songwriting Studio
          </h1>
          <p className="text-slate-400 mt-1">Write songs with AI-powered coaching from a Grammy-level songwriter</p>
        </div>
        <button
          onClick={createNewSong}
          disabled={isCreating}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white font-semibold rounded-xl transition-all shadow-lg shadow-[#a855f7]/20 disabled:opacity-50"
        >
          {isCreating ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Plus className="w-5 h-5" />
          )}
          New Song
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search songs..."
            className="w-full pl-10 pr-4 py-2.5 glass-input text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-slate-400" />
          {['all', 'draft', 'in_progress', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status === 'all' ? null : status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                (status === 'all' && !filterStatus) || filterStatus === status
                  ? 'bg-[#a855f7]/20 text-[#d8b4fe] border border-[#a855f7]/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-[#a855f7]/30 border-t-[#a855f7] rounded-full animate-spin" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto mb-4 bg-[#a855f7]/10 rounded-full flex items-center justify-center border border-[#a855f7]/20">
            <Music2 className="w-10 h-10 text-[#d8b4fe]" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {searchQuery ? 'No songs found' : 'Start Your Songwriting Journey'}
          </h3>
          <p className="text-slate-400 max-w-md mx-auto mb-6">
            {searchQuery
              ? 'Try adjusting your search terms'
              : 'Write your first song with guidance from an AI coach trained on Grammy-winning techniques.'}
          </p>
          {!searchQuery && (
            <button
              onClick={createNewSong}
              disabled={isCreating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white font-semibold rounded-xl shadow-lg shadow-[#a855f7]/20"
            >
              <Sparkles className="w-5 h-5" />
              Write Your First Song
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              onClick={() => router.push(`/dashboard/songwriting/${doc.id}`)}
              className="group glass-card-subtle rounded-2xl p-5 cursor-pointer transition-all border-white/[0.08] hover:border-[#a855f7]/35 hover:bg-white/[0.06]"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7]/25 to-[#4f46e5]/25 border border-[#a855f7]/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#d8b4fe]" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => toggleFavorite(doc.id, doc.is_favorite, e)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      doc.is_favorite ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${doc.is_favorite ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => deleteDocument(doc.id, e)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-white mb-2 truncate">{doc.title}</h3>

              <div className="flex flex-wrap gap-2 mb-3">
                {doc.vibe && (
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                    {doc.vibe}
                  </span>
                )}
                {doc.mood && (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                    {doc.mood}
                  </span>
                )}
                {doc.genre && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                    {doc.genre}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className={`px-2 py-0.5 rounded-full border ${getStatusColor(doc.status)}`}>
                  {doc.status.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-3 text-slate-500">
                  <span>{doc.word_count} words</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(doc.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
