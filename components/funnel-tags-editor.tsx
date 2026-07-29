"use client"

import { useState } from "react"
import { X, Plus, Tag, Check, Sparkles } from "lucide-react"
import { EXAMPLE_FUNNEL_TAGS } from "@/lib/funnel-matcher"

interface FunnelTagsEditorProps {
  funnelId: string
  currentTags: string[]
  autoEnrollEnabled: boolean
  onSave: (tags: string[], autoEnrollEnabled: boolean) => Promise<void>
  onClose: () => void
}

export function FunnelTagsEditor({
  funnelId,
  currentTags,
  autoEnrollEnabled: initialAutoEnroll,
  onSave,
  onClose,
}: FunnelTagsEditorProps) {
  const [tags, setTags] = useState<string[]>(currentTags)
  const [autoEnrollEnabled, setAutoEnrollEnabled] = useState(initialAutoEnroll)
  const [newTag, setNewTag] = useState("")
  const [saving, setSaving] = useState(false)

  const handleAddTag = (tag: string) => {
    const normalizedTag = tag.trim()
    if (normalizedTag && !tags.some(t => t.toLowerCase() === normalizedTag.toLowerCase())) {
      setTags([...tags, normalizedTag])
    }
    setNewTag("")
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(tags, autoEnrollEnabled)
      onClose()
    } catch (error) {
      console.error("Error saving tags:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to save tags"
      alert(`Failed to save tags: ${errorMessage}`)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] animate-in fade-in zoom-in duration-200">
        <div className="glass-card border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 px-6 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tag className="w-5 h-5 text-yellow-400" />
                <h2 className="text-xl font-semibold text-white">Funnel Matching Tags</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-gray-400 text-sm mt-2">
              Add descriptive tags to help AI match calls to this funnel automatically
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {/* AI Matching Info */}
            <div className="flex items-start gap-3 p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
              <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-purple-400 font-medium text-sm">AI-Powered Matching</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Write natural descriptions like &quot;inbound call from interested lead&quot; or &quot;cold call follow-up needed&quot;.
                  Our AI will semantically match calls based on context, not just exact words.
                </p>
              </div>
            </div>

            {/* Auto-enroll toggle */}
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
              <div>
                <h3 className="text-white font-medium">Auto-enrollment</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Allow AI to draft enrollments for approval when calls match this funnel
                </p>
              </div>
              <button
                onClick={() => setAutoEnrollEnabled(!autoEnrollEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  autoEnrollEnabled ? "bg-green-500" : "bg-gray-600"
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    autoEnrollEnabled ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Current tags */}
            <div>
              <h3 className="text-white font-medium mb-3">Current Tags</h3>
              <div className="flex flex-wrap gap-2 min-h-[40px]">
                {tags.length === 0 ? (
                  <p className="text-gray-500 text-sm">No tags added yet. Add some tags to enable AI matching.</p>
                ) : (
                  tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:bg-white/10 rounded p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Add tag input */}
            <div>
              <h3 className="text-white font-medium mb-3">Add Tag</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      handleAddTag(newTag)
                    }
                  }}
                  placeholder="e.g., inbound call from interested lead..."
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
                />
                <button
                  onClick={() => handleAddTag(newTag)}
                  disabled={!newTag.trim()}
                  className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Example tags */}
            <div>
              <h3 className="text-white font-medium mb-3">Example Tags</h3>
              <p className="text-gray-500 text-xs mb-3">Click to add</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_FUNNEL_TAGS.map((tag) => {
                  const isSelected = tags.some(t => t.toLowerCase() === tag.toLowerCase())
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        if (isSelected) {
                          handleRemoveTag(tags.find(t => t.toLowerCase() === tag.toLowerCase()) || tag)
                        } else {
                          handleAddTag(tag)
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                        isSelected
                          ? "bg-yellow-500/30 text-yellow-400 border border-yellow-500/50"
                          : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-semibold rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Tags"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
