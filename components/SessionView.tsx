'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import VideoWebRTC, { VideoWebRTCHandle } from './VideoWebRTC'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { YjsSupabaseProvider, AwarenessUser } from '@/lib/yjs-supabase-provider'
import { Trash2, ChevronDown, ChevronRight, Video, PlayCircle, StopCircle, Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote, Undo, Redo } from 'lucide-react'

type Props = {
  studentId: string
  bookingId: string
  isAdmin?: boolean
  currentUser?: { id: string; name: string }
}

export default function SessionView({ studentId, bookingId, isAdmin = false, currentUser }: Props) {
  const supabase = getSupabaseClient()

  // --- Core State ---
  const [active, setActive] = useState(false)
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [archive, setArchive] = useState<Array<{ id: string; class_started_at: string; class_ended_at: string }>>([])

  // --- Yjs refs (not state - avoids parent re-renders) ---
  const yDocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<YjsSupabaseProvider | null>(null)
  const [yDocState, setYDocState] = useState<Y.Doc | null>(null)
  const [providerState, setProviderState] = useState<YjsSupabaseProvider | null>(null)
  const [providerReady, setProviderReady] = useState(false)

  // Editor ref for startClass/endClass to use
  const editorRef = useRef<Editor | null>(null)

  // --- Video Ref ---
  const videoRef = useRef<VideoWebRTCHandle>(null)

  // --- Mini-player State & Refs ---
  const videoWrapperRef = useRef<HTMLDivElement>(null)
  const videoStickyRef = useRef<HTMLDivElement>(null)
  const [isMiniPlayer, setIsMiniPlayer] = useState(false)
  const videoPlaceholderHeight = useRef(0)

  // -- Draggable & Resizable Mini-player State --
  const defaultMiniSize = useMemo(() => ({ width: 320, height: 180 }), [])
  const [miniSize, setMiniSize] = useState(defaultMiniSize)
  const [miniPosition, setMiniPosition] = useState({ bottom: 16, right: 16 })
  const interactionRef = useRef<{
    type: 'drag' | 'resize'
    startX: number
    startY: number
    initialBottom: number
    initialRight: number
    initialWidth: number
    initialHeight: number
  } | null>(null)

  // --- Drag & Resize Logic ---
  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!interactionRef.current) return
      const { type, startX, startY, initialBottom, initialRight, initialWidth, initialHeight } =
        interactionRef.current
      const dx = event.clientX - startX
      const dy = event.clientY - startY

      if (type === 'drag') {
        const newRight = initialRight - dx
        const newBottom = initialBottom - dy
        const clampedRight = Math.max(16, Math.min(newRight, window.innerWidth - miniSize.width - 16))
        const clampedBottom = Math.max(16, Math.min(newBottom, window.innerHeight - miniSize.height - 80))
        setMiniPosition({ bottom: clampedBottom, right: clampedRight })
      } else if (type === 'resize') {
        const newWidth = initialWidth + dx
        const newHeight = initialHeight + dy
        const clampedWidth = Math.max(200, Math.min(newWidth, 500))
        const clampedHeight = Math.max(120, Math.min(newHeight, 300))
        setMiniSize({ width: clampedWidth, height: clampedHeight })
      }
    },
    [miniSize.width, miniSize.height]
  )

  const onPointerUp = useCallback(() => {
    document.body.classList.remove('no-select')
    window.removeEventListener('pointermove', onPointerMove)
    interactionRef.current = null
  }, [onPointerMove])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, type: 'drag' | 'resize') => {
      event.stopPropagation()
      event.preventDefault()
      interactionRef.current = { type, startX: event.clientX, startY: event.clientY, initialBottom: miniPosition.bottom, initialRight: miniPosition.right, initialWidth: miniSize.width, initialHeight: miniSize.height }
      document.body.classList.add('no-select')
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp, { once: true })
    },
    [miniPosition, miniSize, onPointerMove, onPointerUp]
  )

  // --- Scroll Behavior ---
  useEffect(() => {
    const stickyEl = videoStickyRef.current
    const wrapperEl = videoWrapperRef.current
    if (!stickyEl || !wrapperEl) return
    videoPlaceholderHeight.current = stickyEl.offsetHeight

    const checkScroll = () => {
      const wrapperRect = wrapperEl.getBoundingClientRect()
      // Switch to mini-player when the TOP of the video wrapper goes above the viewport
      // (i.e., when wrapperRect.top < 0 means video is scrolled out of view upward)
      // We use a small negative threshold to trigger slightly before it's fully gone
      const shouldBeMini = wrapperRect.top < -50
      setIsMiniPlayer((prev) => {
        if (prev === shouldBeMini) return prev
        if (shouldBeMini && !prev) {
          setMiniPosition({ bottom: 16, right: 16 })
          setMiniSize(defaultMiniSize)
        }
        return shouldBeMini
      })
    }

    // Attach scroll listener to all potential scrollable parents
    const scrollableParent = wrapperEl.closest('[style*="overflow"]') ||
                             wrapperEl.closest('.overflow-auto') ||
                             wrapperEl.closest('.overflow-y-auto') ||
                             document.querySelector('main')

    window.addEventListener('scroll', checkScroll, { passive: true })
    if (scrollableParent) {
      scrollableParent.addEventListener('scroll', checkScroll, { passive: true })
    }

    // Also check on resize
    window.addEventListener('resize', checkScroll, { passive: true })

    checkScroll()
    return () => {
      window.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
      if (scrollableParent) {
        scrollableParent.removeEventListener('scroll', checkScroll)
      }
    }
  }, [defaultMiniSize])

  // --- Data Loading and Realtime ---

  // Load initial session state and archive
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [{ data: s }, { data: a }] = await Promise.all([
        supabase.from('class_sessions').select('is_active, started_at').eq('student_id', studentId).maybeSingle(),
        supabase.from('notes_archive').select('id, class_started_at, class_ended_at').eq('student_id', studentId).order('class_started_at', { ascending: false }),
      ])
      if (!mounted) return
      setActive(!!s?.is_active)
      setStartedAt(s?.started_at ? new Date(s.started_at) : null)
      setArchive(a ?? [])
    })()
    return () => { mounted = false }
  }, [studentId, supabase])

  // Realtime: class_sessions changes
  useEffect(() => {
    const channel = supabase.channel(`class_sessions:${studentId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'class_sessions', filter: `student_id=eq.${studentId}` }, (payload) => {
      const row = (payload.new ?? payload.old) as { is_active?: boolean; started_at?: string | null }
      if (typeof row?.is_active === 'boolean') setActive(row.is_active)
      if (row?.started_at !== undefined) setStartedAt(row.started_at ? new Date(row.started_at) : null)
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [studentId, supabase])

  // Realtime: notes_archive changes (so student sees archive instantly when teacher ends class)
  useEffect(() => {
    const channel = supabase.channel(`notes_archive:${studentId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes_archive', filter: `student_id=eq.${studentId}` }, (payload) => {
      const row = payload.new as { id: string; class_started_at: string; class_ended_at: string }
      setArchive(prev => {
        if (prev.some(a => a.id === row.id)) return prev
        return [row, ...prev]
      })
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [studentId, supabase])

  // Yjs Initialization
  useEffect(() => {
    if (!currentUser || !studentId) return

    const doc = new Y.Doc()
    const yjsProvider = new YjsSupabaseProvider(doc, {
      documentId: studentId,
      userId: currentUser.id,
      userName: currentUser.name,
      onSynced: () => {
        setProviderReady(true)
      },
    })

    yDocRef.current = doc
    providerRef.current = yjsProvider
    queueMicrotask(() => {
      setYDocState(doc)
      setProviderState(yjsProvider)
    })

    return () => {
      yjsProvider.destroy()
      doc.destroy()
      yDocRef.current = null
      providerRef.current = null
      setProviderReady(false)
    }
  }, [studentId, currentUser])

  // --- Class Actions ---

  const startClass = useCallback(async () => {
    console.log('[SessionView] Starting class...')
    const editor = editorRef.current
    const provider = providerRef.current
    const now = new Date()

    // Clear notes for fresh start
    editor?.commands.clearContent(true)
    await provider?.forceSave()

    // Update database first
    await supabase.from('class_sessions').upsert({
      student_id: studentId,
      is_active: true,
      started_at: now.toISOString(),
      ended_at: null,
    })

    // Set local state - this makes canJoin=true and autoRecord=true
    setActive(true)
    setStartedAt(now)

    // Now trigger video + recording (will start because active is true)
    if (videoRef.current) {
      console.log('[SessionView] Starting video and recording...')
      videoRef.current.reconnect()
    }

    await fetch(`/api/lessons/${bookingId}/start-class`, { method: 'POST' })
    console.log('[SessionView] Class started!')
  }, [studentId, bookingId, supabase])

  const endClass = useCallback(async () => {
    console.log('[SessionView] Ending class...')
    const editor = editorRef.current
    const provider = providerRef.current

    // Get the content directly from the editor before anything else
    const contentHtml = editor?.getHTML() ?? ''
    console.log('[SessionView] Captured editor content, length:', contentHtml.length)

    await provider?.forceSave()

    const ended = new Date()

    // Disconnect the video chat - this stops recording, uploads it, and cleans up
    if (videoRef.current) {
      console.log('[SessionView] Stopping video session...')
      try {
        // Check if recording before disconnect
        const wasRecording = videoRef.current.isRecording()
        console.log('[SessionView] Was recording:', wasRecording)

        await videoRef.current.disconnect()
        console.log('[SessionView] Video session stopped and recording uploaded')
      } catch (err) {
        console.error('[SessionView] Error stopping video:', err)
        // Continue with ending class even if video cleanup fails
      }
    }

    // Send content directly to API — don't rely on intermediate DB reads
    console.log('[SessionView] Archiving notes...')
    const res = await fetch(`/api/lessons/${bookingId}/end-class`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentHtml,
        classStartedAt: startedAt?.toISOString() ?? ended.toISOString(),
      }),
    })

    let result = null
    try {
      const text = await res.text()
      console.log('[SessionView] Response status:', res.status, 'Body length:', text.length)
      if (text) {
        result = JSON.parse(text)
      }
    } catch (parseErr) {
      console.error('[SessionView] Failed to parse response:', parseErr)
    }

    if (!res.ok) {
      console.error('[SessionView] End class failed:', res.status, JSON.stringify(result))
      // Don't clear the editor if archiving failed — content would be lost
      const detail = result?.details || result?.error || `Status ${res.status}`
      alert(`Failed to archive notes: ${detail}\n\nYour notes are still in the editor. Please try ending class again.`)
      return
    }
    console.log('[SessionView] Notes archived successfully')

    // Update archive list from API response
    if (result?.archivedNote) {
      setArchive(prev => {
        if (prev.some(a => a.id === result.archivedNote.id)) return prev
        return [result.archivedNote, ...prev]
      })
    }

    // Also refetch archive from DB to ensure consistency
    const { data: freshArchive } = await supabase
      .from('notes_archive')
      .select('id, class_started_at, class_ended_at')
      .eq('student_id', studentId)
      .order('class_started_at', { ascending: false })
    if (freshArchive) setArchive(freshArchive)

    // Mark session as ended in database
    console.log('[SessionView] Updating session status...')
    await supabase.from('class_sessions').upsert({
      student_id: studentId,
      is_active: false,
      started_at: startedAt?.toISOString() ?? null,
      ended_at: ended.toISOString(),
    })

    // Clear the editor
    editor?.commands.clearContent(true)
    await provider?.forceSave()

    // Update local state
    setActive(false)
    setStartedAt(null)

    console.log('[SessionView] Class ended successfully!')
  }, [studentId, bookingId, startedAt, supabase])

  return (
    <>
      <style>{`
        .no-select { user-select: none; }
      `}</style>
      <div className="grid gap-6">
        {/* Video Section */}
        <VideoSection
          studentId={studentId}
          bookingId={bookingId}
          active={active}
          startedAt={startedAt}
          isAdmin={isAdmin}
          isMiniPlayer={isMiniPlayer}
          miniPosition={miniPosition}
          miniSize={miniSize}
          videoWrapperRef={videoWrapperRef}
          videoStickyRef={videoStickyRef}
          videoPlaceholderHeight={videoPlaceholderHeight}
          onPointerDown={onPointerDown}
          onStartClass={startClass}
          onEndClass={endClass}
          currentUser={currentUser}
          videoRef={videoRef}
        />

        {/* Notes Section */}
        <section className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
          {/* Collaborative editor + awareness - entirely self-contained to avoid parent re-renders */}
          {providerReady && yDocState && providerState ? (
            <CollaborativeEditor
              yDoc={yDocState}
              provider={providerState}
              active={active}
              currentUser={currentUser}
              editorRef={editorRef}
            />
          ) : (
            <>
              <div className="flex items-center justify-between p-4 pb-3">
                <h2 className="text-lg font-semibold text-white">Lesson Notes</h2>
              </div>
              <div className="min-h-[320px] bg-black/20 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-400">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
                  <span className="text-sm">Connecting to collaborative session...</span>
                </div>
              </div>
            </>
          )}
          <div className="p-6 pt-4 border-t border-white/10">
            <h3 className="font-semibold text-white mb-3">Past Classes</h3>
            <div className="space-y-2">
              {archive.length === 0 && <p className="text-sm text-gray-500">No past classes yet.</p>}
              {archive.map((row) => <ArchivedNoteAccordion key={row.id} id={row.id} bookingId={bookingId} title={new Date(row.class_started_at).toLocaleString()} subtitle={new Date(row.class_ended_at).toLocaleTimeString()} isAdmin={isAdmin} onDelete={() => setArchive(prev => prev.filter(x => x.id !== row.id))} />)}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

// --- Video Section (memoized so awareness/editor re-renders don't touch the WebRTC component) ---

const VideoSection = React.memo(function VideoSection({
  studentId,
  bookingId,
  active,
  startedAt,
  isAdmin,
  isMiniPlayer,
  miniPosition,
  miniSize,
  videoWrapperRef,
  videoStickyRef,
  videoPlaceholderHeight,
  onPointerDown,
  onStartClass,
  onEndClass,
  currentUser,
  videoRef,
}: {
  studentId: string
  bookingId: string
  active: boolean
  startedAt: Date | null
  isAdmin: boolean
  isMiniPlayer: boolean
  miniPosition: { bottom: number; right: number }
  miniSize: { width: number; height: number }
  videoWrapperRef: React.RefObject<HTMLDivElement | null>
  videoStickyRef: React.RefObject<HTMLDivElement | null>
  videoPlaceholderHeight: React.MutableRefObject<number>
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, type: 'drag' | 'resize') => void
  onStartClass: () => void
  onEndClass: () => void
  currentUser?: { id: string; name: string }
  videoRef: React.RefObject<VideoWebRTCHandle | null>
}) {
  // Handle recording upload
  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    if (!blob || blob.size === 0) {
      console.log('[VideoSection] No recording data to upload')
      return
    }

    console.log('[VideoSection] Uploading recording, size:', blob.size)

    try {
      const formData = new FormData()
      formData.append('recording', blob, `lesson-${bookingId}-${Date.now()}.webm`)
      formData.append('roomName', `lesson-${bookingId}`)
      if (startedAt) {
        formData.append('classStartedAt', startedAt.toISOString())
      }

      const response = await fetch(`/api/lessons/${bookingId}/recordings`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('[VideoSection] Recording upload failed:', error)
        return
      }

      const result = await response.json()
      console.log('[VideoSection] Recording uploaded successfully:', result)
    } catch (err) {
      console.error('[VideoSection] Error uploading recording:', err)
    }
  }, [bookingId, startedAt])

  return (
    <section className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2 text-gray-400">
          <Video className="w-4 h-4" />
          <span className="text-sm font-medium">Video Room</span>
        </div>
        {active && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Live
          </span>
        )}
      </div>
      <div ref={videoWrapperRef} className="relative" style={{ minHeight: isMiniPlayer ? `${videoPlaceholderHeight.current}px` : 'auto', background: isMiniPlayer ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
        {isMiniPlayer && <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">Video playing in mini player (bottom right)</div>}
        <div ref={videoStickyRef} className={`${!isMiniPlayer ? 'aspect-video w-full' : ''}`} style={isMiniPlayer ? { position: 'fixed', bottom: `${miniPosition.bottom}px`, right: `${miniPosition.right}px`, width: `${miniSize.width}px`, height: `${miniSize.height}px`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 9999, background: 'black', overflow: 'hidden' } : { background: 'black', width: '100%' }}>
          {isMiniPlayer && <div onPointerDown={(e) => onPointerDown(e, 'drag')} className="absolute inset-0 z-10" style={{ cursor: 'move' }} />}
          <VideoWebRTC
            ref={videoRef}
            key={`video-${bookingId}`}
            roomId={`lesson-${bookingId}`}
            participantId={currentUser?.id || studentId}
            participantName={currentUser?.name || 'Participant'}
            isHost={isAdmin}
            canJoin={active}
            autoRecord={isAdmin && active}
            className="block w-full h-full"
            isMiniPlayer={isMiniPlayer}
            onRecordingComplete={handleRecordingComplete}
          />
          {isMiniPlayer && <div onPointerDown={(e) => onPointerDown(e, 'resize')} className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20" style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%)', borderBottomRightRadius: '12px' }} />}
          {isMiniPlayer && <button onClick={() => { videoWrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white text-xs z-20" title="Return to full view">×</button>}
        </div>
      </div>
      {isAdmin ? (
        <div className="p-4 border-t border-white/10 flex items-center gap-2">
          {!active ? (
            <button onClick={onStartClass} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#CEB466] hover:bg-[#e0c97d] text-[#171229] font-medium transition-colors"><PlayCircle className="w-5 h-5" />Start Class</button>
          ) : (
            <button onClick={onEndClass} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"><StopCircle className="w-5 h-5" />End Class</button>
          )}
        </div>
      ) : (<p className="p-4 text-sm text-gray-400 border-t border-white/10">{active ? 'Class in session.' : 'Class not in session yet. You can view past notes below.'}</p>)}
    </section>
  )
})

// --- Collaborative Editor (self-contained: owns its own awareness state) ---

function CollaborativeEditor({
  yDoc,
  provider,
  active,
  currentUser,
  editorRef,
}: {
  yDoc: Y.Doc
  provider: YjsSupabaseProvider
  active: boolean
  currentUser?: { id: string; name: string }
  editorRef: React.MutableRefObject<Editor | null>
}) {
  // Awareness state lives HERE, not in the parent - prevents parent/video re-renders
  const [awarenessUsers, setAwarenessUsers] = useState<Map<number, AwarenessUser>>(
    () => new Map(provider.getAwareness())
  )

  useEffect(() => {
    // Subscribe to awareness updates from the provider
    const handler = (users: Map<number, AwarenessUser>) => {
      setAwarenessUsers(new Map(users))
    }
    provider.onAwarenessChange(handler)
    return () => {
      provider.offAwarenessChange(handler)
    }
  }, [provider])

  // Editor is created exactly ONCE here - yDoc is always non-null when this component mounts
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // @ts-expect-error - history option exists at runtime
        history: false,
      }),
      Placeholder.configure({
        placeholder: 'Start taking notes...',
      }),
      Collaboration.configure({
        document: yDoc,
        field: 'prosemirror',
      }),
    ],
    editable: active,
    immediatelyRender: false,
  })

  // Keep ref updated for parent actions
  useEffect(() => {
    editorRef.current = editor
  }, [editor, editorRef])

  // Update editor editable state when active changes
  useEffect(() => {
    if (editor) editor.setEditable(active)
  }, [active, editor])

  return (
    <>
      <div className="flex items-center justify-between p-4 pb-3">
        <h2 className="text-lg font-semibold text-white">Lesson Notes</h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {Array.from(awarenessUsers.entries())
            .filter(([, user]) => user.name !== currentUser?.name)
            .map(([clientId, user]) => (
              <div key={clientId} className="flex items-center gap-2" style={{ color: user.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: user.color }}></span>
                {user.name} is here
              </div>
            ))}
        </div>
      </div>
      {active && (
        <div className="flex items-center gap-1 px-4 py-2 border-t border-b border-white/10 bg-black/20">
          <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} isActive={editor?.isActive('bold')} title="Bold (Ctrl+B)"><Bold className="w-4 h-4" /></ToolbarButton>
          <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} isActive={editor?.isActive('italic')} title="Italic (Ctrl+I)"><Italic className="w-4 h-4" /></ToolbarButton>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor?.isActive('heading', { level: 1 })} title="Heading 1"><Heading1 className="w-4 h-4" /></ToolbarButton>
          <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor?.isActive('heading', { level: 2 })} title="Heading 2"><Heading2 className="w-4 h-4" /></ToolbarButton>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} isActive={editor?.isActive('bulletList')} title="Bullet List"><List className="w-4 h-4" /></ToolbarButton>
          <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} isActive={editor?.isActive('orderedList')} title="Numbered List"><ListOrdered className="w-4 h-4" /></ToolbarButton>
          <ToolbarButton onClick={() => editor?.chain().focus().toggleBlockquote().run()} isActive={editor?.isActive('blockquote')} title="Quote"><Quote className="w-4 h-4" /></ToolbarButton>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Undo (Ctrl+Z)"><Undo className="w-4 h-4" /></ToolbarButton>
          <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Redo (Ctrl+Y)"><Redo className="w-4 h-4" /></ToolbarButton>
        </div>
      )}
      <div className="min-h-[320px] bg-black/20">
        <EditorContent editor={editor} className="lesson-notes-editor" />
      </div>
      <style>{`
        .lesson-notes-editor .ProseMirror { min-height: 320px; padding: 1rem; outline: none; color: white; }
        .lesson-notes-editor .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: #6b7280; pointer-events: none; height: 0; }
        .lesson-notes-editor .ProseMirror h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
        .lesson-notes-editor .ProseMirror h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
        .lesson-notes-editor .ProseMirror p { margin-bottom: 0.25rem; }
        .lesson-notes-editor .ProseMirror ul, .lesson-notes-editor .ProseMirror ol { padding-left: 1.5rem; margin-bottom: 0.5rem; }
        .lesson-notes-editor .ProseMirror blockquote { border-left: 3px solid #4b5563; padding-left: 1rem; margin-left: 0; color: #9ca3af; }
      `}</style>
    </>
  )
}

