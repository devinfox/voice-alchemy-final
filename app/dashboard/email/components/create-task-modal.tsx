'use client'

import { useState, useEffect } from 'react'
import { X, CheckSquare, Calendar, User, Sparkles, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  threadId: string
  emailId?: string
  subject?: string
  fromEmail?: string
  snippet?: string
}

export function CreateTaskModal({
  isOpen,
  onClose,
  threadId,
  emailId,
  subject,
  fromEmail,
  snippet,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const router = useRouter()

  // Pre-populate fields when opening
  useEffect(() => {
    if (isOpen) {
      // Create a default title based on email subject
      const defaultTitle = subject
        ? `Follow up: ${subject.replace(/^(Re:|Fwd:)\s*/gi, '').trim()}`
        : 'Follow up on email'
      setTitle(defaultTitle)

      // Create description from email content
      const defaultDescription = [
        fromEmail ? `From: ${fromEmail}` : null,
        snippet ? `\n\n${snippet}` : null,
      ].filter(Boolean).join('')
      setDescription(defaultDescription)

      // Default due date to tomorrow
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setDueDate(tomorrow.toISOString().split('T')[0])
    }
  }, [isOpen, subject, fromEmail, snippet])

  const generateWithAI = async () => {
    if (generating) return
    setGenerating(true)

    try {
      const response = await fetch('/api/ai/generate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          email_id: emailId,
          subject,
          snippet,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.title) setTitle(data.title)
        if (data.description) setDescription(data.description)
        if (data.priority) setPriority(data.priority)
      }
    } catch (error) {
      console.error('Error generating task:', error)
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSaving(true)

    try {
      const response = await fetch('/api/tasks/from-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          due_date: dueDate || null,
          priority,
          thread_id: threadId,
          email_id: emailId,
        }),
      })

      if (response.ok) {
        router.refresh()
        onClose()
      } else {
        const error = await response.json()
        console.error('Error creating task:', error)
      }
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-medium text-white">Create Task from Email</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Task Title
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-yellow-500/50"
                required
              />
              <button
                type="button"
                onClick={generateWithAI}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-400 transition-colors disabled:opacity-50"
                title="Generate with AI"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={4}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-yellow-500/50 resize-none"
            />
          </div>

          {/* Due Date & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Due Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-yellow-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-yellow-500/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 rounded-lg text-black font-medium transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckSquare className="w-4 h-4" />
              )}
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
