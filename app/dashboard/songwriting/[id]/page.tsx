'use client'

import { useState, useEffect, use } from 'react'
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

const VIBES = ['Melancholic', 'Uplifting', 'Dreamy', 'Energetic', 'Nostalgic', 'Mysterious', 'Romantic', 'Rebellious', 'Peaceful', 'Intense']
const MOODS = ['Happy', 'Sad', 'Hopeful', 'Angry', 'Reflective', 'Playful', 'Bittersweet', 'Empowered', 'Vulnerable', 'Grateful']
const GENRES = ['Pop', 'Rock', 'R&B', 'Country', 'Hip-Hop', 'Jazz', 'Folk', 'Electronic', 'Indie', 'Soul', 'Blues', 'Musical Theatre']
const TEMPOS = ['Slow Ballad', 'Mid-tempo', 'Upbeat', 'Dance', 'Laid-back Groove']

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
  const [showCoachPanel, setShowCoachPanel] = useState(true)
  const [showMetadata, setShowMetadata] = useState(true)

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
Your main message - make it memorable and singable

[Verse 2]
Develop your story further

[Bridge]
A shift in perspective or emotion`,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[400px] px-6 py-4 prose-headings:text-white prose-p:text-slate-200 prose-strong:text-white text-slate-200',
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
        })
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
        })
      })

      const data = await response.json()
      setCoaching(data)
    } catch (error) {
      console.error('Error getting tips:', error)
      alert('Failed to get coaching tips')
    } finally {
      setIsGettingTips(false)
    }
  }

  const toggleEmotion = (emotion: string) => {
    setKeyEmotions(prev =>
      prev.includes(emotion)
        ? prev.filter(e => e !== emotion)
        : [...prev, emotion]
    )
    setIsDirty(true)
  }

  if (isLoading || !editor) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#171229]">
        <div className="w-10 h-10 border-4 border-[#a855f7]/30 border-t-[#a855f7] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#171229] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#171229]/95 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/songwriting')}
              className="p-2 hover:bg-white/[0.08] rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7] via-[#7c3aed] to-[#4f46e5] flex items-center justify-center shadow-lg shadow-[#a855f7]/20">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setIsDirty(true) }}
              className="text-xl font-semibold text-white bg-transparent border-none focus:outline-none w-auto min-w-[200px]"
              placeholder="Song Title"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Save Status */}
            <div className="flex items-center gap-2 text-sm text-slate-400">
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></>
              ) : lastSaved ? (
                <><Clock className="w-4 h-4" /><span>Saved {lastSaved.toLocaleTimeString()}</span></>
              ) : isDirty ? (
                <span className="text-amber-400">Unsaved changes</span>
              ) : null}
            </div>

            {/* Get Tips Button */}
            <button
              onClick={getCoachingTips}
              disabled={isGettingTips}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#8b5cf6] text-white font-semibold rounded-xl transition-all shadow-lg shadow-[#a855f7]/20 disabled:opacity-50"
            >
              {isGettingTips ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              Get AI Tips
            </button>

            {/* Save Button */}
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving || !isDirty}
              className="flex items-center gap-2 px-4 py-2 glass-button border-[#a855f7]/35 text-[#f3e8ff] hover:border-[#a855f7]/60 font-semibold rounded-xl transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-t border-white/[0.06]">
          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30"
          >
            <Redo className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-white/[0.08] mx-2" />
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-[#a855f7]/20 text-[#d8b4fe]' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'}`}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded-lg transition-colors ${editor.isActive('italic') ? 'bg-[#a855f7]/20 text-[#d8b4fe]' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'}`}
          >
            <Italic className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-white/[0.08] mx-2" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded-lg transition-colors ${editor.isActive('bulletList') ? 'bg-[#a855f7]/20 text-[#d8b4fe]' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded-lg transition-colors ${editor.isActive('orderedList') ? 'bg-[#a855f7]/20 text-[#d8b4fe]' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'}`}
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <span className="text-sm text-slate-500">
            {editor.getText().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Editor Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Metadata Section */}
          <div className="max-w-4xl mx-auto px-6 py-4">
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="flex items-center gap-2 text-slate-400 hover:text-white mb-3"
            >
              {showMetadata ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span className="text-sm font-medium">Song Details & Inspiration</span>
            </button>

            {showMetadata && (
              <div className="glass-card-subtle rounded-2xl p-5 border-white/[0.08] mb-6 space-y-5">
                {/* Vibe, Mood, Genre, Tempo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Vibe</label>
                    <select
                      value={vibe}
                      onChange={(e) => { setVibe(e.target.value); setIsDirty(true) }}
                      className="w-full px-3 py-2 glass-input text-sm"
                    >
                      <option value="">Select vibe...</option>
                      {VIBES.map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Mood</label>
                    <select
                      value={mood}
                      onChange={(e) => { setMood(e.target.value); setIsDirty(true) }}
                      className="w-full px-3 py-2 glass-input text-sm"
                    >
                      <option value="">Select mood...</option>
                      {MOODS.map(m => <option key={m} value={m.toLowerCase()}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Genre</label>
                    <select
                      value={genre}
                      onChange={(e) => { setGenre(e.target.value); setIsDirty(true) }}
                      className="w-full px-3 py-2 glass-input text-sm"
                    >
                      <option value="">Select genre...</option>
                      {GENRES.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Tempo</label>
                    <select
                      value={tempo}
                      onChange={(e) => { setTempo(e.target.value); setIsDirty(true) }}
                      className="w-full px-3 py-2 glass-input text-sm"
                    >
                      <option value="">Select tempo...</option>
                      {TEMPOS.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Inspiration Story */}
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">What inspired this song? (Your story)</label>
                  <textarea
                    value={inspirationStory}
                    onChange={(e) => { setInspirationStory(e.target.value); setIsDirty(true) }}
                    placeholder="Share the moment, memory, or feeling that sparked this song. The more specific, the better your AI coach can help..."
                    rows={3}
                    className="w-full px-3 py-2 glass-input text-sm placeholder-slate-500 resize-none"
                  />
                </div>

                {/* Key Emotions */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Key emotions to convey (select multiple)</label>
                  <div className="flex flex-wrap gap-2">
                    {['Love', 'Heartbreak', 'Hope', 'Freedom', 'Longing', 'Joy', 'Anger', 'Peace', 'Confusion', 'Triumph', 'Loss', 'Desire'].map(emotion => (
                      <button
                        key={emotion}
                        onClick={() => toggleEmotion(emotion.toLowerCase())}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          keyEmotions.includes(emotion.toLowerCase())
                            ? 'bg-[#a855f7]/30 text-[#f3e8ff] border border-[#a855f7]/55'
                            : 'bg-white/[0.04] text-slate-300 border border-white/[0.1] hover:border-white/[0.2]'
                        }`}
                      >
                        {emotion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Editor */}
            <div className="glass-card rounded-2xl border-white/[0.08] min-h-[500px]">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {/* AI Coach Panel */}
        {showCoachPanel && (
          <div className="w-96 border-l border-white/[0.08] bg-[#171229]/60 backdrop-blur-xl overflow-y-auto">
            <div className="sticky top-0 bg-[#171229]/95 backdrop-blur-xl border-b border-white/[0.08] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  AI Songwriting Coach
                </h3>
                <button
                  onClick={() => setShowCoachPanel(false)}
                  className="p-1 hover:bg-white/[0.08] rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Grammy-level feedback on your lyrics</p>
            </div>

            <div className="p-4 space-y-4">
              {!coaching ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/10 rounded-full flex items-center justify-center">
                    <Wand2 className="w-8 h-8 text-amber-400" />
                  </div>
                  <h4 className="font-medium text-white mb-2">Ready to Coach</h4>
                  <p className="text-sm text-slate-400 mb-4">
                    Write some lyrics and click &quot;Get AI Tips&quot; for personalized songwriting advice.
                  </p>
                </div>
              ) : (
                <>
                  {/* Overall Feedback */}
                  <div className="bg-gradient-to-r from-[#a855f7]/18 to-[#4f46e5]/18 rounded-xl p-4 border border-[#a855f7]/30">
                    <p className="text-[#e9d5ff] text-sm">{coaching.overallFeedback}</p>
                  </div>

                  {/* Strengths */}
                  {coaching.songStrengths?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-green-400 mb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        What&apos;s Working
                      </h4>
                      <div className="space-y-2">
                        {coaching.songStrengths.map((strength, i) => (
                          <div key={i} className="text-sm text-slate-300 bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                            {strength}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tips */}
                  {coaching.tips?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        Suggestions
                      </h4>
                      <div className="space-y-3">
                        {coaching.tips.map((tip, i) => (
                          <div key={i} className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.08]">
                            {tip.originalText && (
                              <p className="text-xs text-slate-500 mb-2 italic">&quot;{tip.originalText}&quot;</p>
                            )}
                            <p className="text-sm text-white mb-2">{tip.suggestion}</p>
                            <p className="text-xs text-slate-400">{tip.reasoning}</p>
                            {tip.exampleRewrite && (
                              <div className="mt-2 p-2 bg-[#a855f7]/12 rounded-lg border border-[#a855f7]/25">
                                <p className="text-xs text-[#e9d5ff]">Try: &quot;{tip.exampleRewrite}&quot;</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Next Steps */}
                  {coaching.nextSteps?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Next Steps
                      </h4>
                      <div className="space-y-2">
                        {coaching.nextSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                            <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs flex-shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Refresh Tips */}
                  <button
                    onClick={getCoachingTips}
                    disabled={isGettingTips}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 glass-button text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isGettingTips ? 'animate-spin' : ''}`} />
                    Get Fresh Tips
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toggle Coach Panel Button (when closed) */}
      {!showCoachPanel && (
        <button
          onClick={() => setShowCoachPanel(true)}
          className="fixed right-4 bottom-4 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white font-semibold rounded-xl shadow-lg shadow-[#a855f7]/25 hover:scale-105 transition-all"
        >
          <Sparkles className="w-5 h-5" />
          AI Coach
        </button>
      )}
    </div>
  )
}
