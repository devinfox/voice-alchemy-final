'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Image from '@tiptap/extension-image'
import { Indent } from './indent-extension'
import { useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Undo,
  Redo,
  Quote,
  Code,
  Image as ImageIcon,
  IndentIncrease,
  IndentDecrease,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  editorClassName?: string
  autoFocus?: boolean
  disabled?: boolean
}

export interface RichTextEditorRef {
  getHTML: () => string
  getText: (options?: { blockSeparator?: string }) => string
  focus: () => void
  clear: () => void
  setContent: (html: string) => void
  insertContent: (html: string) => void
}

// ============================================================================
// TOOLBAR BUTTON
// ============================================================================

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // Prevent the editor from blurring (losing its selection) when the toolbar
      // button is pressed — otherwise a command can apply to the wrong range.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      // Compact toolbar, but keep an accessible ~36px click target even though the
      // visible icon stays 16px.
      className={`w-9 h-9 inline-flex items-center justify-center rounded transition-colors ${
        active
          ? 'bg-white/20 text-white'
          : 'text-gray-400 hover:text-white hover:bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-white/10 mx-0.5" />
}

// ============================================================================
// TOOLBAR
// ============================================================================

interface EditorToolbarProps {
  editor: Editor | null
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null

  const addLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('Enter URL:', previousUrl)

    if (url === null) return

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    // Add https if no protocol
    const finalUrl = url.match(/^https?:\/\//) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run()
  }, [editor])

  const addImage = useCallback(() => {
    const url = window.prompt('Enter image URL:')
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5 px-2 py-1 border-b border-white/10 flex-wrap">
      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text Formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Indent / Outdent — shifts only the current line(s), unlike the list
          buttons which wrap whole paragraphs. */}
      <ToolbarButton
        onClick={() => editor.chain().focus().outdent().run()}
        title="Decrease indent"
      >
        <IndentDecrease className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().indent().run()}
        title="Increase indent"
      >
        <IndentIncrease className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block Elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <Code className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Link */}
      <ToolbarButton
        onClick={addLink}
        active={editor.isActive('link')}
        title="Add Link"
      >
        <LinkIcon className="w-4 h-4" />
      </ToolbarButton>
      {editor.isActive('link') && (
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Remove Link"
        >
          <Unlink className="w-4 h-4" />
        </ToolbarButton>
      )}

      {/* Image */}
      <ToolbarButton onClick={addImage} title="Add Image">
        <ImageIcon className="w-4 h-4" />
      </ToolbarButton>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  function RichTextEditor(
    {
      content,
      onChange,
      placeholder = 'Write your message...',
      className = '',
      editorClassName = '',
      autoFocus = false,
      disabled = false,
    },
    ref
  ) {
    // Tracks the last HTML the editor itself emitted. Used to ignore the
    // "echo" of our own onChange so we never call setContent mid-typing
    // (which would reset the selection and bounce the caret).
    const lastEmittedRef = useRef<string>(content)

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false, // Disable headings for email
          horizontalRule: false,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-yellow-400 hover:underline',
          },
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass: 'before:content-[attr(data-placeholder)] before:text-gray-500 before:pointer-events-none before:absolute before:left-0 before:top-0',
        }),
        Underline,
        TextStyle,
        Color,
        Image.configure({
          inline: true,
          allowBase64: true,
        }),
        Indent,
      ],
      content,
      editable: !disabled,
      autofocus: autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          class: `email-compose-editor max-w-none focus:outline-none min-h-[180px] p-4 ${editorClassName}`,
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML()
        lastEmittedRef.current = html
        onChange(html)
      },
    })

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() || '',
      getText: (options?: { blockSeparator?: string }) => editor?.getText(options) || '',
      focus: () => editor?.commands.focus(),
      clear: () => editor?.commands.clearContent(),
      setContent: (html: string) => {
        lastEmittedRef.current = html
        editor?.commands.setContent(html)
      },
      insertContent: (html: string) => editor?.commands.insertContent(html),
    }))

    // Sync genuinely-external content changes (draft load, programmatic set).
    // Skip the echo of our own keystrokes — if `content` matches what we last
    // emitted, this update came from the editor itself and re-setting it would
    // jump the caret.
    useEffect(() => {
      if (!editor) return
      if (content === lastEmittedRef.current) return
      if (content === editor.getHTML()) return
      lastEmittedRef.current = content
      editor.commands.setContent(content, { emitUpdate: false })
    }, [content, editor])

    // Cleanup
    useEffect(() => {
      return () => {
        editor?.destroy()
      }
    }, [editor])

    return (
      <div className={`flex flex-col ${className}`}>
        <EditorToolbar editor={editor} />
        <div className="flex-1 overflow-y-auto rounded-b-lg">
          <EditorContent editor={editor} />
        </div>
      </div>
    )
  }
)

// ============================================================================
// SIMPLE EDITOR (No toolbar, for inline use)
// ============================================================================

export const SimpleRichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  function SimpleRichTextEditor(props, ref) {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          horizontalRule: false,
        }),
        Link.configure({
          openOnClick: false,
        }),
        Placeholder.configure({
          placeholder: props.placeholder || 'Write something...',
        }),
        Underline,
      ],
      content: props.content,
      editable: !props.disabled,
      autofocus: props.autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          class: `prose prose-sm max-w-none focus:outline-none min-h-[100px] p-3 ${props.editorClassName || ''}`,
        },
      },
      onUpdate: ({ editor }) => {
        props.onChange(editor.getHTML())
      },
    })

    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() || '',
      getText: (options?: { blockSeparator?: string }) => editor?.getText(options) || '',
      focus: () => editor?.commands.focus(),
      clear: () => editor?.commands.clearContent(),
      setContent: (html: string) => editor?.commands.setContent(html),
      insertContent: (html: string) => editor?.commands.insertContent(html),
    }))

    return (
      <div className={`rounded-lg ${props.className || ''}`}>
        <EditorContent editor={editor} />
      </div>
    )
  }
)

export default RichTextEditor
