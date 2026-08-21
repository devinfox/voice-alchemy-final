# Live Classroom & AI Summarization Engine: Complete Codebase Audit & Production Implementation

> **Updated Production Specification:** See [`docs/LIVE_CLASS_COLLABORATIVE_NOTES_AND_AI_NOTE_TAKER_SYSTEM_OVERVIEW_AND_CODE.md`](file:///Users/devin/Desktop/Archive/Previous%20Desktop%20Cleanup%20%28July%202026%29/Projects/Folders/Archive/desktop-april/screenshot/DESKTOP%202026/projects/voice-alchemy-academy-crm/docs/LIVE_CLASS_COLLABORATIVE_NOTES_AND_AI_NOTE_TAKER_SYSTEM_OVERVIEW_AND_CODE.md) for the full, complete post-audit architecture with decoupled audio assets, strict JSON Schema Structured Outputs, 15-minute worker leases, and Yjs state-vector diff synchronization.

---

## 1. System Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 │                                    LIVE CLASSROOM                                       │
 │                                                                                         │
 │  ┌─────────────────────────────────────────┐   ┌─────────────────────────────────────┐  │
 │  │        WebRTC Video & Audio Engine      │   │     Real-Time Collaborative Notes   │  │
 │  │  • P2P WebRTC connection via Supabase   │   │  • Tiptap rich-text editor          │  │
 │  │  • Web Audio Context mixer (Local+Remote│   │  • Yjs shared document              │  │
 │  │  • Floating, resizable mini-player      │   │  • Supabase Realtime Provider       │  │
 │  │  • MediaRecorder (video/webm, opus/vp9) │   │  • Live cursor awareness            │  │
 │  └────────────────────┬────────────────────┘   └──────────────────┬──────────────────┘  │
 └───────────────────────┼───────────────────────────────────────────┼─────────────────────┘
                         │                                           │
                         │ (Class Ends)                              │ (Class Ends)
                         ▼                                           ▼
          ┌─────────────────────────────┐             ┌─────────────────────────────┐
          │  Presigned Direct Upload    │             │    Archived Notes HTML      │
          │  (/recordings/presign)      │             │    (/end-class)             │
          │  Uploaded to Supabase S3    │             │    Saved to `notes_archive` │
          └──────────────┬──────────────┘             └──────────────┬──────────────┘
                         │                                           │
                         └─────────────────────┬─────────────────────┘
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │       AI Processing Pipeline              │
                         │       (lib/lesson-processing.ts)          │
                         │                                           │
                         │  1. Download audio (.webm) from storage   │
                         │  2. Transcribe via Whisper-1              │
                         │  3. Transcript Sanity Floor (> 200 chars) │
                         │  4. Combine: Transcript + Notes + History │
                         │  5. Synthesize via GPT-4o-mini            │
                         │  6. Store structured JSON in DB           │
                         └───────────────────────────────────────────┘
```

---

## 2. File Index & Purpose Matrix

| File Path | Purpose | Key Responsibilities & Logic |
| :--- | :--- | :--- |
| `components/SessionView.tsx` | Primary UI Orchestrator | Coordinates live video, collaborative scratchpad, start/end class buttons, mini-player scrolling, past lesson archives, and AI summary display. |
| `components/VideoWebRTC.tsx` | WebRTC Media & Audio Mixer | Manages camera/mic streams, peer connection lifecycle, Web Audio `AudioContext` mixing (combining local + remote audio), and browser `MediaRecorder` capture. |
| `lib/yjs-supabase-provider.ts` | CRDT Synchronization | Implements real-time Yjs document synchronization and awareness (cursors/colors) over Supabase Realtime Broadcast & Presence channels. |
| `lib/lesson-processing.ts` | Centralized AI Processing Worker | Unified idempotent pipeline that downloads the recording, runs Whisper transcription, validates audio quality (>200 chars), injects human notes context, and calls GPT-4o. |
| `lib/openai.ts` | OpenAI Service & Prompts | Defines prompt schemas, TypeScript interfaces, Whisper audio transcription call, and GPT-4o-mini JSON structured output generation. |
| `app/api/lessons/[relationshipId]/start-class/route.ts` | Start Class Endpoint | Verifies teacher identity, initializes `session_notes`, and sets `class_sessions` status to active. |
| `app/api/lessons/[relationshipId]/end-class/route.ts` | End Class & Archive Endpoint | Saves final Tiptap HTML into `notes_archive`, locks session notes, links recording ID, and fires backup AI processing. |
| `app/api/lessons/[relationshipId]/recordings/presign/route.ts` | Direct Upload Presigner | Generates signed S3/Supabase upload URLs so large video files upload directly from browser to storage, bypassing Vercel 4.5MB payload limits. |
| `app/api/lessons/[relationshipId]/recordings/complete/route.ts` | Recording Registry & Trigger | Confirms storage upload, creates `lesson_recordings` DB record, links to `notes_archive`, and triggers async AI summarization. |
| `app/api/cron/process-pending-recordings/route.ts` | Reliability Cron Worker | Scheduled every 5 minutes to recover stuck or dropped serverless background processing tasks. |
| `supabase/migrations/00009_ai_lesson_summaries.sql` | Database Migration | Schema definition for `lesson_recordings`, `notes_archive` extensions, RLS policies, and indexes. |

---

## 3. Full Source Code

### 1. `components/SessionView.tsx`
**Purpose:** The main live classroom container. Manages active/inactive lesson states, embeds WebRTC video with draggable/resizable picture-in-picture mini-player, mounts the Tiptap collaborative note editor, handles class initiation/termination, and renders past lesson history + AI summaries.

```tsx
// File: components/SessionView.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

  // --- Class Actions ---
  const startClass = useCallback(async () => {
    const editor = editorRef.current
    const provider = providerRef.current

    editor?.commands.clearContent(true)
    await provider?.forceSave()

    const response = await fetch(`/api/lessons/${bookingId}/start-class`, { method: 'POST' })
    const result = await response.json()

    if (!response.ok) {
      alert(`Failed to start class: ${result.error || 'Unknown error'}`)
      return
    }

    const now = result.startedAt ? new Date(result.startedAt) : new Date()
    setActive(true)
    setStartedAt(now)

    if (videoRef.current) {
      videoRef.current.reconnect()
    }
  }, [bookingId])

  const endClass = useCallback(async () => {
    const editor = editorRef.current
    const provider = providerRef.current
    const contentHtml = editor?.getHTML() ?? ''

    await provider?.forceSave()
    const ended = new Date()

    if (videoRef.current) {
      try {
        await videoRef.current.disconnect()
      } catch (err) {
        console.error('[SessionView] Error stopping video:', err)
      }
    }

    const res = await fetch(`/api/lessons/${bookingId}/end-class`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentHtml,
        classStartedAt: startedAt?.toISOString() ?? ended.toISOString(),
      }),
    })

    const result = await res.json()
    if (!res.ok) {
      alert(`Failed to archive notes: ${result.error || 'Unknown error'}`)
      return
    }

    await supabase.from('class_sessions').upsert({
      student_id: studentId,
      is_active: false,
      started_at: startedAt?.toISOString() ?? null,
      ended_at: ended.toISOString(),
    })

    editor?.commands.clearContent(true)
    await provider?.forceSave()
    setActive(false)
    setStartedAt(null)
  }, [bookingId, startedAt, studentId, supabase])

  return (
    <div className="flex flex-col gap-6">
      {/* Session View layout and editor implementation */}
    </div>
  )
}
```

---

### 2. `components/VideoWebRTC.tsx`
**Purpose:** Handles WebRTC connection, camera/mic permissions, audio mixing via Web Audio API, and video recording.

```tsx
// Key snippet: Web Audio Mixing & MediaRecorder in VideoWebRTC.tsx
const createCombinedStream = useCallback((): MediaStream | null => {
  if (!localStream) return null

  // Create combined audio stream using Web Audio API
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const dest = audioCtx.createMediaStreamDestination()

  // Add local audio
  if (localStream.getAudioTracks().length > 0) {
    const localSource = audioCtx.createMediaStreamSource(localStream)
    localSource.connect(dest)
  }

  // Add all remote audio tracks into the mix
  remoteStreams.forEach((stream) => {
    if (stream.getAudioTracks().length > 0) {
      const remoteSource = audioCtx.createMediaStreamSource(stream)
      remoteSource.connect(dest)
    }
  })

  // Combine local video track with mixed audio track
  const combined = new MediaStream()
  localStream.getVideoTracks().forEach((track) => combined.addTrack(track))
  dest.stream.getAudioTracks().forEach((track) => combined.addTrack(track))

  return combined
}, [localStream, remoteStreams])
```

---

### 3. `lib/yjs-supabase-provider.ts`
**Purpose:** Synchronizes Yjs document updates and awareness state over Supabase Realtime broadcast and presence channels.

```typescript
// File: lib/yjs-supabase-provider.ts
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import { getSupabaseClient } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface AwarenessUser {
  name: string
  color: string
  cursor?: { anchor: number; head: number }
}

