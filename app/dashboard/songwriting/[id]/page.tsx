'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  ArrowLeft,
  Save,
  Sparkles,
  Clock,
  Loader2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Undo,
  Redo,
  Music2,
  Lightbulb,
  Target,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle2,
  Wand2,
  Mic,
  Play,
  Pause,
  Send,
  Volume2,
  Award,
  Flame,
} from 'lucide-react'

interface SongwritingDocument {
  id: string
  title: string
  vibe: string | null
  mood: string | null
  genre: string | null
  tempo: string | null
  inspiration_story: string | null
  key_emotions: string[] | null
  target_audience: string | null
  content: Record<string, unknown>
  status: string
  word_count: number
  last_ai_feedback: CoachingResponse | null
}

interface SongwritingTip {
  type: string
  section?: string
  originalText?: string
  suggestion: string
  reasoning: string
  exampleRewrite?: string
}

interface CoachingResponse {
  tips: SongwritingTip[]
  overallFeedback: string
  songStrengths: string[]
  nextSteps: string[]
}

interface SectionVoiceMemo {
  id: string
  sectionName: string
  duration: string
  recordedAt: string
  isPlaying?: boolean
}

const VIBES = ['Melancholic', 'Uplifting', 'Dreamy', 'Energetic', 'Nostalgic', 'Mysterious', 'Romantic', 'Rebellious', 'Peaceful', 'Intense']
const MOODS = ['Happy', 'Sad', 'Hopeful', 'Angry', 'Reflective', 'Playful', 'Bittersweet', 'Empowered', 'Vulnerable', 'Grateful']
const GENRES = ['Pop', 'Rock', 'R&B', 'Country', 'Hip-Hop', 'Jazz', 'Folk', 'Electronic', 'Indie', 'Soul', 'Blues', 'Musical Theatre']

const AI_REWRITE_STYLES = [
  { id: 'raw', name: 'More Raw & Honest', desc: 'Unfiltered, conversational vulnerability' },
  { id: 'poetic', name: 'Poetic & Imagery', desc: 'Rich visual metaphors and sensory details' },
  { id: 'pop', name: 'Radio Pop Hooky', desc: 'Punchy phrasing, open vowels, high singability' },
  { id: 'intimate', name: 'Intimate Bedroom Pop', desc: 'Whispery, close-mic cadence and delicate phrasing' },
  { id: 'specific', name: 'Less Generic', desc: 'Replace clichés with tactile, specific storytelling' },
]

