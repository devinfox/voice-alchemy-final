import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const openaiKey = process.env.OPENAI_API_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAI({ apiKey: openaiKey })

interface LessonSummary {
  summary: string
  keyTopicsCovered: string[]
  exercisesPracticed: string[]
  teacherFeedback: string[]
  studentProgress: string[]
  homeworkAssignments: string[]
  nextSessionFocus: string[]
  notesHighlights: string[]
}

async function transcribeAudio(buffer: Buffer, filename: string) {
  const file = new File([new Uint8Array(buffer)], filename, { type: 'audio/webm' })

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    language: 'en',
  })

  return {
    text: response.text,
    segments: response.segments?.map(seg => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  }
}

async function generateLessonSummary(
  transcript: string,
  studentNotes?: string,
  previousLessons?: string[]
): Promise<LessonSummary> {
  const systemPrompt = `You are an expert vocal coach assistant analyzing lesson recordings. Your task is to create comprehensive, actionable lesson summaries.

IMPORTANT: Base your summary ONLY on what is actually discussed in the transcript provided. Do not make up or assume topics that weren't covered.

Analyze the lesson transcript and any handwritten class notes to extract:
1. Key topics and techniques discussed
2. Specific exercises practiced (with descriptions)
3. Teacher's feedback and corrections
4. Student progress observations
5. Homework/practice assignments given
6. Suggested focus areas for next session
7. Important highlights from handwritten notes

Be specific and actionable. Include exact exercise names, song titles, and technical terms used.`

  const userPrompt = `Please analyze this vocal lesson and provide a detailed summary.

LESSON TRANSCRIPT:
${transcript.slice(0, 12000)}

${studentNotes ? `\nHANDWRITTEN CLASS NOTES:\n${studentNotes.slice(0, 3000)}` : ''}

${previousLessons?.length ? `\nPREVIOUS LESSON SUMMARIES (for context):\n${previousLessons.join('\n---\n').slice(0, 2000)}` : ''}

Provide your analysis in the following JSON format:
{
  "summary": "3-4 sentence overview of what was covered in THIS specific lesson",
  "keyTopicsCovered": ["topic1", "topic2"],
  "exercisesPracticed": ["exercise with description"],
  "teacherFeedback": ["specific feedback given"],
  "studentProgress": ["progress observations"],
  "homeworkAssignments": ["assignments given"],
  "nextSessionFocus": ["suggested focus areas"],
  "notesHighlights": ["key points from handwritten notes"]
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  return JSON.parse(content) as LessonSummary
}

async function main() {
  console.log('Looking for recent recording from 2/27/2026 around 2:38 PM...')

  // Find the most recent recording (the class that just ended)
  const { data: recordings, error: fetchError } = await supabase
    .from('lesson_recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (fetchError) {
    console.error('Error fetching recordings:', fetchError)
    process.exit(1)
  }

  console.log(`Found ${recordings?.length || 0} recent recordings:`)
  recordings?.forEach(r => {
    console.log(`  - ID: ${r.id}`)
    console.log(`    Started: ${r.started_at || r.created_at}`)
    console.log(`    Ended: ${r.ended_at}`)
    console.log(`    Status: ${r.ai_processing_status}`)
    console.log(`    Storage: ${r.storage_path}`)
    console.log('')
  })

  // Find the specific recording from 2:38 PM today
  const targetTime = new Date('2026-02-27T14:38:53')
  const recording = recordings?.find(r => {
    const startTime = new Date(r.started_at || r.created_at)
    const diff = Math.abs(startTime.getTime() - targetTime.getTime())
    return diff < 10 * 60 * 1000 // Within 10 minutes
  })

  if (!recording) {
    console.log('Could not find the specific recording. Using most recent one...')
    const mostRecent = recordings?.[0]
    if (!mostRecent) {
      console.error('No recordings found!')
      process.exit(1)
    }
    console.log(`Using recording ${mostRecent.id}`)
    await processRecording(mostRecent)
  } else {
    console.log(`Found matching recording: ${recording.id}`)
    await processRecording(recording)
  }
}

async function processRecording(recording: any) {
  console.log('\n=== Processing Recording ===')
  console.log(`ID: ${recording.id}`)
  console.log(`Booking ID: ${recording.booking_id}`)
  console.log(`Storage Path: ${recording.storage_path}`)

  if (!recording.storage_path) {
    console.error('No storage path - recording may not have been uploaded')
    process.exit(1)
  }

  // Update status to processing
  await supabase
    .from('lesson_recordings')
    .update({ ai_processing_status: 'processing' })
    .eq('id', recording.id)

  try {
    // Download the recording
    console.log('\nDownloading recording from storage...')
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('lesson-recordings')
      .download(recording.storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Download failed: ${downloadError?.message}`)
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    console.log(`Downloaded ${buffer.length} bytes`)

    // Transcribe
    console.log('\nTranscribing with Whisper...')
    const transcript = await transcribeAudio(buffer, `${recording.id}.webm`)
    console.log(`Transcription complete: ${transcript.text.length} characters`)
    console.log('\n--- TRANSCRIPT ---')
    console.log(transcript.text)
    console.log('--- END TRANSCRIPT ---\n')

    // Get linked notes for THIS recording only
    const { data: notesArchive } = await supabase
      .from('notes_archive')
      .select('content_html, content')
      .eq('recording_id', recording.id)
      .maybeSingle()

    console.log(`Linked notes: ${notesArchive ? 'Found' : 'None'}`)

    // Generate AI summary based on actual transcript
    console.log('\nGenerating AI summary from transcript...')
    const summary = await generateLessonSummary(
      transcript.text,
      notesArchive?.content || notesArchive?.content_html
    )

    console.log('\n--- AI SUMMARY ---')
    console.log(JSON.stringify(summary, null, 2))
    console.log('--- END SUMMARY ---\n')

    // Update the recording
    const { error: updateError } = await supabase
      .from('lesson_recordings')
      .update({
        transcript: transcript.text,
        ai_summary: summary,
        ai_processing_status: 'completed',
        ai_processed_at: new Date().toISOString(),
        ai_processing_error: null,
      })
      .eq('id', recording.id)

    if (updateError) {
      throw new Error(`Update failed: ${updateError.message}`)
    }

    // Update notes_archive if linked
    if (notesArchive) {
      await supabase
        .from('notes_archive')
        .update({ ai_summary: summary })
        .eq('recording_id', recording.id)
    }

    console.log('✓ Recording processed successfully!')
    console.log('Refresh the page to see the updated AI Summary.')

  } catch (err) {
    console.error('Processing error:', err)

    await supabase
      .from('lesson_recordings')
      .update({
        ai_processing_status: 'failed',
        ai_processing_error: err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', recording.id)

    process.exit(1)
  }
}

main()
