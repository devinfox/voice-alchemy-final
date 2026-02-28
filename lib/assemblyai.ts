/**
 * AssemblyAI Client for Speaker Diarization
 *
 * Uses AssemblyAI's speaker diarization to distinguish between
 * teacher and student in lesson recordings.
 */

import { AssemblyAI } from 'assemblyai'

// Lazy initialization
let assemblyaiClient: AssemblyAI | null = null

export function getAssemblyAIClient(): AssemblyAI {
  if (!assemblyaiClient) {
    const apiKey = process.env.ASSEMBLYAI_API_KEY
    if (!apiKey) {
      throw new Error('ASSEMBLYAI_API_KEY environment variable is not set')
    }
    assemblyaiClient = new AssemblyAI({ apiKey })
  }
  return assemblyaiClient
}

export interface SpeakerUtterance {
  speaker: 'TEACHER' | 'STUDENT'
  text: string
  start: number
  end: number
  confidence: number
}

export interface DiarizedTranscript {
  text: string
  utterances: SpeakerUtterance[]
  speakerWordCounts: {
    teacher: number
    student: number
  }
}

/**
 * Transcribe audio with speaker diarization using AssemblyAI
 *
 * Uses heuristic: the speaker who talks more is likely the teacher
 */
export async function transcribeWithDiarization(
  audioBuffer: Buffer
): Promise<DiarizedTranscript> {
  console.log(`[AssemblyAI] 🚀 Starting transcription with diarization`)
  console.log(`[AssemblyAI] Audio buffer size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`)

  const client = getAssemblyAIClient()

  // Upload the audio file
  console.log(`[AssemblyAI] 📤 Uploading audio to AssemblyAI...`)
  const uploadStart = Date.now()
  const uploadUrl = await client.files.upload(audioBuffer)
  console.log(`[AssemblyAI] ✅ Upload complete in ${Date.now() - uploadStart}ms`)
  console.log(`[AssemblyAI] Upload URL: ${uploadUrl.slice(0, 50)}...`)

  // Create transcription with speaker diarization
  console.log(`[AssemblyAI] 🎙️ Starting transcription with speaker_labels=true...`)
  const transcribeStart = Date.now()
  const transcript = await client.transcripts.transcribe({
    audio: uploadUrl,
    speaker_labels: true,
    language_code: 'en',
  })
  console.log(`[AssemblyAI] ✅ Transcription complete in ${Date.now() - transcribeStart}ms`)
  console.log(`[AssemblyAI] Transcript status: ${transcript.status}`)
  console.log(`[AssemblyAI] Transcript ID: ${transcript.id}`)

  if (transcript.status === 'error') {
    console.error(`[AssemblyAI] ❌ Transcription error: ${transcript.error}`)
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`)
  }

  console.log(`[AssemblyAI] 📊 Transcript stats:`)
  console.log(`   - Text length: ${transcript.text?.length || 0} chars`)
  console.log(`   - Utterances: ${transcript.utterances?.length || 0}`)
  console.log(`   - Audio duration: ${transcript.audio_duration}s`)
  console.log(`   - Confidence: ${(transcript.confidence || 0) * 100}%`)

  if (!transcript.utterances || transcript.utterances.length === 0) {
    console.log(`[AssemblyAI] ⚠️ No utterances detected - returning plain transcript`)
    return {
      text: transcript.text || '',
      utterances: [],
      speakerWordCounts: { teacher: 0, student: 0 },
    }
  }

  // Count words per speaker to determine who is teacher vs student
  const speakerWordCounts: Record<string, number> = {}

  for (const utterance of transcript.utterances) {
    const speaker = utterance.speaker
    const wordCount = utterance.text.split(/\s+/).filter(Boolean).length
    speakerWordCounts[speaker] = (speakerWordCounts[speaker] || 0) + wordCount
  }

  console.log(`[AssemblyAI] 👥 Speaker analysis:`)
  Object.entries(speakerWordCounts).forEach(([speaker, count]) => {
    console.log(`   - Speaker ${speaker}: ${count} words`)
  })

  // Sort speakers by word count (descending)
  const sortedSpeakers = Object.entries(speakerWordCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([speaker]) => speaker)

  // Teacher is assumed to speak more
  const teacherSpeakerId = sortedSpeakers[0]
  const studentSpeakerId = sortedSpeakers[1] || 'B' // Default if only one speaker

  console.log(`[AssemblyAI] 🎓 Speaker mapping:`)
  console.log(`   - TEACHER = Speaker ${teacherSpeakerId} (${speakerWordCounts[teacherSpeakerId]} words)`)
  console.log(`   - STUDENT = Speaker ${studentSpeakerId} (${speakerWordCounts[studentSpeakerId] || 0} words)`)

  // Map utterances with labeled speakers
  const utterances: SpeakerUtterance[] = transcript.utterances.map((u) => ({
    speaker: u.speaker === teacherSpeakerId ? 'TEACHER' : 'STUDENT',
    text: u.text,
    start: u.start,
    end: u.end,
    confidence: u.confidence,
  }))

  console.log(`[AssemblyAI] ✅ Diarization complete - ${utterances.length} labeled utterances`)

  return {
    text: transcript.text || '',
    utterances,
    speakerWordCounts: {
      teacher: speakerWordCounts[teacherSpeakerId] || 0,
      student: speakerWordCounts[studentSpeakerId] || 0,
    },
  }
}

/**
 * Format diarized transcript for AI summarization
 */
export function formatDiarizedTranscript(diarized: DiarizedTranscript): string {
  if (diarized.utterances.length === 0) {
    return diarized.text
  }

  return diarized.utterances
    .map((u) => `[${u.speaker}]: ${u.text}`)
    .join('\n\n')
}

/**
 * Check if AssemblyAI is available (API key configured)
 */
export function isAssemblyAIAvailable(): boolean {
  return !!process.env.ASSEMBLYAI_API_KEY
}