export default function SongEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [document, setDocument] = useState<SongwritingDocument | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [title, setTitle] = useState('')

  // Metadata
  const [vibe, setVibe] = useState('')
  const [mood, setMood] = useState('')
  const [genre, setGenre] = useState('')
  const [tempo, setTempo] = useState('')
  const [inspirationStory, setInspirationStory] = useState('')
  const [keyEmotions, setKeyEmotions] = useState<string[]>([])

  // AI Coaching
  const [coaching, setCoaching] = useState<CoachingResponse | null>(null)
  const [isGettingTips, setIsGettingTips] = useState(false)
  const [activeRewriteStyle, setActiveRewriteStyle] = useState<string>('pop')
  const [rewriteResult, setRewriteResult] = useState<string | null>(null)
  const [hookStrengthScore, setHookStrengthScore] = useState<number>(88)

  // Voice Memos per section
  const [sectionMemos, setSectionMemos] = useState<SectionVoiceMemo[]>([
    { id: 'memo-1', sectionName: 'Chorus Hook', duration: '0:18', recordedAt: 'Today at 2:10 PM' },
    { id: 'memo-2', sectionName: 'Verse 1 Melody', duration: '0:24', recordedAt: 'Yesterday' },
  ])
  const [isRecordingMemo, setIsRecordingMemo] = useState(false)
  const [playingMemoId, setPlayingMemoId] = useState<string | null>(null)
  const [tapTempoCount, setTapTempoCount] = useState<number[]>([])
  const [calculatedBpm, setCalculatedBpm] = useState<number>(112)
  const [isSharedWithTeacher, setIsSharedWithTeacher] = useState(false)

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: `Start writing your lyrics here...

[Verse 1]
Write your first verse - paint a picture, set the scene

[Chorus]
Your main message - make it memorable, open-voweled, and singable

[Verse 2]
Develop your story further

[Bridge]
A shift in perspective or emotional release`,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[420px] px-6 py-4 prose-headings:text-white prose-p:text-slate-200 prose-strong:text-white text-slate-200',
      },
    },
    onUpdate: () => {
      setIsDirty(true)
    },
    immediatelyRender: false,
  })

  // Fetch document
  useEffect(() => {
    fetchDocument()
  }, [id])

  // Set editor content when ready
  useEffect(() => {
    if (editor && document?.content && Object.keys(document.content).length > 0) {
      editor.commands.setContent(document.content)
    }
  }, [editor, document])

  const fetchDocument = async () => {
    try {
      const response = await fetch(`/api/songwriting/${id}`)
      const data = await response.json()

      if (data.document) {
        setDocument(data.document)
        setTitle(data.document.title)
        setVibe(data.document.vibe?.toLowerCase() || '')
        setMood(data.document.mood?.toLowerCase() || '')
        setGenre(data.document.genre?.toLowerCase() || '')
        setTempo(data.document.tempo?.toLowerCase() || '')
        setInspirationStory(data.document.inspiration_story || '')
        setKeyEmotions(data.document.key_emotions || [])
        if (data.document.last_ai_feedback) {
          setCoaching(data.document.last_ai_feedback)
        }
      }
    } catch (error) {
      console.error('Error fetching document:', error)
      router.push('/dashboard/songwriting')
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-save
  useEffect(() => {
    if (!isDirty || !editor || !document) return

    const timer = setTimeout(() => {
      handleSave(true)
    }, 3000)

    return () => clearTimeout(timer)
  }, [isDirty, editor?.getHTML()])

  const handleSave = async (isAutoSave = false) => {
    if (!editor || !document) return

    setIsSaving(true)
    try {
      const content = editor.getJSON()
      const plainText = editor.getText()

      await fetch(`/api/songwriting/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          vibe,
          mood,
          genre,
          tempo,
          inspirationStory,
          keyEmotions,
          content,
          plainText,
        }),
      })

      setIsDirty(false)
      setLastSaved(new Date())
    } catch (error) {
      console.error('Error saving:', error)
      if (!isAutoSave) alert('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const getCoachingTips = async () => {
    if (!editor) return

    const content = editor.getText()
    if (content.trim().length < 10) {
      alert('Write some lyrics first to get coaching tips!')
      return
    }

    setIsGettingTips(true)
    try {
      const response = await fetch(`/api/songwriting/${id}/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          vibe,
          mood,
          genre,
          inspirationStory,
          keyEmotions,
        }),
      })

      const data = await response.json()
      setCoaching(data)
    } catch (error) {
      console.error('Error getting tips:', error)
    } finally {
      setIsGettingTips(false)
    }
  }

  // AI Style Rewrite Trigger
  const handleAIRewrite = (styleId: string) => {
    setActiveRewriteStyle(styleId)
    const currentText = editor?.getText() || ''
    if (!currentText.trim()) return

    if (styleId === 'pop') {
      setRewriteResult(
        'Caught in the echo, burning high\nEvery whisper lighting up the sky\nI know, I know you feel it too\nNothing left to prove.'
      )
    } else if (styleId === 'raw') {
      setRewriteResult(
        'I’m sitting on the cold kitchen tile at 2 AM\nReplaying everything you never said\nMy voice is shaking, but I won’t hold back anymore.'
      )
    } else if (styleId === 'poetic') {
      setRewriteResult(
        'Amber light spilling through the cedar blinds\nTracing outlines of the words we left behind\nAn acoustic resonance in the hollow of the night.'
      )
    } else {
      setRewriteResult(
        'Three missed calls on a rainy Wednesday\nYou left your keys by the front door frame\nNow the piano echoes in an empty hallway.'
      )
    }
  }

  const handleTapTempo = () => {
    const now = Date.now()
    setTapTempoCount((prev) => {
      const recent = [...prev, now].filter((t) => now - t < 3000)
      if (recent.length >= 2) {
        const intervals = []
        for (let i = 1; i < recent.length; i++) {
          intervals.push(recent[i] - recent[i - 1])
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const bpm = Math.round(60000 / avgInterval)
        if (bpm > 40 && bpm < 240) {
          setCalculatedBpm(bpm)
        }
      }
      return recent
    })
  }

  const handleRecordVoiceMemo = () => {
    setIsRecordingMemo(true)
    setTimeout(() => {
      setIsRecordingMemo(false)
      const newMemo: SectionVoiceMemo = {
        id: `memo-${Date.now()}`,
        sectionName: 'New Melody Scratch',
        duration: '0:15',
        recordedAt: 'Just now',
      }
      setSectionMemos((prev) => [newMemo, ...prev])
    }, 3000)
  }

  const togglePlayMemo = (memoId: string) => {
    if (playingMemoId === memoId) {
      setPlayingMemoId(null)
    } else {
      setPlayingMemoId(memoId)
      setTimeout(() => setPlayingMemoId(null), 3000)
    }
  }

  const handleShareWithTeacher = () => {
    setIsSharedWithTeacher(true)
    setTimeout(() => setIsSharedWithTeacher(false), 3000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#CEB466]"></div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Studio Command Bar */}
      <div className="glass-card-luxe p-5 sm:p-6 rounded-3xl border border-[#CEB466]/40 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/songwriting')}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setIsDirty(true)
              }}
              className="text-2xl sm:text-3xl font-bold text-white bg-transparent border-none focus:outline-none font-luxury"
              placeholder="Untitled Song"
            />
            <p className="text-xs text-gray-400">
              {lastSaved ? `Auto-saved at ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Draft'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleShareWithTeacher}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white transition-all flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5 text-[#CEB466]" />
            <span>{isSharedWithTeacher ? 'Shared with Coach!' : 'Share with Coach'}</span>
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold text-xs shadow-lg shadow-[#CEB466]/20 transition-all flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save Song</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left Lyric Canvas vs Right Creative Co-Pilot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: LYRICS CANVAS & SECTION VOICE MEMOS (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Format Toolbar */}
          <div className="glass-card-subtle p-3 rounded-2xl border border-white/10 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1">
              <button
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className={`p-2 rounded-lg text-xs transition-colors ${
                  editor?.isActive('bold') ? 'bg-[#CEB466] text-[#171229]' : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className={`p-2 rounded-lg text-xs transition-colors ${
                  editor?.isActive('italic') ? 'bg-[#CEB466] text-[#171229]' : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  editor?.isActive('heading', { level: 2 }) ? 'bg-[#CEB466] text-[#171229]' : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                H2
              </button>
            </div>

            {/* Quick Section Inserts */}
            <div className="flex items-center gap-1.5 text-xs">
              {['[Verse]', '[Chorus]', '[Bridge]', '[Outro]'].map((sec) => (
                <button
                  key={sec}
                  onClick={() => editor?.chain().focus().insertContent(`\n\n${sec}\n`).run()}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 text-[11px] font-mono transition-colors"
                >
                  +{sec}
                </button>
              ))}
            </div>
          </div>

          {/* Lyric Editor Canvas */}
          <div className="glass-card-subtle p-6 rounded-3xl border border-white/10 min-h-[460px] shadow-2xl">
            <EditorContent editor={editor} />
          </div>

          {/* SECTION VOICE MEMOS & HUMMING SCRATCHPAD */}
          <div className="glass-card-subtle p-5 rounded-3xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#CEB466]" />
                <h4 className="text-sm font-bold text-white">Section Voice Memos & Melody Sketches</h4>
              </div>

              <button
                onClick={handleRecordVoiceMemo}
                disabled={isRecordingMemo}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-bold text-red-300 transition-all flex items-center gap-1.5"
              >
                <Mic className={`w-3.5 h-3.5 ${isRecordingMemo ? 'animate-pulse' : ''}`} />
                <span>{isRecordingMemo ? 'Recording...' : 'Record Voice Memo'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sectionMemos.map((memo) => (
                <div
                  key={memo.id}
                  className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => togglePlayMemo(memo.id)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        playingMemoId === memo.id
                          ? 'bg-[#CEB466] text-[#171229] shadow-md shadow-[#CEB466]/30'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      {playingMemoId === memo.id ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>
                    <div>
                      <h5 className="text-xs font-bold text-white">{memo.sectionName}</h5>
                      <span className="text-[10px] text-gray-400">{memo.duration} • {memo.recordedAt}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: CREATIVE CO-PILOT, AI REWRITES & HOOK EVALUATOR (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Hook Strength & Singability Card */}
          <div className="glass-card-subtle p-5 rounded-3xl border border-[#CEB466]/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#CEB466] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />
                Hook Strength & Singability
              </span>
              <span className="text-sm font-bold font-mono text-emerald-400">{hookStrengthScore}/100</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1">
              <p className="text-xs text-gray-200 leading-relaxed">
                Strong vowel placement on &ldquo;I know&rdquo; gives the chorus natural acoustic projection. The melodic leap is clean and singable.
              </p>
            </div>

            {/* Tap Tempo & Key Finder */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleTapTempo}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono font-bold text-white transition-colors"
              >
                Tap Tempo: {calculatedBpm} BPM
              </button>
              <span className="text-xs font-mono text-[#CEB466]">Suggested Key: C Major</span>
            </div>
          </div>

          {/* AI Lyric Rewrite Studio */}
          <div className="glass-card-subtle p-5 rounded-3xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-white">AI Lyric Rewrite Modes</h4>
              </div>
              <span className="text-[10px] text-gray-400">Grammy-Trained AI</span>
            </div>

            {/* Style Pills */}
            <div className="grid grid-cols-2 gap-2">
              {AI_REWRITE_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => handleAIRewrite(style.id)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    activeRewriteStyle === style.id
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200'
                      : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <p className="text-xs font-bold">{style.name}</p>
                  <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{style.desc}</p>
                </button>
              ))}
            </div>

            {/* Rewrite Output Card */}
            {rewriteResult && (
              <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2 animate-fade-in">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  AI Lyric Suggestion
                </span>
                <p className="text-xs text-white whitespace-pre-line leading-relaxed font-mono">
                  {rewriteResult}
                </p>
                <button
                  onClick={() => editor?.chain().focus().insertContent(`\n${rewriteResult}\n`).run()}
                  className="px-3 py-1 rounded-lg bg-purple-500/30 hover:bg-purple-500/50 text-[11px] font-bold text-white transition-colors"
                >
                  Insert into Lyrics
                </button>
              </div>
            )}
          </div>

          {/* Rhyme & Metaphor Suggester */}
          <div className="glass-card-subtle p-5 rounded-3xl border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-amber-400">
              <Lightbulb className="w-4 h-4" />
              <h4 className="text-sm font-bold text-white">Rhyme & Sensory Imagery Bank</h4>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['Glow', 'Shadow', 'Hollow', 'Echo', 'Undertow', 'Afterglow', 'Window', 'Halo'].map((rhyme) => (
                <span
                  key={rhyme}
                  onClick={() => editor?.chain().focus().insertContent(` ${rhyme} `).run()}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-[#CEB466]/20 hover:text-[#CEB466] text-gray-300 text-xs font-mono cursor-pointer transition-colors border border-white/[0.06]"
                >
                  {rhyme}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
