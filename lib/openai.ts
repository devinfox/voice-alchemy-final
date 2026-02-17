import OpenAI from 'openai'

// Lazy initialization to avoid issues during build time
let openaiClient: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

// ============================================================================
// Pitch Training Analysis Types
// ============================================================================

export interface PitchSessionMetrics {
  avgPitchAccuracy: number
  avgPitchOnsetSpeedMs: number
  avgPitchStability: number
  avgInTuneSustainMs: number
  overallScore: number
  totalNotesAttempted: number
  totalNotesMatched: number
  durationSeconds: number
}

export interface NoteMetrics {
  noteName: string
  octave: number
  pitchAccuracy: number
  pitchOnsetSpeedMs: number
  pitchStability: number
  inTuneSustainMs: number
  avgCentsDeviation: number
}

export interface WeeklyProgress {
  weekStartDate: string
  avgPitchAccuracy: number
  avgPitchOnsetSpeedMs: number
  avgPitchStability: number
  avgInTuneSustainMs: number
  avgOverallScore: number
  totalSessions: number
  pitchAccuracyChange: number | null
  pitchOnsetSpeedChange: number | null
  pitchStabilityChange: number | null
  inTuneSustainChange: number | null
}

export interface StudentContext {
  lessonNotes?: string[]
  teacherFeedback?: string[]
  previousAiFeedback?: string[]
  recordingTranscripts?: string[]
  rhythmTrainingData?: {
    avgOnBeatPercent?: number
    avgTimingConsistency?: number
    avgBpm?: number
    totalSessions?: number
  }
}

export interface PitchAnalysisResult {
  summary: string
  strengths: string[]
  areasForImprovement: string[]
  personalizedTips: string[]
  recommendedExercises: string[]
}

// ============================================================================
// Pitch Training Analysis Functions
// ============================================================================

/**
 * Analyze a single pitch training session and provide feedback
 */