interface AISummary {
  summary: string
  keyTopicsCovered: string[]
  exercisesPracticed: string[]
  teacherFeedback: string[]
  studentProgress: string[]
  homeworkAssignments: string[]
  nextSessionFocus: string[]
  notesHighlights?: string[]  // Key points extracted from handwritten notes
}

function ArchivedNoteAccordion({ id, bookingId, title, subtitle, isAdmin, onDelete }: { id: string; bookingId: string; title: string; subtitle: string; isAdmin: boolean; onDelete: () => void }) {
  const supabase = getSupabaseClient()
  const [isOpen, setIsOpen] = useState(false)
  const [contentHtml, setContentHtml] = useState<string>('')
  const [text, setText] = useState<string>('')
  const [original, setOriginal] = useState<string>('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [loaded, setLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<'notes' | 'ai'>('notes')
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null)
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [reprocessing, setReprocessing] = useState(false)

  const refreshAiStatus = useCallback(async (targetRecordingId: string) => {
    try {
      const res = await fetch(`/api/lessons/${bookingId}/process-recording?recordingId=${targetRecordingId}`)
      if (!res.ok) return
      const payload = await res.json()
      setAiStatus(payload?.status || 'pending')
      if (payload?.summary) {
        setAiSummary(payload.summary as AISummary)
      }
    } catch (err) {
      console.warn('[ArchivedNoteAccordion] Failed to refresh AI status:', err)
    }
  }, [bookingId])

  const triggerProcessing = useCallback(async (targetRecordingId: string, status: string | null | undefined, force: boolean = false) => {
    if (!targetRecordingId) return
    if (!force && (status === 'processing' || status === 'completed')) return

    setReprocessing(true)
    setAiStatus('processing')
    try {
      const res = await fetch(`/api/lessons/${bookingId}/process-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId: targetRecordingId, force }),
      })

      if (res.ok) {
        const payload = await res.json().catch(() => null)
        if (payload?.summary) {
          setAiSummary(payload.summary as AISummary)
          setAiStatus('completed')
        } else {
          setAiStatus('processing')
        }
      } else {
        setAiStatus('failed')
      }
    } catch (err) {
      console.warn('[ArchivedNoteAccordion] Failed to trigger recording processing:', err)
      setAiStatus('failed')
    } finally {
      setReprocessing(false)
      await refreshAiStatus(targetRecordingId)
    }
  }, [bookingId, refreshAiStatus])

  useEffect(() => {
    if (!isOpen || loaded) return
    let on = true

    supabase.from('notes_archive').select('content, content_html, ai_summary, recording_id, class_started_at, class_ended_at').eq('id', id).single().then(async ({ data }) => {
      if (!on) return
      const html = data?.content_html ?? ''
      const plain = data?.content ?? ''
      setContentHtml(html)
      setText(plain)
      setOriginal(plain)

      // Set AI summary if available
      if (data?.ai_summary) {
        setAiSummary(data.ai_summary as AISummary)
        setAiStatus('completed')
      } else if (data?.recording_id) {
        setRecordingId(data.recording_id)
        // Check recording AI processing status via API to avoid RLS issues
        try {
          const res = await fetch(`/api/lessons/${bookingId}/process-recording?recordingId=${data.recording_id}`)
          if (res.ok) {
            const payload = await res.json()
            if (payload?.summary) {
              setAiSummary(payload.summary as AISummary)
              setAiStatus('completed')
            } else {
              setAiStatus(payload?.status || 'pending')
              await triggerProcessing(data.recording_id, payload?.status || 'pending')
            }
          } else {
            setAiStatus('pending')
            await triggerProcessing(data.recording_id, 'pending')
          }
        } catch (err) {
          console.warn('[ArchivedNoteAccordion] Failed to check recording status via API:', err)
          setAiStatus('pending')
          await triggerProcessing(data.recording_id, 'pending')
        }
      } else if (bookingId) {
        // Fallback for older notes where recording_id was never linked: use API endpoint to fetch recordings
        // (avoids RLS policy issues with direct DB access)
        try {
          const res = await fetch(`/api/lessons/${bookingId}/recordings`)
          if (res.ok) {
            const { recordings } = await res.json()

            if (recordings?.length) {
              const noteStartMs = data?.class_started_at ? new Date(data.class_started_at).getTime() : null
              const noteEndMs = data?.class_ended_at ? new Date(data.class_ended_at).getTime() : null

              const best = recordings
                .map((recording: { id: string; started_at?: string; ended_at?: string; ai_processing_status?: string; ai_summary?: AISummary; created_at?: string }) => {
                  const recordingStartMs = recording.started_at ? new Date(recording.started_at).getTime() : null
                  const recordingEndMs = recording.ended_at ? new Date(recording.ended_at).getTime() : null
                  const deltaStart = noteStartMs && recordingStartMs ? Math.abs(noteStartMs - recordingStartMs) : Number.POSITIVE_INFINITY
                  const deltaEnd = noteEndMs && recordingEndMs ? Math.abs(noteEndMs - recordingEndMs) : Number.POSITIVE_INFINITY
                  return {
                    recording,
                    deltaMs: Math.min(deltaStart, deltaEnd),
                  }
                })
                .sort((a: { deltaMs: number }, b: { deltaMs: number }) => a.deltaMs - b.deltaMs)[0]

              // Accept nearest match only if it's reasonably close to this class.
              if (best && best.deltaMs <= 3 * 60 * 60 * 1000) {
                setRecordingId(best.recording.id)
                if (best.recording.ai_summary) {
                  setAiSummary(best.recording.ai_summary as AISummary)
                  setAiStatus('completed')
                } else {
                  setAiStatus(best.recording.ai_processing_status || 'pending')
                  await triggerProcessing(best.recording.id, best.recording.ai_processing_status || 'pending')
                }
              }
            }
          }
        } catch (err) {
          console.warn('[ArchivedNoteAccordion] Failed to fetch recordings via API:', err)
        }
      }

      setLoaded(true)
    })
    return () => { on = false }
  }, [id, bookingId, isOpen, loaded, supabase, triggerProcessing])

  useEffect(() => {
    if (!isOpen || activeTab !== 'ai' || !recordingId) return
    if (aiStatus === 'completed') return

    const intervalId = window.setInterval(() => {
      refreshAiStatus(recordingId)
    }, 4000)

    refreshAiStatus(recordingId)
    return () => window.clearInterval(intervalId)
  }, [isOpen, activeTab, recordingId, aiStatus, refreshAiStatus])

  const onSave = async () => {
    setSaving('saving')
    const { error } = await supabase.from('notes_archive').update({ content: text }).eq('id', id)
    if (error) { setSaving('error'); return }
    setOriginal(text)
    setContentHtml('')
    setSaving('saved')
    setEditing(false)
    setTimeout(() => setSaving('idle'), 900)
  }

  const onCancel = () => { setText(original); setEditing(false); setSaving('idle') }
  const onDeleteClick = async () => {
    if (!window.confirm('Are you sure?')) return
    await supabase.from('notes_archive').delete().eq('id', id)
    onDelete()
  }

  return (
    <div className="bg-black/20 rounded-lg border border-white/10 overflow-hidden">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm">{title}</span>
          <span className="text-gray-500 text-xs">ended {subtitle}</span>
          {aiStatus === 'completed' && <span className="px-1.5 py-0.5 text-[10px] bg-[#CEB466]/20 text-[#CEB466] rounded">AI</span>}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {isOpen && (
        <div className="border-t border-white/10">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'notes' ? 'text-[#CEB466] border-b-2 border-[#CEB466]' : 'text-gray-400 hover:text-white'}`}
            >
              Class Notes
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'ai' ? 'text-[#CEB466] border-b-2 border-[#CEB466]' : 'text-gray-400 hover:text-white'}`}
            >
              AI Summary {aiStatus === 'processing' && '⏳'}
            </button>
          </div>

          <div className="p-3">
            {activeTab === 'notes' ? (
              /* Notes Tab */
              !editing ? (
                <>
                  <div className="flex justify-between items-start mb-3">
                    {contentHtml ? (
                      <div className="prose prose-invert prose-sm max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: contentHtml }} />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-gray-300">{text || 'No notes were taken.'}</pre>
                    )}
                    {isAdmin && <button className="ml-2 p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0" onClick={onDeleteClick} title="Delete"><Trash2 size={18} className="text-red-400" /></button>}
                  </div>
                  <button className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm text-white" onClick={() => setEditing(true)}>Edit</button>
                </>
              ) : (
                <>
                  <textarea className="w-full min-h-48 bg-black/30 border rounded p-3 text-sm text-white" value={text} onChange={(e) => setText(e.target.value)} />
                  <div className="flex items-center gap-2 mt-2">
                    <button className="px-3 py-1.5 rounded bg-[#CEB466] text-[#171229] font-medium" onClick={onSave} disabled={saving === 'saving'}>{saving === 'saving' ? 'Saving...' : 'Save'}</button>
                    <button className="px-3 py-1.5 rounded bg-white/10 text-sm text-white" onClick={onCancel} disabled={saving === 'saving'}>Cancel</button>
                    <span className="text-xs text-gray-500">{saving === 'saved' ? 'Saved' : saving === 'error' ? 'Error' : ''}</span>
                  </div>
                </>
              )
            ) : (
              /* AI Summary Tab */
              <div className="space-y-4">
                {aiStatus === 'processing' && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="w-4 h-4 border-2 border-[#CEB466] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Generating AI summary from lesson recording...</span>
                  </div>
                )}
                {aiStatus === 'pending' && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-500">AI summary will be generated once the lesson recording is processed.</p>
                    {recordingId && (
                      <button
                        onClick={() => triggerProcessing(recordingId, aiStatus)}
                        disabled={reprocessing}
                        className="px-2.5 py-1 rounded bg-[#CEB466]/20 hover:bg-[#CEB466]/30 text-[#CEB466] text-xs disabled:opacity-50"
                      >
                        {reprocessing ? 'Reprocessing...' : 'Reprocess Now'}
                      </button>
                    )}
                  </div>
                )}
                {aiStatus === 'failed' && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-red-400">Failed to generate AI summary. Please try again.</p>
                    {recordingId && (
                      <button
                        onClick={() => triggerProcessing(recordingId, aiStatus)}
                        disabled={reprocessing}
                        className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs disabled:opacity-50"
                      >
                        {reprocessing ? 'Retrying...' : 'Retry AI'}
                      </button>
                    )}
                  </div>
                )}
                {aiSummary && (
                  <>
                    {/* Rescan Button */}
                    {recordingId && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => triggerProcessing(recordingId, aiStatus, true)}
                          disabled={reprocessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CEB466]/20 hover:bg-[#CEB466]/30 text-[#CEB466] text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          {reprocessing ? (
                            <>
                              <div className="w-3 h-3 border-2 border-[#CEB466] border-t-transparent rounded-full animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Rescan Lesson for Notes
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    <div>
                      <p className="text-gray-300 text-sm">{aiSummary.summary}</p>
                    </div>

                    {(aiSummary.notesHighlights?.length ?? 0) > 0 && (
                      <div className="bg-[#CEB466]/10 border border-[#CEB466]/20 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-[#CEB466] uppercase tracking-wide mb-1">📝 From Class Notes</h4>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                          {aiSummary.notesHighlights!.map((note, i) => <li key={i}>{note}</li>)}
                        </ul>
                      </div>
                    )}

                    {aiSummary.keyTopicsCovered?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[#CEB466] uppercase tracking-wide mb-1">Key Topics</h4>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                          {aiSummary.keyTopicsCovered.map((topic, i) => <li key={i}>{topic}</li>)}
                        </ul>
                      </div>
                    )}

                    {aiSummary.exercisesPracticed?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[#CEB466] uppercase tracking-wide mb-1">Exercises Practiced</h4>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                          {aiSummary.exercisesPracticed.map((ex, i) => <li key={i}>{ex}</li>)}
                        </ul>
                      </div>
                    )}

                    {aiSummary.teacherFeedback?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[#CEB466] uppercase tracking-wide mb-1">Teacher Feedback</h4>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                          {aiSummary.teacherFeedback.map((fb, i) => <li key={i}>{fb}</li>)}
                        </ul>
                      </div>
                    )}

                    {aiSummary.homeworkAssignments?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[#CEB466] uppercase tracking-wide mb-1">Homework</h4>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                          {aiSummary.homeworkAssignments.map((hw, i) => <li key={i}>{hw}</li>)}
                        </ul>
                      </div>
                    )}

                    {aiSummary.nextSessionFocus?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[#CEB466] uppercase tracking-wide mb-1">Focus for Next Session</h4>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                          {aiSummary.nextSessionFocus.map((focus, i) => <li key={i}>{focus}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                {!aiSummary && !aiStatus && (
                  <p className="text-sm text-gray-500">No recording available for this lesson.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: { onClick: () => void; isActive?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`p-2 rounded transition-colors ${isActive ? 'bg-[#CEB466]/30 text-[#CEB466]' : disabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}>
      {children}
    </button>
  )
}
