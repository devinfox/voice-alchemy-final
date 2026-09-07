'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmailTemplate, Profile } from '@/types/database.types'
import { TEMPLATE_CATEGORIES, getCategoryLabel, getCategoryStyle } from '@/lib/email-variables'
import { Search, Plus, Eye, Pencil, Trash2, Mail, Send } from 'lucide-react'
import { CreateTemplateModal } from './create-template-modal'
import { EditTemplateModal } from './edit-template-modal'
import { TemplatePreviewModal } from './template-preview-modal'
import { SendTemplateModal } from '@/components/send-template-modal'
import { OverflowMenu } from '@/components/ui/overflow-menu'
import { TemplateThumbnail } from './template-thumbnail'

interface EmailTemplatesClientProps {
  templates: EmailTemplate[]
  currentUser: Profile | null
}

const SEARCH_THRESHOLD = 6

export function EmailTemplatesClient({ templates: initialTemplates, currentUser }: EmailTemplatesClientProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState(initialTemplates)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [previewingTemplate, setPreviewingTemplate] = useState<EmailTemplate | null>(null)
  const [sendingTemplate, setSendingTemplate] = useState<EmailTemplate | null>(null)

  const canManage = !!currentUser
  const showFilters = templates.length > SEARCH_THRESHOLD

  const filteredTemplates = templates.filter((template) => {
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q || template.name.toLowerCase().includes(q) || template.subject.toLowerCase().includes(q)
    const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleDelete = async (template: EmailTemplate) => {
    if (!confirm(`Delete "${template.name}"? Any funnel step using it will need a new email.`)) return
    try {
      const response = await fetch(`/api/email-templates/${template.id}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) {
        alert(`Could not delete: ${result.error}`)
      } else {
        setTemplates((prev) => prev.filter((t) => t.id !== template.id))
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Could not delete the email. Please try again.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-1 gap-2 items-center">
          {showFilters && (
            <>
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search emails"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="glass-input w-full pl-10 pr-4 py-2 text-sm"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="glass-select px-3 py-2 text-sm"
              >
                <option value="all">All types</option>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              New email
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {filteredTemplates.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Mail className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-white mb-1">
            {templates.length === 0 ? 'No emails yet' : 'Nothing matches'}
          </h3>
          <p className="text-gray-400 text-sm">
            {templates.length === 0
              ? 'Add the standard academy emails above, or write your own.'
              : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="glass-card overflow-hidden flex flex-col group"
            >
              {/* Design preview: click to edit */}
              <button
                type="button"
                onClick={() => (canManage ? setEditingTemplate(template) : setPreviewingTemplate(template))}
                className="relative block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                aria-label={canManage ? `Edit ${template.name}` : `Preview ${template.name}`}
              >
                <TemplateThumbnail template={template} className="aspect-[3/4] w-full" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 text-white text-sm">
                    <Pencil className="w-3.5 h-3.5" />
                    {canManage ? 'Edit design' : 'Preview'}
                  </span>
                </div>
                {!template.is_active && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-black/70 text-gray-300">
                    Hidden from funnels
                  </span>
                )}
              </button>

              {/* Details */}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => (canManage ? setEditingTemplate(template) : setPreviewingTemplate(template))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <h3 className="font-semibold text-white truncate group-hover:text-yellow-400 transition-colors">{template.name}</h3>
                    <p className="text-sm text-gray-400 truncate mt-0.5">{template.subject}</p>
                  </button>
                  {canManage && (
                    <OverflowMenu
                      items={[
                        { label: 'Preview', icon: <Eye className="w-4 h-4" />, onSelect: () => setPreviewingTemplate(template) },
                        { label: 'Edit', icon: <Pencil className="w-4 h-4" />, onSelect: () => setEditingTemplate(template) },
                        { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => handleDelete(template) },
                      ]}
                    />
                  )}
                </div>

                {template.description && (
                  <p className="text-xs text-gray-500 line-clamp-2">{template.description}</p>
                )}

                <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                  <span className={`px-2 py-0.5 text-[11px] rounded-full border ${getCategoryStyle(template.category)}`}>
                    {getCategoryLabel(template.category)}
                  </span>
                  <button
                    onClick={() => setSendingTemplate(template)}
                    className="flex items-center gap-1.5 px-3 py-1.5 glass-button-gold rounded-lg text-sm font-medium"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
        <TemplatePreviewModal template={previewingTemplate} onClose={() => setPreviewingTemplate(null)} />
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
