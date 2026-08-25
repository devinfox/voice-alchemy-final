export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctAnswerIndex: number
  explanation?: string
}

export interface CourseQuiz {
  id: string
  title: string
  description?: string
  questions: QuizQuestion[]
  passingScorePercent?: number
  isOptional?: boolean
}

export interface CourseLesson {
  id: string
  title: string
  duration: string
  summary: string
  body: string[]
  keyPoints: string[]
  practice: string[]
  quiz?: CourseQuiz
}

export interface CourseSection {
  id: string
  title: string
  lessons: CourseLesson[]
}

export interface Course {
  slug: string
  title: string
  subtitle: string
  description: string
  level: 'Beginner' | 'Intermediate' | 'Advanced'
  isFree: boolean
  isUnlocked: boolean
  instructor: string
  updatedAt: string
  whatYouWillLearn: string[]
  requirements: string[]
  sections: CourseSection[]
  isCustom?: boolean
}

const beginnerVocalCourse: Course = {
  slug: 'beginner-vocal-foundations',
  title: 'Beginner Vocal Foundations',
  subtitle: 'Hindustani pitch discipline for modern alt-pop and indie singers',
  description:
    'A full beginner system based on efficient vocal function: easy onset, breath pacing, clean vowels, drone-led intonation, safe ornament adaptation, and microphone-aware performance.',
  level: 'Beginner',
  isFree: true,
  isUnlocked: true,
  instructor: 'Voice Alchemy Coach',
  updatedAt: 'February 2026',
  whatYouWillLearn: [
    'Build stable coordination before range and power',
    'Use SOVT drills to reduce strain and improve onset consistency',
    'Center pitch with a personal tonic (Sa) and drone practice',
    'Shape resonance and vowels for clear indie tone without squeeze',
    'Adapt meend, murki, and gamak safely for modern pop phrasing',
    'Run a repeatable 15/30/60 minute daily practice structure',
  ],
  requirements: [
    'No prior training required',
    'Quiet space and phone/recording device',
    'Headphones and drone app (recommended)',
    'Water and short daily practice consistency',
  ],
  sections: [
    {
      id: 'foundations',
      title: 'Foundations and Safety',
      lessons: [
        {
          id: 'two-worlds-one-voice',
          title: 'Two Worlds, One Voice: Course Philosophy',
          duration: '11 min',
          summary: 'Why this course blends Hindustani precision with modern CCM styling.',
          body: [
            'This course is designed for contemporary singers who want emotional intimacy and technical reliability at the same time.',
            'The method is simple: efficiency first, expression second, intensity last. We establish easy phonation and repeatability before any aggressive vocal demands.',
            'Hindustani training contributes tonal centering and nuanced note connection. Modern CCM contributes stylistic flexibility, microphone intelligence, and sustainable technique.',
          ],
          keyPoints: [
            'Style has technical consequences',
            'Coordination beats brute force',
            'Relative pitch and note connection are core skills',
          ],
          practice: [
            'Write your current vocal goals in one sentence',
            'Record a 20-second baseline of speaking to singing transition',
          ],
        },
        {
          id: 'anatomy-and-safe-technique',
          title: 'Vocal Anatomy and Non-Negotiable Safety Rules',
          duration: '14 min',
          summary: 'Understand breath, fold vibration, resonance shaping, and healthy boundaries.',
          body: [
            'Voice production depends on coordinated airflow, fold vibration, and tract shaping. Beginners improve fastest when they reduce extra tension and increase consistency.',
            'Pain is a hard stop. Hoarseness after practice is not a badge of effort; it is feedback that load, volume, or technique needs immediate adjustment.',
            'Hydration, rest, and gradual warm-up progression protect tissue quality and support stable vibration.',
          ],
          keyPoints: [
            'No pain during singing',
            'Hoarseness is data, not normal',
            'Gentle warm-up before intensity',
          ],
          practice: [
            'Create a personal stop-sign checklist: pain, tightness, persistent roughness',
            'Track hydration before and after practice for one week',
          ],
          quiz: {
            id: 'quiz-anatomy-safety',
            title: 'Optional Knowledge Check: Vocal Safety',
            description: 'Test your understanding of safe phonation and vocal health boundaries.',
            isOptional: true,
            passingScorePercent: 100,
            questions: [
              {
                id: 'q1',
                question: 'What is the correct response if you feel sharp pain or persistent roughness while singing?',
                options: [
                  'Push through it to build vocal endurance',
                  'Stop immediately, rest, hydrate, and reset technique',
                  'Sing louder to clear the throat',
                  'Switch immediately to whistle register'
                ],
                correctAnswerIndex: 1,
                explanation: 'Pain is a non-negotiable hard stop. Singing through pain causes vocal fold swelling and strain.'
              },
              {
                id: 'q2',
                question: 'What is the core Voice Alchemy progression philosophy?',
                options: [
                  'Intensity first, volume second, pitch last',
                  'Efficiency first, expression second, intensity last',
                  'Belting high notes on day one',
                  'Singing exclusively with throat tension'
                ],
                correctAnswerIndex: 1,
                explanation: 'We always build effortless phonation and coordination before adding expressive ornaments or volume intensity.'
              }
            ]
          },
        },
        {
          id: 'breath-posture-support',
          title: 'Breath, Posture, and Support for Beginners',
          duration: '18 min',
          summary: 'Build a stable physical setup that keeps the throat from overworking.',
          body: [
            'Use a stacked posture: balanced feet, soft knees, neutral ribs/pelvis, easy neck alignment. The goal is organized support, not rigid posing.',
            'Support means matching airflow and pressure to sound demand without throat pressing. Too much air and too much squeeze both destabilize pitch and tone.',
            'Start with silent inhale, hiss pacing, and gentle voiced buzz before any lyric work.',
          ],
          keyPoints: [
            'Stack, do not strain',
            'Steady outflow improves stability',
            'Support is pressure-flow balance',
          ],
          practice: [
            '4 sets of silent inhale + 10-second hiss',
            '6 sets of soft vvv/zzz onset for 3-5 seconds each',
          ],
        },
      ],
    },
    {
      id: 'coordination',
      title: 'Coordination Toolkit',
      lessons: [
        {
          id: 'sovt-reset-toolkit',
          title: 'SOVT Reset Toolkit: Straw, Lip Trill, Hum',
          duration: '16 min',
          summary: 'Use semi-occluded drills to build efficient phonation with lower strain.',
          body: [
            'Semi-occluded vocal tract work helps self-organize the voice by improving source-tract interaction and reducing collision stress.',
            'For beginners, SOVT drills are both warm-up and troubleshooting tools. They are especially useful when onset feels tight or unstable.',
            'Treat SOVT as your reset button between difficult reps, not as a one-time warm-up trick.',
          ],
          keyPoints: [
            'SOVT improves ease and onset',
            'Use low volume and smooth airflow',
            'Reset between reps to avoid pushing',
          ],
          practice: [
            '3 rounds: 30 seconds straw in air + 20 seconds rest',
            '6 lip trill sirens over a small range',
          ],
        },
        {
          id: 'resonance-vowels',
          title: 'Resonance, Placement, and Vowel Shaping',
          duration: '17 min',
          summary: 'Create clear tone color with tract shaping instead of throat force.',
          body: [
            'Resonance is acoustic shaping, not a magical location in the face. Sensations can help, but the real target is efficient setup and consistent sound.',
            'Vowels are your tone steering wheel. Keep diction clear while allowing micro-adjustments as pitch rises so the throat stays free.',
            'For alt-pop and indie style, prioritize clarity and intimacy over loudness.',
          ],
          keyPoints: [
            'Vowel shape controls timbre',
            'Do not lock spoken vowels at high notes',
            'Bright does not have to mean nasal',
          ],
          practice: [
            'Hum to vowel bridge: mm -> meh -> mah',
            'Single-vowel five-note scales at soft volume',
          ],
        },
        {
          id: 'pitch-drone-sa',
          title: 'Pitch Accuracy with Drone and Personal Sa',
          duration: '19 min',
          summary: 'Train repeatable intonation with slow, anchored pitch matching.',
          body: [
            'Choose a tonic that fits your current voice. Relative pitch accuracy matters more than chasing absolute pitch.',
            'Practice with a drone and stepwise patterns. Slow repetition with short holds builds reliable pitch centering.',
            'Use slide-to-center drills as a technical method first, not stylistic decoration.',
          ],
          keyPoints: [
            'Anchor to a comfortable Sa',
            'Hold target pitches to check drift',
            'Repeatability is a core metric',
          ],
          practice: [
            'Drone match: 10 holds of Sa for 2-3 seconds',
            '1-2-3-4-5-4-3-2-1 slow scale, record and review',
          ],
        },
      ],
    },
    {
      id: 'style-and-performance',
      title: 'Style Translation and Performance',
      lessons: [
        {
          id: 'ornaments-safe-adaptation',
          title: 'Hindustani Ornamentation for Pop: Safe Adaptation',
          duration: '20 min',
          summary: 'Translate meend, murki, gamak, and alaap into usable modern phrasing.',
          body: [
            'Ornaments add identity when fundamentals are stable. If straight-tone phrasing is unstable, ornament complexity should be reduced immediately.',
            'Use quiet and controlled versions first. Meend becomes expressive slide, murki becomes short turn, gamak becomes light controlled shake, alaap becomes free-time adlib.',
            'In indie contexts, subtlety usually wins. Precision and emotional timing matter more than speed.',
          ],
          keyPoints: [
            'Earn the ornament with clean base tone',
            'Keep ornaments small and controlled first',
            'Prioritize musical intention over complexity',
          ],
          practice: [
            'Meend drill: slide into target then hold 2 seconds',
            'Murki-lite: 1-2-1 turn at slow tempo',
          ],
        },
        {
          id: 'repertoire-and-song-mapping',
          title: 'Repertoire Selection and Song Mapping',
          duration: '14 min',
          summary: 'Choose songs that develop technique instead of exposing weak coordination.',
          body: [
            'Pick beginner songs by function: narrow range, moderate tempo, sustained vowels, and minimal high-intensity belting demands.',
            'Map lyrics through speak-rhythm -> pitch-speech -> light sing. This bridges articulation into melody while protecting intonation.',
            'Transpose key to your voice early. Staying in your training zone accelerates quality.',
          ],
          keyPoints: [
            'Song choice should match current coordination',
            'Use speak-to-sing transitions',
            'Transposition is a tool, not cheating',
          ],
          practice: [
            'Map one verse in 3 stages: speak, pitch-speak, sing',
            'Test two keys and keep the one with better tone stability',
          ],
        },
        {
          id: 'microphone-and-delivery',
          title: 'Microphone Technique and Delivery Control',
          duration: '12 min',
          summary: 'Use mic distance and angle as part of vocal technique.',
          body: [
            'For intimate pop delivery, consistency of mic distance is critical. Start with a repeatable default distance and adjust intentionally for dynamics.',
            'Use slight off-axis angle and pop filtering to reduce plosives and muddiness.',
            'Let microphone technique handle dynamic contrast so the throat does not need to overcompensate.',
          ],
          keyPoints: [
            'Consistent mic distance improves tone consistency',
            'Manage plosives with angle and filter',
            'Use distance for dynamics, not throat push',
          ],
          practice: [
            'Record one phrase at fixed distance, then with controlled dynamic distance shifts',
            'Compare plosive control on direct-axis vs slight off-axis',
          ],
        },
      ],
    },
    {
      id: 'practice-and-growth',
      title: 'Practice System and Progress',
      lessons: [
        {
          id: 'weekly-systems',
          title: '15/30/60 Minute Practice Systems',
          duration: '15 min',
          summary: 'Run a scalable daily structure that stays sustainable long-term.',
          body: [
            'Use predictable structure: reset, tune, shape, apply, cool down. Consistency beats random intensity.',
            'On high-fatigue days, use a 15-minute reset only. On good days, extend to 30 or 60 minutes with controlled progression.',
            'Keep one measurable win per session so motivation is tied to process quality.',
          ],
          keyPoints: [
            'Short consistent practice is better than sporadic overload',
            'Scale session length to daily readiness',
            'Always finish with cool-down and notes',
          ],
          practice: [
            'Run the 30-minute protocol for 5 consecutive days',
            'Log one technical win and one next-step each day',
          ],
        },
        {
          id: 'troubleshooting-and-milestones',
          title: 'Troubleshooting and Milestone Rubrics',
          duration: '18 min',
          summary: 'Diagnose common issues and track progress with objective criteria.',
          body: [
            'Common beginner issues include breathiness, unstable sustained pitch, high-note strain, and post-practice hoarseness.',
            'Use symptom -> likely cause -> small fix. Start with SOVT, reduced volume, and slower tempo before trying bigger changes.',
            'Track milestone criteria: onset reliability, hiss stability, pitch hold, vowel consistency, and song transfer.',
          ],
          keyPoints: [
            'Diagnose with simple cause/fix logic',
            'Reduce load before adding complexity',
            'Use rubrics for objective progress checks',
          ],
          practice: [
            'Self-grade your week using 5 metrics (1-5 scale)',
            'Choose one weak metric and design a 3-day correction plan',
          ],
        },
      ],
    },
  ],
}