export async function analyzeSessionPerformance(
  sessionMetrics: PitchSessionMetrics,
  noteMetrics: NoteMetrics[],
  studentContext?: StudentContext
): Promise<PitchAnalysisResult> {
  const openai = getOpenAIClient()

  const systemPrompt = `You are an expert vocal coach AI assistant specializing in pitch training and ear training.
You analyze pitch training session data and provide constructive, encouraging feedback to help students improve.

Your feedback should be:
- Specific and actionable
- Encouraging while honest about areas to improve
- Based on the actual metrics provided
- Tailored to the student's context if provided

Metrics explanation:
- Pitch Accuracy: How close the sung note is to the target (0-100%)
- Pitch Onset Speed: How quickly the student hits the correct pitch (lower is better, in ms)
- Pitch Stability: How steady the pitch is held (0-100%, higher is better)
- In-Tune Sustain: How long they maintain the correct pitch (in ms, higher is better)

A good pitch accuracy is 85%+, excellent is 95%+.
A good onset speed is under 500ms, excellent is under 200ms.
A good stability is 80%+, excellent is 90%+.
A good sustain is 2000ms+, excellent is 4000ms+.`

  const contextInfo = studentContext ? `
Additional context about this student:
${studentContext.lessonNotes?.length ? `Recent lesson notes: ${studentContext.lessonNotes.slice(0, 3).join('; ')}` : ''}
${studentContext.teacherFeedback?.length ? `Teacher feedback: ${studentContext.teacherFeedback.slice(0, 3).join('; ')}` : ''}
${studentContext.previousAiFeedback?.length ? `Previous AI feedback themes: ${studentContext.previousAiFeedback.slice(0, 2).join('; ')}` : ''}
` : ''

  const userPrompt = `Analyze this pitch training session and provide personalized feedback:

SESSION OVERVIEW:
- Overall Score: ${sessionMetrics.overallScore.toFixed(1)}%
- Average Pitch Accuracy: ${sessionMetrics.avgPitchAccuracy.toFixed(1)}%
- Average Onset Speed: ${sessionMetrics.avgPitchOnsetSpeedMs}ms
- Average Pitch Stability: ${sessionMetrics.avgPitchStability.toFixed(1)}%
- Average In-Tune Sustain: ${sessionMetrics.avgInTuneSustainMs}ms
- Duration: ${Math.round(sessionMetrics.durationSeconds / 60)} minutes
- Notes Attempted: ${sessionMetrics.totalNotesAttempted}
- Notes Successfully Matched: ${sessionMetrics.totalNotesMatched}

PER-NOTE BREAKDOWN:
${noteMetrics.map(n => `${n.noteName}${n.octave}: Accuracy ${n.pitchAccuracy.toFixed(1)}%, Onset ${n.pitchOnsetSpeedMs}ms, Stability ${n.pitchStability.toFixed(1)}%, Sustain ${n.inTuneSustainMs}ms, Deviation ${n.avgCentsDeviation.toFixed(1)} cents`).join('\n')}
${contextInfo}

Provide your analysis in the following JSON format:
{
  "summary": "A 2-3 sentence summary of the session performance",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "areasForImprovement": ["area 1", "area 2"],
  "personalizedTips": ["tip 1", "tip 2", "tip 3"],
  "recommendedExercises": ["exercise 1", "exercise 2"]
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 1000
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  return JSON.parse(content) as PitchAnalysisResult
}

/**
 * Analyze weekly progress and provide trend-based feedback
 */
export async function analyzeWeeklyProgress(
  currentWeek: WeeklyProgress,
  previousWeeks: WeeklyProgress[],
  studentContext?: StudentContext
): Promise<PitchAnalysisResult> {
  const openai = getOpenAIClient()

  const systemPrompt = `You are an expert vocal coach AI assistant analyzing weekly pitch training progress.
You help students understand their improvement trends and set goals for continued growth.

Focus on:
- Celebrating improvements, no matter how small
- Identifying patterns in progress
- Setting realistic next-week goals
- Connecting practice consistency to results`

  const weekHistory = previousWeeks.map(w =>
    `Week of ${w.weekStartDate}: Score ${w.avgOverallScore?.toFixed(1) || 'N/A'}%, ${w.totalSessions} sessions`
  ).join('\n')

  const userPrompt = `Analyze this student's weekly pitch training progress:

THIS WEEK (${currentWeek.weekStartDate}):
- Overall Score: ${currentWeek.avgOverallScore?.toFixed(1) || 'N/A'}%
- Pitch Accuracy: ${currentWeek.avgPitchAccuracy?.toFixed(1) || 'N/A'}% ${currentWeek.pitchAccuracyChange ? `(${currentWeek.pitchAccuracyChange > 0 ? '+' : ''}${currentWeek.pitchAccuracyChange.toFixed(1)}% from last week)` : ''}
- Onset Speed: ${currentWeek.avgPitchOnsetSpeedMs || 'N/A'}ms ${currentWeek.pitchOnsetSpeedChange ? `(${currentWeek.pitchOnsetSpeedChange > 0 ? '+' : ''}${currentWeek.pitchOnsetSpeedChange.toFixed(1)}% improvement)` : ''}
- Pitch Stability: ${currentWeek.avgPitchStability?.toFixed(1) || 'N/A'}% ${currentWeek.pitchStabilityChange ? `(${currentWeek.pitchStabilityChange > 0 ? '+' : ''}${currentWeek.pitchStabilityChange.toFixed(1)}% from last week)` : ''}
- In-Tune Sustain: ${currentWeek.avgInTuneSustainMs || 'N/A'}ms ${currentWeek.inTuneSustainChange ? `(${currentWeek.inTuneSustainChange > 0 ? '+' : ''}${currentWeek.inTuneSustainChange.toFixed(1)}% from last week)` : ''}
- Sessions This Week: ${currentWeek.totalSessions}

PREVIOUS WEEKS:
${weekHistory || 'No previous data'}

${studentContext?.teacherFeedback?.length ? `Recent teacher feedback: ${studentContext.teacherFeedback[0]}` : ''}

Provide your analysis in JSON format:
{
  "summary": "A 2-3 sentence summary of weekly progress",
  "strengths": ["strength/improvement 1", "strength/improvement 2"],
  "areasForImprovement": ["focus area 1", "focus area 2"],
  "personalizedTips": ["tip for next week 1", "tip 2"],
  "recommendedExercises": ["weekly goal/exercise 1", "weekly goal/exercise 2"]
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 1000
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  return JSON.parse(content) as PitchAnalysisResult
}

/**
 * Generate comprehensive student insights combining pitch training with lesson data
 */
export async function generateComprehensiveInsights(
  recentSessions: PitchSessionMetrics[],
  weeklyProgress: WeeklyProgress[],
  studentContext: StudentContext
): Promise<PitchAnalysisResult> {
  const openai = getOpenAIClient()

  const systemPrompt = `You are an expert vocal coach AI that provides comprehensive insights by analyzing:
1. Pitch training session data
2. Weekly progress trends
3. Lesson notes from teachers
4. Recording transcripts and feedback
5. Rhythm and timing training data

Your goal is to provide a holistic view of the student's vocal development and connect their
self-practice (pitch and rhythm training) with their formal lessons. Pitch accuracy and rhythm/timing
are both essential components of vocal performance.`

  const sessionSummary = recentSessions.length > 0
    ? `Recent Sessions (last ${recentSessions.length}):
Average Score: ${(recentSessions.reduce((sum, s) => sum + s.overallScore, 0) / recentSessions.length).toFixed(1)}%
Total Practice Time: ${Math.round(recentSessions.reduce((sum, s) => sum + s.durationSeconds, 0) / 60)} minutes`
    : 'No recent session data'

  const progressSummary = weeklyProgress.length > 0
    ? `Progress Trend (${weeklyProgress.length} weeks):
${weeklyProgress.map(w => `${w.weekStartDate}: ${w.avgOverallScore?.toFixed(1) || 'N/A'}%`).join(', ')}`
    : 'No weekly progress data'

  const rhythmSummary = studentContext.rhythmTrainingData
    ? `RHYTHM TRAINING DATA:
On-Beat Accuracy: ${studentContext.rhythmTrainingData.avgOnBeatPercent?.toFixed(1) || 'N/A'}%
Timing Consistency: ${studentContext.rhythmTrainingData.avgTimingConsistency?.toFixed(1) || 'N/A'}%
Average BPM Practiced: ${studentContext.rhythmTrainingData.avgBpm || 'N/A'}
Total Rhythm Sessions: ${studentContext.rhythmTrainingData.totalSessions || 0}`
    : 'No rhythm training data available'

  const userPrompt = `Generate comprehensive vocal development insights for this student:

PITCH TRAINING DATA:
${sessionSummary}

WEEKLY PROGRESS:
${progressSummary}

${rhythmSummary}

LESSON CONTEXT:
${studentContext.lessonNotes?.length ? `Lesson Notes: ${studentContext.lessonNotes.join('; ')}` : 'No lesson notes available'}
${studentContext.teacherFeedback?.length ? `Teacher Feedback: ${studentContext.teacherFeedback.join('; ')}` : 'No teacher feedback available'}
${studentContext.recordingTranscripts?.length ? `From Recordings: ${studentContext.recordingTranscripts.join('; ')}` : 'No recording data'}

Provide holistic insights in JSON format:
{
  "summary": "A comprehensive 3-4 sentence overview connecting pitch, rhythm, and lesson progress",
  "strengths": ["strength connecting practice to lessons 1", "strength 2", "strength 3"],
  "areasForImprovement": ["area that shows in both practice and lessons", "area 2"],
  "personalizedTips": ["tip that bridges self-practice with lessons 1", "tip 2", "tip 3"],
  "recommendedExercises": ["exercise that complements lessons", "daily practice suggestion"]
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 1200
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  return JSON.parse(content) as PitchAnalysisResult
}

// ============================================================================
// Video/Audio Transcription and Summarization
// ============================================================================

export interface LessonTranscript {
  text: string
  segments?: {
    start: number
    end: number
    text: string
  }[]
}

export interface LessonSummary {
  summary: string
  keyTopicsCovered: string[]
  exercisesPracticed: string[]
  teacherFeedback: string[]
  studentProgress: string[]
  homeworkAssignments: string[]
  nextSessionFocus: string[]
  notesHighlights: string[]  // Key points extracted from handwritten notes
}

/**
 * Transcribe audio/video file using OpenAI Whisper
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = 'audio.webm'
): Promise<LessonTranscript> {
  const openai = getOpenAIClient()

  // Create a File object from the buffer (convert Buffer to Uint8Array for compatibility)
  const file = new File([new Uint8Array(audioBuffer)], filename, { type: 'audio/webm' })

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

/**
 * Generate a comprehensive lesson summary from transcript and notes
 */
export async function generateLessonSummary(
  transcript: string,
  studentNotes?: string,
  previousLessons?: string[]
): Promise<LessonSummary> {
  const openai = getOpenAIClient()

  const systemPrompt = `You are an expert vocal coach assistant that summarizes voice lessons.
You analyze lesson transcripts AND handwritten notes from both students and teachers to create helpful summaries.

Your summaries should:
- Highlight key techniques and concepts discussed
- Identify specific exercises that were practiced
- Note any feedback or corrections given by the teacher
- Track student progress and improvements mentioned
- Extract any homework or practice assignments
- Suggest focus areas for the next session
- IMPORTANT: Extract and highlight key points from the handwritten class notes - these contain valuable real-time observations from both the student and teacher during the lesson

The handwritten notes are especially valuable as they capture in-the-moment observations, corrections, and breakthroughs that may not be fully captured in the audio.

Be specific and actionable in your summaries.`

  const userPrompt = `Analyze this voice lesson and create a comprehensive summary.

IMPORTANT: Pay special attention to the HANDWRITTEN CLASS NOTES below - these contain real-time observations from both the student and teacher during the lesson. Extract and highlight the most important points from these notes.

LESSON TRANSCRIPT (Audio recording):
${transcript.slice(0, 12000)}

${studentNotes ? `HANDWRITTEN CLASS NOTES (Written by student and/or teacher during class):
${studentNotes.slice(0, 3000)}

^ These notes are especially important - they capture in-the-moment observations, corrections, specific instructions, and breakthroughs that the student and teacher wanted to remember.` : ''}

${previousLessons?.length ? `CONTEXT FROM PREVIOUS LESSONS:
${previousLessons.slice(0, 2).join('\n---\n').slice(0, 2000)}` : ''}

Provide your analysis in JSON format:
{
  "summary": "A 3-4 sentence overview of what was covered in the lesson, incorporating insights from both the transcript AND the handwritten notes",
  "keyTopicsCovered": ["topic 1", "topic 2", "topic 3"],
  "exercisesPracticed": ["exercise 1 with brief description", "exercise 2"],
  "teacherFeedback": ["specific feedback point 1", "feedback point 2"],
  "studentProgress": ["progress observation 1", "progress observation 2"],
  "homeworkAssignments": ["practice assignment 1", "practice assignment 2"],
  "nextSessionFocus": ["suggested focus 1", "suggested focus 2"],
  "notesHighlights": ["key point from handwritten notes 1", "important observation from notes 2", "breakthrough or correction noted"]
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
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  return JSON.parse(content) as LessonSummary
}