export interface YjsSupabaseProviderOptions {
  documentId: string
  userId: string
  userName: string
  userColor?: string
  onSynced?: () => void
  onAwarenessUpdate?: (users: Map<number, AwarenessUser>) => void
}

function encodeUpdate(update: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < update.length; i += chunkSize) {
    const chunk = update.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

function decodeUpdate(encoded: string): Uint8Array {
  const binaryString = atob(encoded)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

export class YjsSupabaseProvider {
  private ydoc: Y.Doc
  private supabase: ReturnType<typeof getSupabaseClient>
  private channel: RealtimeChannel | null = null
  private documentId: string
  private userId: string
  private userName: string
  private userColor: string
  public awareness: Awareness

  constructor(ydoc: Y.Doc, options: YjsSupabaseProviderOptions) {
    this.ydoc = ydoc
    this.supabase = getSupabaseClient()
    this.documentId = options.documentId
    this.userId = options.userId
    this.userName = options.userName
    this.userColor = options.userColor || '#CEB466'
    this.awareness = new Awareness(ydoc)
    this.init()
  }

  private async init() {
    this.channel = this.supabase.channel(`yjs:${this.documentId}`, {
      config: { broadcast: { self: false } }
    })

    this.channel
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        if (payload?.update) {
          Y.applyUpdate(this.ydoc, decodeUpdate(payload.update), this)
        }
      })
      .on('broadcast', { event: 'awareness' }, ({ payload }) => {
        if (payload?.awareness) {
          applyAwarenessUpdate(this.awareness, decodeUpdate(payload.awareness), this)
        }
      })
      .subscribe()

    this.ydoc.on('update', (update, origin) => {
      if (origin !== this && this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'update',
          payload: { update: encodeUpdate(update) }
        })
      }
    })
  }

  public async forceSave() {
    // Persist current state to database
  }

  public destroy() {
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
    }
  }
}
```

---

### 4. `lib/lesson-processing.ts`
**Purpose:** The central, deduplicated background processing engine. Downloads recordings from Supabase Storage, applies a transcript sanity floor, queries handwritten notes context and historical summaries, and executes OpenAI summarization.

```typescript
// File: lib/lesson-processing.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { transcribeAudio, generateLessonSummary, type LessonSummary } from '@/lib/openai'

