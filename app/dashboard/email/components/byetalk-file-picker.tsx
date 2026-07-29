'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Loader2,
  FileText,
  Table2,
  FolderOpen,
  Presentation as PresentationIcon,
} from 'lucide-react'

interface ByeTalkListItem {
  kind: 'document' | 'sheet' | 'presentation' | 'project_file'
  id: string
  name: string
  updated_at: string
}

interface SelectedByeTalkEntry {
  item: ByeTalkListItem
  format: 'xlsx' | 'csv'
}

interface ByeTalkFilePickerProps {
  isOpen: boolean
  onClose: () => void
  onAttach: (files: File[]) => void
}

export function ByeTalkFilePicker({ isOpen, onClose, onAttach }: ByeTalkFilePickerProps) {
  const [byeTalkFiles, setByeTalkFiles] = useState<ByeTalkListItem[]>([])
  const [byeTalkSearch, setByeTalkSearch] = useState('')
  const [byeTalkLoading, setByeTalkLoading] = useState(false)
  const [selectedByeTalk, setSelectedByeTalk] = useState<Record<string, SelectedByeTalkEntry>>({})
  const [attachingByeTalk, setAttachingByeTalk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setByeTalkSearch('')
      setSelectedByeTalk({})
      return
    }

    let canceled = false
    const controller = new AbortController()

    const fetchByeTalkFiles = async () => {
      setByeTalkLoading(true)
      try {
        const params = new URLSearchParams()
        if (byeTalkSearch.trim()) params.set('q', byeTalkSearch.trim())
        params.set('limit', '120')
        const response = await fetch(`/api/email/byetalk-files?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = await response.json()
        if (!canceled && response.ok) {
          setByeTalkFiles(data.files || [])
        }
      } catch (err) {
        if (!canceled) {
          console.error('Failed to fetch ByeTalk files:', err)
        }
      } finally {
        if (!canceled) setByeTalkLoading(false)
      }
    }

    fetchByeTalkFiles()
    return () => {
      canceled = true
      controller.abort()
    }
  }, [isOpen, byeTalkSearch])

  const toggleByeTalkSelection = (item: ByeTalkListItem) => {
    setSelectedByeTalk((prev) => {
      const key = `${item.kind}:${item.id}`
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return {
        ...prev,
        [key]: { item, format: 'xlsx' },
      }
    })
  }

  const setByeTalkSheetFormat = (key: string, format: 'xlsx' | 'csv') => {
    setSelectedByeTalk((prev) => {
      const current = prev[key]
      if (!current) return prev
      return {
        ...prev,
        [key]: { ...current, format },
      }
    })
  }

  const createFileFromBase64 = (base64: string, filename: string, contentType: string) => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new File([bytes], filename, { type: contentType || 'application/octet-stream' })
  }

  const handleAttachByeTalkFiles = async () => {
    const selectedEntries = Object.values(selectedByeTalk)
    if (selectedEntries.length === 0) return

    setAttachingByeTalk(true)
    setError(null)
    try {
      const newFiles: File[] = []
      for (const entry of selectedEntries) {
        const payload: Record<string, string> = {
          kind: entry.item.kind,
          id: entry.item.id,
        }
        if (entry.item.kind === 'sheet') {
          payload.format = entry.format
        }

        const response = await fetch('/api/email/byetalk-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || `Failed to export ${entry.item.name}`)
        }

        const file = createFileFromBase64(data.contentBase64, data.filename, data.contentType)
        newFiles.push(file)
      }

      if (newFiles.length > 0) {
        onAttach(newFiles)
      }

      setSelectedByeTalk({})
      onClose()
    } catch (err) {
      console.error('Failed to attach ByeTalk files:', err)
      setError(err instanceof Error ? err.message : 'Failed to attach ByeTalk files')
    } finally {
      setAttachingByeTalk(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Attach ByeTalk Files</h3>
            <p className="text-xs text-gray-400">Docs export as DOCX, presentations as PDF, sheets as CSV/XLSX.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="px-5 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="border-b border-white/10 px-5 py-3">
          <input
            type="text"
            value={byeTalkSearch}
            onChange={(e) => setByeTalkSearch(e.target.value)}
            placeholder="Search docs, sheets, presentations..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto px-5 py-3">
          {byeTalkLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading files...
            </div>
          ) : byeTalkFiles.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">No matching ByeTalk files found.</div>
          ) : (
            <div className="space-y-2">
              {byeTalkFiles.map((item) => {
                const key = `${item.kind}:${item.id}`
                const selected = !!selectedByeTalk[key]
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      selected ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <button
                      onClick={() => toggleByeTalkSelection(item)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={selected}
                        className="h-4 w-4 rounded border-white/20 bg-white/10 text-cyan-400"
                      />
                      {item.kind === 'sheet' ? (
                        <Table2 className="h-4 w-4 text-green-400" />
                      ) : item.kind === 'presentation' ? (
                        <PresentationIcon className="h-4 w-4 text-orange-400" />
                      ) : item.kind === 'project_file' ? (
                        <FolderOpen className="h-4 w-4 text-indigo-400" />
                      ) : (
                        <FileText className="h-4 w-4 text-blue-400" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{item.name}</p>
                        <p className="text-xs capitalize text-gray-500">{item.kind}</p>
                      </div>
                    </button>

                    {item.kind === 'sheet' && selected && (
                      <select
                        value={selectedByeTalk[key]?.format || 'xlsx'}
                        onChange={(e) => setByeTalkSheetFormat(key, e.target.value === 'csv' ? 'csv' : 'xlsx')}
                        className="ml-3 rounded-lg border border-white/15 bg-[#111827] px-2 py-1 text-xs text-white"
                      >
                        <option value="xlsx">XLSX</option>
                        <option value="csv">CSV</option>
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <span className="text-xs text-gray-400">
            {Object.keys(selectedByeTalk).length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleAttachByeTalkFiles}
              disabled={attachingByeTalk || Object.keys(selectedByeTalk).length === 0}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-400 disabled:opacity-50"
            >
              {attachingByeTalk ? 'Attaching...' : 'Attach'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
