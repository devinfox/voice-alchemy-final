'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { EmailTemplate, User } from '@/types/database.types'
import { TEMPLATE_CATEGORIES } from '@/lib/email-variables'
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Mail,
  Calendar,
  Filter,
  Send,
} from 'lucide-react'
import { CreateTemplateModal } from './create-template-modal'
import { EditTemplateModal } from './edit-template-modal'
import { TemplatePreviewModal } from './template-preview-modal'
import { SendTemplateModal } from '@/components/send-template-modal'

interface EmailTemplatesClientProps {
  templates: EmailTemplate[]
  currentUser: User | null
}

export function EmailTemplatesClient({
  templates: initialTemplates,
  currentUser,
}: EmailTemplatesClientProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState(initialTemplates)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [previewingTemplate, setPreviewingTemplate] = useState<EmailTemplate | null>(null)
  const [sendingTemplate, setSendingTemplate] = useState<EmailTemplate | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.subject.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory =
      categoryFilter === 'all' || template.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  // Delete template
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    setDeletingId(id)

    try {
      const response = await fetch(`/api/email-templates/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error deleting template:', result.error)
        alert(`Failed to delete template: ${result.error}`)
      } else {
        setTemplates(templates.filter((t) => t.id !== id))
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Failed to delete template: Network error')
    }

    setDeletingId(null)
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Get category badge color
  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      welcome: 'bg-green-500/20 text-green-300 border-green-500/30',
      follow_up: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      paperwork: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      funding: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      closing: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      general: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    }
    return colors[category || 'general'] || colors.general
  }

  // Get category label
  const getCategoryLabel = (category: string | null) => {
    const found = TEMPLATE_CATEGORIES.find((c) => c.value === category)
    return found?.label || 'General'
  }

  // All authenticated users can manage templates
  const canManageTemplates = !!currentUser

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-10 pr-4 py-2 text-sm"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="glass-select pl-10 pr-8 py-2 text-sm appearance-none"
            >
              <option value="all">All Categories</option>
              {TEMPLATE_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Create Button */}
        {canManageTemplates && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        )}
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Mail className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {templates.length === 0 ? 'No templates yet' : 'No templates found'}
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            {templates.length === 0
              ? 'Create your first email template to get started.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {templates.length === 0 && canManageTemplates && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="glass-card p-4 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-white truncate flex-1">
                  {template.name}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full border ${getCategoryColor(
                    template.category
                  )}`}
                >
                  {getCategoryLabel(template.category)}
                </span>
              </div>

              {/* Subject */}
              <p className="text-sm text-gray-400 mb-2 line-clamp-1">
                <span className="text-gray-500">Subject:</span> {template.subject}
              </p>

              {/* Description */}
              {template.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                  {template.description}
                </p>
              )}

              {/* Meta */}
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-auto mb-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(template.created_at)}
                </span>
                {!template.is_active && (
                  <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                    Inactive
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-white/10">
                <button
                  onClick={() => setPreviewingTemplate(template)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                <button
                  onClick={() => setSendingTemplate(template)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
                {canManageTemplates && (
                  <>
                    <button
                      onClick={() => setEditingTemplate(template)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      disabled={deletingId === template.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all ml-auto disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      {deletingId === template.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            router.refresh()
          }}
          currentUserId={currentUser?.id}
        />
      )}

      {editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSuccess={() => {
            setEditingTemplate(null)
            router.refresh()
          }}
        />
      )}

      {previewingTemplate && (
        <TemplatePreviewModal
          template={previewingTemplate}
          onClose={() => setPreviewingTemplate(null)}
        />
      )}

      {sendingTemplate && (
        <SendTemplateModal
          template={sendingTemplate}
          onClose={() => setSendingTemplate(null)}
          onSuccess={() => {
            setSendingTemplate(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