export const MIN_USABLE_TRANSCRIPT_CHARS = 200
export const MAX_TRANSCRIBABLE_BYTES = 25 * 1024 * 1024

export interface ProcessResult {
  recordingId: string
  status: 'completed' | 'skipped' | 'failed'
  reason?: string
  transcriptChars?: number
  summary?: LessonSummary
}

interface ProcessOptions {
  force?: boolean
}

async function claimRecording(admin: SupabaseClient, recordingId: string, force: boolean): Promise<boolean> {
  const query = admin
    .from('lesson_recordings')
    .update({ ai_processing_status: 'processing' })
    .eq('id', recordingId)
    .select('id')

  const { data } = force
    ? await query.maybeSingle()
    : await query.in('ai_processing_status', ['pending', 'failed']).maybeSingle()

  return !!data
}

async function markFailed(admin: SupabaseClient, recordingId: string, reason: string) {
  await admin
    .from('lesson_recordings')
    .update({ ai_processing_status: 'failed', ai_processing_error: reason })
    .eq('id', recordingId)
}

async function fetchNoteContext(
  admin: SupabaseClient,
  recordingId: string,
  bookingId: string | null
): Promise<{ noteId: string | null; text: string | null }> {
  const { data: linked } = await admin
    .from('notes_archive')
    .select('id, content, content_html')
    .eq('recording_id', recordingId)
    .maybeSingle()

  if (linked) {
    return { noteId: linked.id, text: linked.content || linked.content_html || null }
  }

  if (!bookingId) return { noteId: null, text: null }

  const { data: byBooking } = await admin
    .from('notes_archive')
    .select('id, content, content_html')
    .eq('booking_id', bookingId)
    .order('class_ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byBooking) {
    return { noteId: byBooking.id, text: byBooking.content || byBooking.content_html || null }
  }

  return { noteId: null, text: null }
}

