'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, Plus, Tag as TagIcon, Trash2, X } from 'lucide-react'
import { TAG_COLORS, TAG_COLOR_KEYS, type EmailTag, type TagColor } from '@/lib/email-tags-shared'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TagChip } from './tag-chip'
import { useTags } from './use-tags'

interface ManageTagsModalProps {
  onClose: () => void
}

/** Create, rename, recolour and delete tags. Counts show how many people carry each. */
export function ManageTagsModal({ onClose }: ManageTagsModalProps) {
  const { tags, loading, error, hint, createTag, updateTag, deleteTag } = useTags()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<TagColor>('gold')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string; color: TagColor } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<EmailTag | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setLocalError(null)
    try {
      await fn()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const create = () =>
    run(async () => {
      if (!newName.trim()) return
      await createTag(newName, newColor)
      setNewName('')
    })

  const saveEdit = () =>
    run(async () => {
      if (!editing) return
      await updateTag(editing.id, { name: editing.name, color: editing.color })
      setEditing(null)
    })

  const confirmDelete = () =>
    run(async () => {
      if (!pendingDelete) return
      await deleteTag(pendingDelete.id)
      setPendingDelete(null)
    })

  const Swatches = ({ value, onPick }: { value: TagColor; onPick: (c: TagColor) => void }) => (
    <div className="flex items-center gap-1.5">
      {TAG_COLOR_KEYS.map(c => (
        <button
          key={c}
          type="button"
          title={TAG_COLORS[c].label}
          onClick={() => onPick(c)}
          className={`w-5 h-5 rounded-full ${TAG_COLORS[c].dot} ring-offset-2 ring-offset-[#1a1433] transition-all ${value === c ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'}`}
        />
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden glass-card modal-solid rounded-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#CEB466]/15 flex items-center justify-center">
              <TagIcon className="w-5 h-5 text-[#CEB466]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tags</h2>
              <p className="text-sm text-gray-400">Labels for leads and students. Funnels can start or stop when a tag is added.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* New tag */}
          <div className="glass-card-subtle rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void create()}
                placeholder="New tag, e.g. Summer workshop 2026"
                maxLength={60}
                className="glass-input flex-1 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy || !newName.trim()}
                className="flex items-center gap-1.5 px-3 py-2 glass-button-gold rounded-lg text-sm font-medium disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </button>
            </div>
            <Swatches value={newColor} onPick={setNewColor} />
          </div>

          {(error || localError) && (
            <p className="text-xs text-red-300">
              {localError || error}
              {!localError && hint && <span className="block text-gray-500 mt-1">{hint}</span>}
            </p>
          )}

          {/* Existing */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : tags.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No tags yet. Add one above, or tag someone from the Leads page.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {tags.map(tag => (
                <li key={tag.id} className="py-2.5">
                  {editing?.id === tag.id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={editing.name}
                          onChange={e => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') void saveEdit()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          maxLength={60}
                          autoFocus
                          className="glass-input flex-1 px-3 py-1.5 text-sm"
                        />
                        <button type="button" onClick={() => void saveEdit()} disabled={busy} className="p-2 rounded-lg text-emerald-300 hover:bg-emerald-500/10">
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <Swatches value={editing.color} onPick={c => setEditing({ ...editing, color: c })} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <TagChip name={tag.name} color={tag.color} size="md" />
                      <span className="text-xs text-gray-500 flex-1">
                        {tag.count === 1 ? '1 person' : `${tag.count || 0} people`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: tag.id, name: tag.name, color: tag.color })}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                        title="Rename or recolour"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(tag)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Delete tag"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Delete the tag “${pendingDelete?.name}”?`}
        message={`It comes off ${pendingDelete?.count === 1 ? '1 person' : `${pendingDelete?.count || 0} people`} and any funnel that starts or stops on it will no longer listen for it. Nobody is removed from a funnel they are already in.`}
        confirmText={busy ? 'Deleting…' : 'Delete tag'}
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => !busy && setPendingDelete(null)}
      />
    </div>
  )
}