// Demo course for teacher walkthroughs — real structure, placeholder body copy.
const celineDemoCourse: Course = {
  slug: 'signature-voice-with-celine',
  title: 'Signature Voice',
  subtitle: 'Find the sound only you can make — a 3-part masterclass with Celine Dion',
  description:
    'A guided journey from breath to ballad: build a reliable technical foundation, shape a tone that is unmistakably yours, and deliver songs with the emotional control of a headliner.',
  level: 'Intermediate',
  isFree: true,
  isUnlocked: true,
  instructor: 'Celine Dion',
  updatedAt: 'August 2026',
  whatYouWillLearn: [
    'Anchor every phrase with effortless breath support',
    'Develop a personal tone signature across your full range',
    'Deliver ballads and belts with dynamic emotional control',
  ],
  requirements: ['Some singing experience recommended', 'Quiet practice space and headphones'],
  isCustom: false,
  sections: [
    {
      id: 'celine-part-1',
      title: 'Part 1: The Foundation',
      lessons: [
        {
          id: 'celine-1-1',
          title: 'Breath Is the Instrument',
          duration: '14 min',
          summary: 'Why every great voice starts below the ribcage.',
          body: [
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, vocal support in every phrase.',
            'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat — steady airflow before volume.',
          ],
          keyPoints: ['Support before sound', 'Low, silent inhale', 'Consistent exhale pressure'],
          practice: ['3 rounds of 10-second hiss holds', 'One verse sung at half volume with full support'],
        },
        {
          id: 'celine-1-2',
          title: 'The Warmup That Never Fails',
          duration: '11 min',
          summary: 'A 7-minute daily sequence to make the voice available on demand.',
          body: [
            'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur — gentle sirens before intensity.',
          ],
          keyPoints: ['Same sequence, every day', 'Never skip the gentle start'],
          practice: ['Run the full 7-minute sequence', 'Note how your voice feels before and after'],
          quiz: {
            id: 'celine-quiz-1',
            title: 'Checkpoint: Foundation',
            description: 'A quick check before Part 2.',
            isOptional: true,
            passingScorePercent: 70,
            questions: [
              {
                id: 'cq1',
                question: 'What should always come before volume and intensity?',
                options: [
                  'Steady breath support',
                  'Singing your highest note',
                  'A full performance run',
                  'Skipping straight to repertoire',
                ],
                correctAnswerIndex: 0,
                explanation: 'Support and coordination come first — power is built on top of them, never instead of them.',
              },
            ],
          },
        },
      ],
    },
    {
      id: 'celine-part-2',
      title: 'Part 2: Your Tone Signature',
      lessons: [
        {
          id: 'celine-2-1',
          title: 'Color, Not Copy',
          duration: '16 min',
          summary: 'Stop imitating your influences and find the color of your own voice.',
          body: [
            'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum — your tone is a fingerprint.',
            'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, vowel shaping as your steering wheel.',
          ],
          keyPoints: ['Vowels shape tone', 'Resonance over force', 'Your accent is an asset'],
          practice: ['Record the same line three ways and pick the truest one'],
        },
        {
          id: 'celine-2-2',
          title: 'The Passaggio, Tamed',
          duration: '18 min',
          summary: 'Smooth the break between registers without losing power.',
          body: [
            'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit — lighten the onset as you ascend.',
          ],
          keyPoints: ['Thin, don’t push', 'Ng-glides through the bridge'],
          practice: ['5 ng-glides across your break, descending after each'],
        },
      ],
    },
    {
      id: 'celine-part-3',
      title: 'Part 3: The Performance',
      lessons: [
        {
          id: 'celine-3-1',
          title: 'Building the Emotional Arc',
          duration: '15 min',
          summary: 'Map a song’s dynamics so the audience feels the story, not the technique.',
          body: [
            'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit — plan your loudest moment and earn it.',
          ],
          keyPoints: ['One peak per song', 'Silence is a dynamic too'],
          practice: ['Mark the emotional peak of your current song and rehearse into it'],
        },
        {
          id: 'celine-3-2',
          title: 'Owning the Big Note',
          duration: '13 min',
          summary: 'The checklist for the note everyone remembers.',
          body: [
            'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum — set the body before the note, not during it.',
          ],
          keyPoints: ['Prepare two beats early', 'Land it, then leave it'],
          practice: ['Three approaches to your big note at three volumes'],
        },
      ],
    },
  ],
}