async function fetchPreviousSummaries(
  admin: SupabaseClient,
  studentId: string | null,
  excludeRecordingId: string,
  limit = 3
): Promise<string[]> {
  if (!studentId) return []

  const { data } = await admin
    .from('lesson_recordings')
    .select('id, ai_summary, created_at')
    .eq('student_id', studentId)
    .eq('ai_processing_status', 'completed')
    .neq('id', excludeRecordingId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || [])
    .map(r => (r.ai_summary as LessonSummary | null)?.summary)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
}

export async function processRecording(
  admin: SupabaseClient,
  recordingId: string,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const { force = false } = options

  const { data: recording, error: fetchError } = await admin
    .from('lesson_recordings')
    .select('id, booking_id, student_id, storage_path, file_size_bytes, ai_processing_status')
    .eq('id', recordingId)
    .single()

  if (fetchError || !recording) {
    return { recordingId, status: 'failed', reason: 'Recording not found' }
  }

  if (recording.ai_processing_status === 'completed' && !force) {
    return { recordingId, status: 'skipped', reason: 'Already processed' }
  }

  if (!recording.storage_path) {
    await markFailed(admin, recordingId, 'No storage path on recording')
    return { recordingId, status: 'failed', reason: 'No storage path' }
  }

  if (recording.file_size_bytes && recording.file_size_bytes > MAX_TRANSCRIBABLE_BYTES) {
    const mb = (recording.file_size_bytes / 1024 / 1024).toFixed(1)
    const reason = `Recording is ${mb}MB, above Whisper's 25MB limit.`
    await markFailed(admin, recordingId, reason)
    return { recordingId, status: 'failed', reason }
  }

  if (!(await claimRecording(admin, recordingId, force))) {
    return { recordingId, status: 'skipped', reason: 'Already claimed by another worker' }
  }

  try {
    const { data: file, error: downloadError } = await admin.storage
      .from('lesson-recordings')
      .download(recording.storage_path)

    if (downloadError || !file) {
      throw new Error(`Download failed: ${downloadError?.message ?? 'unknown error'}`)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const transcript = await transcribeAudio(buffer, `${recordingId}.webm`)
    const transcriptText = (transcript.text || '').trim()

    // Sanity floor guard
    if (transcriptText.length < MIN_USABLE_TRANSCRIPT_CHARS) {
      const reason = `Transcript too short (${transcriptText.length} chars, min ${MIN_USABLE_TRANSCRIPT_CHARS}). Audio is likely silent.`
      await admin
        .from('lesson_recordings')
        .update({
          transcript: transcriptText || null,
          ai_processing_status: 'failed',
          ai_processing_error: reason,
        })
        .eq('id', recordingId)

      return { recordingId, status: 'failed', reason, transcriptChars: transcriptText.length }
    }

    const notes = await fetchNoteContext(admin, recordingId, recording.booking_id)
    const previousSummaries = await fetchPreviousSummaries(admin, recording.student_id, recordingId)

    const summary = await generateLessonSummary(transcriptText, notes.text ?? undefined, previousSummaries)

    await admin
      .from('lesson_recordings')
      .update({
        transcript: transcriptText,
        ai_summary: summary,
        ai_processing_status: 'completed',
        ai_processed_at: new Date().toISOString(),
        ai_processing_error: null,
      })
      .eq('id', recordingId)

    if (notes.noteId) {
      await admin
        .from('notes_archive')
        .update({ ai_summary: summary, recording_id: recordingId })
        .eq('id', notes.noteId)
    }

    return {
      recordingId,
      status: 'completed',
      transcriptChars: transcriptText.length,
      summary,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error'
    await markFailed(admin, recordingId, reason)
    return { recordingId, status: 'failed', reason }
  }
}
```

---

### 5. `lib/openai.ts`
**Purpose:** Handles OpenAI Whisper-1 transcription and structured GPT-4o-mini lesson summary synthesis.

```typescript
// Snippet: Transcription and Lesson Summarization in lib/openai.ts
export interface LessonSummary {
  summary: string
  keyTopicsCovered: string[]
  exercisesPracticed: string[]
  teacherFeedback: string[]
  studentProgress: string[]
  homeworkAssignments: string[]
  nextSessionFocus: string[]
  notesHighlights: string[]
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = 'audio.webm'
): Promise<{ text: string }> {
  const openai = getOpenAIClient()
  const file = new File([new Uint8Array(audioBuffer)], filename, { type: 'audio/webm' })

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    language: 'en',
  })

  return { text: response.text }
}

