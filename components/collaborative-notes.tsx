'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import Placeholder from '@tiptap/extension-placeholder'
import * as Y from 'yjs'
import { YjsSupabaseProvider, AwarenessUser } from '@/lib/yjs-supabase-provider'
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote, Undo, Redo, Users, Loader2, Check } from 'lucide-react'

interface CollaborativeNotesProps {
  noteId: string
  userId: string
  userName: string
  userColor?: string
  readOnly?: boolean
  onSynced?: () => void
}

export function CollaborativeNotes({
  noteId,
  userId,
  userName,
  userColor,
  readOnly = false,
  onSynced,
}: CollaborativeNotesProps) {
  const [ydoc] = useState(() => new Y.Doc())
  const [provider, setProvider] = useState<YjsSupabaseProvider | null>(null)
  const [connectedUsers, setConnectedUsers] = useState<Map<number, AwarenessUser>>(new Map())
  const [synced, setSynced] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)

  // Initialize provider
  useEffect(() => {
    const newProvider = new YjsSupabaseProvider(ydoc, {
      documentId: noteId,
      userId,
      userName,
      userColor,
      onSynced: () => {
        setSynced(true)
        onSynced?.()
      },
      onAwarenessUpdate: (users) => {
        setConnectedUsers(new Map(users))
      },
    })

    setProvider(newProvider)

    return () => {
      newProvider.destroy()
    }
  }, [noteId, userId, userName, userColor, ydoc, onSynced])

  // Set up editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Yjs handles history - disable the built-in history extension
        // @ts-expect-error - history option exists but types may not reflect it
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
        field: 'prosemirror',
      }),
      CollaborationCursor.configure({
        provider: provider as unknown as { awareness: { on: () => void } },
        user: {
          name: userName,
          color: userColor || '#3B82F6',
        },
      }),
      Placeholder.configure({
        placeholder: 'Start taking notes...',
      }),
    ],
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[200px] p-4',
      },
    },
    onUpdate: () => {
      setSaving(true)
      // Debounced save indicator
      setTimeout(() => setSaving(false), 1500)
    },
  }, [provider, readOnly])

  // Keep ref in sync with editor instance (must be in useEffect, not during render)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Handle cursor position updates for awareness
  useEffect(() => {
    if (!editor || !provider) return

    const handleSelectionChange = () => {
      const { from, to } = editor.state.selection
      provider.setAwareness({
        cursor: { anchor: from, head: to },
      })
    }

    editor.on('selectionUpdate', handleSelectionChange)

    return () => {
      editor.off('selectionUpdate', handleSelectionChange)
    }
  }, [editor, provider])

  const handleSave = useCallback(async () => {
    if (provider) {
      setSaving(true)
      await provider.forceSave()
      setSaving(false)
    }
  }, [provider])

  if (!synced) {
    return (
      <div className="flex items-center justify-center h-64 bg-black/20 rounded-lg">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Connecting to collaborative session...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="collaborative-notes">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-between bg-black/30 rounded-t-lg border border-white/10 border-b-0 px-2 py-1">
          <div className="flex items-center gap-1">
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleBold().run()}
              isActive={editor?.isActive('bold')}
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              isActive={editor?.isActive('italic')}
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </ToolbarButton>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor?.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor?.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </ToolbarButton>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              isActive={editor?.isActive('bulletList')}
              title="Bullet List"
            >
              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              isActive={editor?.isActive('orderedList')}
              title="Numbered List"
            >
              <ListOrdered className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              isActive={editor?.isActive('blockquote')}
              title="Quote"
            >
              <Quote className="w-4 h-4" />
            </ToolbarButton>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              title="Undo"
            >
              <Undo className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              title="Redo"
            >
              <Redo className="w-4 h-4" />
            </ToolbarButton>
          </div>

          <div className="flex items-center gap-3">
            {/* Saving indicator */}
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {saving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">Saved</span>
                </>
              )}
            </div>

            {/* Connected users */}
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4 text-gray-500" />
              <div className="flex -space-x-2">
                {Array.from(connectedUsers.entries()).map(([clientId, user]) => (
                  <div
                    key={clientId}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900"
                    style={{ backgroundColor: user.color }}
                    title={user.name}
                  >
                    {user.name[0]}
                  </div>
                ))}
                {/* Add current user */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900"
                  style={{ backgroundColor: userColor || '#3B82F6' }}
                  title={`${userName} (you)`}
                >
                  {userName[0]}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className={`bg-black/20 border border-white/10 ${!readOnly ? 'rounded-b-lg border-t-0' : 'rounded-lg'}`}>
        <EditorContent editor={editor} />
      </div>

      {/* Collaboration cursor styles */}
      <style jsx global>{`
        .collaboration-cursor__caret {
          position: relative;
          margin-left: -1px;
          margin-right: -1px;
          border-left: 1px solid;
          border-right: 1px solid;
          word-break: normal;
          pointer-events: none;
        }

        .collaboration-cursor__label {
          position: absolute;
          top: -1.4em;
          left: -1px;
          font-size: 12px;
          font-style: normal;
          font-weight: 600;
          line-height: normal;
          user-select: none;
          padding: 0.1rem 0.3rem;
          border-radius: 3px 3px 3px 0;
          white-space: nowrap;
        }

        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #6b7280;
          pointer-events: none;
          height: 0;
        }

        .ProseMirror {
          min-height: 200px;
        }

        .ProseMirror:focus {
          outline: none;
        }

        .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .ProseMirror p {
          margin-bottom: 0.5rem;
        }

        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .ProseMirror blockquote {
          border-left: 3px solid #4b5563;
          padding-left: 1rem;
          margin-left: 0;
          color: #9ca3af;
        }
      `}</style>
    </div>
  )
}

// Toolbar button component
function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded transition-colors ${
        isActive
          ? 'bg-white/20 text-white'
          : disabled
          ? 'text-gray-600 cursor-not-allowed'
          : 'text-gray-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