export const courses: Course[] = [
  beginnerVocalCourse,
  celineDemoCourse,
  {
    slug: 'mix-voice-and-register-control',
    title: 'Mix Voice and Register Control',
    subtitle: 'Coming soon',
    description: 'Locked course',
    level: 'Intermediate',
    isFree: false,
    isUnlocked: false,
    instructor: 'Voice Alchemy Coach',
    updatedAt: 'Coming soon',
    whatYouWillLearn: [],
    requirements: [],
    sections: [],
  },
  {
    slug: 'alt-pop-performance-and-mic-technique',
    title: 'Alt-Pop Performance and Mic Technique',
    subtitle: 'Coming soon',
    description: 'Locked course',
    level: 'Intermediate',
    isFree: false,
    isUnlocked: false,
    instructor: 'Voice Alchemy Coach',
    updatedAt: 'Coming soon',
    whatYouWillLearn: [],
    requirements: [],
    sections: [],
  },
]

const CUSTOM_COURSES_KEY = 'vaaa_custom_courses_v1'

export function generateId(prefix: string): string {
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${unique}`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Slugify a title and de-collide it against every existing course
 * (built-in and custom). `currentSlug` exempts the course being edited.
 */
export function generateUniqueSlug(title: string, currentSlug?: string): string {
  const base = slugify(title) || `custom-course-${Date.now()}`
  const taken = new Set(
    getAllCourses()
      .map((c) => c.slug)
      .filter((slug) => slug !== currentSlug)
  )
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export function getCourseTotalMinutes(course: Course): number {
  return course.sections.reduce(
    (sum, section) =>
      sum +
      section.lessons.reduce((lessonSum, lesson) => {
        const match = lesson.duration.match(/\d+/)
        return lessonSum + (match ? parseInt(match[0], 10) : 0)
      }, 0),
    0
  )
}

export function getCustomCourses(): Course[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_COURSES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Course[]
  } catch (e) {
    console.error('Failed to load custom courses', e)
    return []
  }
}

/**
 * Persist a custom course. Returns the saved course, or null when
 * persistence failed (e.g. localStorage quota exceeded) so callers can
 * surface the error instead of silently dropping the teacher's work.
 */
export function saveCustomCourse(course: Course): Course | null {
  if (typeof window === 'undefined') return null
  try {
    const current = getCustomCourses()
    const index = current.findIndex((c) => c.slug === course.slug)
    const updated: Course = {
      ...course,
      isCustom: true,
      isUnlocked: true,
      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    }
    let nextList: Course[]
    if (index >= 0) {
      nextList = [...current]
      nextList[index] = updated
    } else {
      nextList = [updated, ...current]
    }
    localStorage.setItem(CUSTOM_COURSES_KEY, JSON.stringify(nextList))
    return updated
  } catch (e) {
    console.error('Failed to save custom course', e)
    return null
  }
}

export function deleteCustomCourse(slug: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const current = getCustomCourses()
    const nextList = current.filter((c) => c.slug !== slug)
    localStorage.setItem(CUSTOM_COURSES_KEY, JSON.stringify(nextList))
    return true
  } catch (e) {
    console.error('Failed to delete custom course', e)
    return false
  }
}

export function getAllCourses(): Course[] {
  const custom = getCustomCourses()
  return [...courses, ...custom]
}

export function getCourseBySlug(slug: string): Course | undefined {
  const all = getAllCourses()
  return all.find((course) => course.slug === slug)
}

export function getCourseLessonCount(course: Course): number {
  return course.sections.reduce((sum, section) => sum + section.lessons.length, 0)
}