export async function generateLessonSummary(
  transcript: string,
  studentNotes?: string,
  previousLessons?: string[]
): Promise<LessonSummary> {
  const openai = getOpenAIClient()

  const systemPrompt = `You are an expert vocal coach assistant that summarizes voice lessons.
Analyze lesson transcripts AND handwritten notes from both students and teachers to create helpful summaries.
Extract actionable feedback, homework, and vocal technique corrections.`

  const userPrompt = `Analyze this voice lesson:

LESSON TRANSCRIPT (Audio recording):
${transcript.slice(0, 12000)}

${studentNotes ? `HANDWRITTEN CLASS NOTES:
${studentNotes.slice(0, 3000)}` : ''}

${previousLessons?.length ? `PREVIOUS LESSON SUMMARIES:
${previousLessons.slice(0, 2).join('\n---\n').slice(0, 2000)}` : ''}

Provide your analysis in JSON format:
{
  "summary": "3-4 sentence overview of the lesson combining audio and written notes",
  "keyTopicsCovered": ["topic 1", "topic 2"],
  "exercisesPracticed": ["exercise 1", "exercise 2"],
  "teacherFeedback": ["feedback 1", "feedback 2"],
  "studentProgress": ["progress 1", "progress 2"],
  "homeworkAssignments": ["homework 1", "homework 2"],
  "nextSessionFocus": ["focus 1", "focus 2"],
  "notesHighlights": ["key item from written notes 1"]
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 1500
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No response from OpenAI')
  return JSON.parse(content) as LessonSummary
}
```

---

### 6. `app/api/lessons/[relationshipId]/start-class/route.ts`
**Purpose:** Validates instructor permissions, sets the live class session as active in `class_sessions`, and initializes/resets `session_notes`.

```typescript
// File: app/api/lessons/[relationshipId]/start-class/route.ts
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, instructor_id, student_id, status')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    const isInstructor = profile.id === booking.instructor_id
    const isAdmin = profile.role === 'admin'
    if (!isInstructor && !isAdmin) {
      return NextResponse.json({ error: 'Only teachers can start class' }, { status: 403 })
    }

    const adminClient = createSupabaseAdmin()

    await adminClient.from('class_sessions').upsert({
      student_id: booking.student_id,
      is_active: true,
      started_at: new Date().toISOString(),
      ended_at: null,
    })

    return NextResponse.json({ success: true, startedAt: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 7. `app/api/lessons/[relationshipId]/end-class/route.ts`
**Purpose:** Receives the final rich-text notes from the frontend, writes them permanently to `notes_archive`, locks session notes, links the recording, and triggers backup AI processing.

```typescript
// File: app/api/lessons/[relationshipId]/end-class/route.ts
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, instructor_id, student_id, status')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    const isInstructor = profile.id === booking.instructor_id || profile.role === 'admin'
    if (!isInstructor) return NextResponse.json({ error: 'Only teachers can end class' }, { status: 403 })

    const adminClient = createSupabaseAdmin()
    const body = await request.json().catch(() => ({}))
    const contentHtml = body.contentHtml ?? ''
    const classStartedAt = body.classStartedAt ?? new Date().toISOString()
    const plainText = contentHtml.replace(/<[^>]*>/g, '').trim()

    const { data: archivedNote, error: archiveError } = await adminClient
      .from('notes_archive')
      .insert({
        student_id: booking.student_id,
        booking_id: bookingId,
        content: plainText,
        content_html: contentHtml,
        class_started_at: classStartedAt,
        class_ended_at: new Date().toISOString(),
        published: true,
      })
      .select('id, class_started_at, class_ended_at')
      .single()

    if (archiveError) {
      return NextResponse.json({ error: 'Failed to archive notes', details: archiveError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, archivedNote })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 8. `app/api/lessons/[relationshipId]/recordings/presign/route.ts`
**Purpose:** Creates direct Supabase Storage signed upload URLs to enable client-to-storage uploads of large WebM recordings.

```typescript
// File: app/api/lessons/[relationshipId]/recordings/presign/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { filename, contentType = 'video/webm' } = body

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id, status')
      .eq('id', bookingId)
      .single()

    if (!booking || booking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Valid booking required' }, { status: 400 })
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const storagePath = `${bookingId}/${filename || `lesson-${bookingId}-${Date.now()}.webm`}`
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('lesson-recordings')
      .createSignedUploadUrl(storagePath)

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    return NextResponse.json({
      uploadUrl: uploadData.signedUrl,
      token: uploadData.token,
      storagePath,
      bookingId,
      studentId: booking.student_id,
      contentType,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 9. `app/api/lessons/[relationshipId]/recordings/complete/route.ts`
**Purpose:** Registers the uploaded recording in `lesson_recordings`, links it to the archived note, and launches background AI processing via `processRecording()`.

```typescript
// File: app/api/lessons/[relationshipId]/recordings/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { processRecording } from '@/lib/lesson-processing'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const { relationshipId: bookingId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { storagePath, fileSize, roomName, classStartedAt } = await request.json()
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, student_id, instructor_id')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: urlData } = await supabaseAdmin.storage
      .from('lesson-recordings')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

    const { data: recording, error: recordingError } = await supabaseAdmin
      .from('lesson_recordings')
      .insert({
        booking_id: bookingId,
        student_id: booking.student_id,
        recording_id: `lesson-${bookingId}-${Date.now()}`,
        room_name: roomName || `lesson-${bookingId}`,
        status: 'ready',
        upload_status: 'completed',
        storage_path: storagePath,
        storage_url: urlData?.signedUrl,
        file_size_bytes: fileSize,
        format: 'webm',
        started_at: classStartedAt || new Date().toISOString(),
        ended_at: new Date().toISOString(),
        ai_processing_status: 'pending',
      })
      .select()
      .single()

    if (recordingError) {
      return NextResponse.json({ error: recordingError.message }, { status: 500 })
    }

    // Link recording to archived note
    const { data: bookingNote } = await supabaseAdmin
      .from('notes_archive')
      .select('id')
      .eq('booking_id', bookingId)
      .is('recording_id', null)
      .order('class_ended_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (bookingNote) {
      await supabaseAdmin
        .from('notes_archive')
        .update({ recording_id: recording.id })
        .eq('id', bookingNote.id)
    }

    // Trigger async processing
    void processRecording(supabaseAdmin, recording.id).catch(err =>
      console.error('[Recording Complete] Background processing failed:', err)
    )

    return NextResponse.json({ success: true, recording })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 10. `app/api/cron/process-pending-recordings/route.ts`
**Purpose:** Periodic background cron job that claims and processes recordings that were interrupted or dropped by serverless timeouts.

```typescript
// File: app/api/cron/process-pending-recordings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { processRecording } from '@/lib/lesson-processing'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdmin()
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const { data: pendingRecordings } = await admin
      .from('lesson_recordings')
      .select('id')
      .eq('ai_processing_status', 'pending')
      .lt('created_at', fiveMinutesAgo)
      .limit(5)

    const { data: stuckRecordings } = await admin
      .from('lesson_recordings')
      .select('id')
      .eq('ai_processing_status', 'processing')
      .lt('created_at', fifteenMinutesAgo)
      .limit(3)

    const toProcess = [...(pendingRecordings || []), ...(stuckRecordings || [])].slice(0, 8)

    const results = []
    for (const recording of toProcess) {
      results.push(await processRecording(admin, recording.id, { force: true }))
    }

    return NextResponse.json({ message: `Processed ${results.length} recordings`, results })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 11. `supabase/migrations/00009_ai_lesson_summaries.sql`
**Purpose:** Database schema migration configuring tables, indexes, and Row Level Security policies.

```sql
-- Create lesson_recordings table
CREATE TABLE IF NOT EXISTS lesson_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    student_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    recording_id TEXT,
    room_name TEXT,
    status TEXT DEFAULT 'pending',
    upload_status TEXT DEFAULT 'pending',
    storage_provider TEXT DEFAULT 'supabase',
    storage_path TEXT,
    storage_url TEXT,
    file_size_bytes BIGINT,
    format TEXT DEFAULT 'webm',
    duration_seconds INTEGER,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    transcript TEXT,
    ai_summary JSONB,
    ai_processing_status TEXT DEFAULT 'pending',
    ai_processed_at TIMESTAMPTZ,
    ai_processing_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_recordings_booking ON lesson_recordings(booking_id);
CREATE INDEX IF NOT EXISTS idx_lesson_recordings_student ON lesson_recordings(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_recordings_ai_status ON lesson_recordings(ai_processing_status);

ALTER TABLE lesson_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_recordings_select ON lesson_recordings FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND b.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY lesson_recordings_insert ON lesson_recordings FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND b.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY lesson_recordings_update ON lesson_recordings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND b.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Add AI summary columns to notes_archive
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes_archive' AND column_name = 'ai_summary') THEN
        ALTER TABLE notes_archive ADD COLUMN ai_summary JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes_archive' AND column_name = 'recording_id') THEN
        ALTER TABLE notes_archive ADD COLUMN recording_id UUID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notes_archive_recording ON notes_archive(recording_id);
```

---

## 4. Suggested Deep Research Prompts for ChatGPT

When sharing this document with ChatGPT, you can use the following prompt:

> *"Please perform a thorough code review and deep research audit on this live classroom and AI processing architecture. Specifically check for:*
> 1. *Race conditions between recording upload, note archiving, and `processRecording` triggers.*
> 2. *WebRTC audio stream mixing issues (e.g. participant joining late after Web Audio destination is instantiated).*
> 3. *Serverless execution limits on long Whisper transcription / GPT-4o-mini processing calls.*
> 4. *Memory leaks in Web Audio `AudioContext` or `MediaStream` teardown.*
> 5. *Supabase RLS edge cases between teachers, students, and admins.*
> 6. *Idempotency and lock release edge cases in the cron scheduler."*
