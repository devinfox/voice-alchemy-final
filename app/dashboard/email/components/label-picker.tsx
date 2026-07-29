'use client'

import { useState, useEffect, useRef } from 'react'
import { Tag, Plus, Check, X, Loader2 } from 'lucide-react'

interface Label {
  id: string
  name: string
  color: string
}

interface LabelPickerProps {
  threadId: string
  appliedLabelIds?: string[]
  onLabelsChange?: (labelIds: string[]) => void
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
]

export function LabelPicker({ threadId, appliedLabelIds, onLabelsChange }: LabelPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [labels, setLabels] = useState<Label[]>([])
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set(appliedLabelIds || []))
  const [loading, setLoading] = useState(false)
  const [showNewLabel, setShowNewLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load labels and thread labels
  useEffect(() => {
    if (isOpen) {
      loadLabels()
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowNewLabel(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const loadLabels = async () => {
    setLoading(true)
    try {
      // If we don't have appliedLabelIds, fetch them along with labels
      const url = appliedLabelIds ? '/api/email/labels' : `/api/email/labels?thread_id=${threadId}`
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        if (data.labels) {
          // Response includes threadLabels
          setLabels(data.labels)
          setSelectedLabelIds(new Set(data.threadLabels || []))
        } else {
          // Response is just labels array
          setLabels(data)
        }
      }
    } catch (error) {
      console.error('Error loading labels:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleLabel = async (labelId: string) => {
    const isSelected = selectedLabelIds.has(labelId)
    const action = isSelected ? 'remove' : 'add'

    // Optimistic update
    const newSelected = new Set(selectedLabelIds)
    if (isSelected) {
      newSelected.delete(labelId)
    } else {
      newSelected.add(labelId)
    }
    setSelectedLabelIds(newSelected)
    onLabelsChange?.(Array.from(newSelected))

    try {
      const response = await fetch('/api/email/labels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          label_id: labelId,
          action,
        }),
      })

      if (!response.ok) {
        // Revert on error
        setSelectedLabelIds(new Set(appliedLabelIds))
        console.error('Failed to update label')
      }
    } catch (error) {
      // Revert on error
      setSelectedLabelIds(new Set(appliedLabelIds))
      console.error('Error updating label:', error)
    }
  }

  const createLabel = async () => {
    if (!newLabelName.trim()) return

    setSaving(true)
    try {
      const response = await fetch('/api/email/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLabelName.trim(),
          color: newLabelColor,
        }),
      })

      if (response.ok) {
        const label = await response.json()
        setLabels([...labels, label])
        setNewLabelName('')
        setShowNewLabel(false)
      }
    } catch (error) {
      console.error('Error creating label:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        title="Labels"
      >
        <Tag className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-white/10">
            <span className="text-xs font-medium text-gray-400 uppercase">Labels</span>
          </div>

          {loading ? (
            <div className="p-4 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {labels.length === 0 ? (
                <div className="p-3 text-center text-sm text-gray-500">
                  No labels yet
                </div>
              ) : (
                labels.map((label) => {
                  const isSelected = selectedLabelIds.has(label.id)
                  return (
                    <button
                      key={label.id}
                      onClick={() => toggleLabel(label.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1 text-left text-sm text-white">{label.name}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-green-400" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          )}

          <div className="p-2 border-t border-white/10">
            {showNewLabel ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Label name"
                  className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/20"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createLabel()
                    if (e.key === 'Escape') setShowNewLabel(false)
                  }}
                />
                <div className="flex gap-1">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewLabelColor(color)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        newLabelColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createLabel}
                    disabled={saving || !newLabelName.trim()}
                    className="flex-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => setShowNewLabel(false)}
                    className="px-2 py-1.5 hover:bg-white/10 rounded text-gray-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewLabel(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded text-sm text-gray-400 hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create label
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
