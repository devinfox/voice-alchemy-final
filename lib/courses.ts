export interface LessonAttachment {
  id: string
  name: string
  url: string
  fileType?: 'pdf' | 'audio' | 'image' | 'sheet_music' | 'other'
  sizeBytes?: number
}

export interface LessonAudioDrill {
  audioUrl: string
  title?: string
  targetKey?: string
  scaleType?: string
  bpm?: number
  range?: string
}

export type LessonFormat = 'video' | 'text' | 'audio_drill' | 'hybrid'

export interface CourseLesson {
  id: string
  title: string
  duration: string
  format?: LessonFormat
  videoUrl?: string
  videoProvider?: 'direct' | 'youtube' | 'vimeo' | 'loom' | 'supabase'
  audioDrill?: LessonAudioDrill
  summary: string
  body: string[]
  keyPoints: string[]
  practice: string[]
  attachments?: LessonAttachment[]
}

export interface CourseSection {
  id: string
  title: string
  description?: string
  lessons: CourseLesson[]
}

export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels'

export interface Course {
  id?: string
  slug: string
  title: string
  subtitle: string
  description: string
  category: string
  level: CourseLevel
  thumbnailUrl?: string
  previewVideoUrl?: string
  isFree: boolean
  isUnlocked: boolean
  isPublished?: boolean
  instructor: string
  instructorId?: string
  updatedAt: string
  whatYouWillLearn: string[]
  requirements: string[]
  sections: CourseSection[]
  price?: number
  estimatedDuration?: string
  enrollmentCount?: number
}

export const VOCAL_COURSE_CATEGORIES = [
  'Vocal Technique & Foundations',
  'Mix Voice & Belting',
  'Hindustani & Indian Classical',
  'Alt-Pop & Indie Phrasing',
  'Breathwork & Support Mechanics',
  'Vocal Agility, Riffs & Runs',
  'Performance & Mic Technique',
  'Songwriting & Toplining',
  'Vocal Health & Recovery',
] as const

export const VOCAL_KEYS = [
  'C Major', 'C Minor',
  'C# / Db Major', 'C# / Db Minor',
  'D Major', 'D Minor',
  'Eb Major', 'Eb Minor',
  'E Major', 'E Minor',
  'F Major', 'F Minor',
  'F# / Gb Major', 'F# / Gb Minor',
  'G Major', 'G Minor',
  'Ab Major', 'Ab Minor',
  'A Major', 'A Minor',
  'Bb Major', 'Bb Minor',
  'B Major', 'B Minor',
  'Raag Bhairav', 'Raag Yaman', 'Raag Kafi', 'Raag Bilawal', 'Custom / Sa Drone',
]

export const VOCAL_SCALE_TYPES = [
  '5-Tone Scale (1-2-3-4-5-4-3-2-1)',
  'Octave Arpeggio (1-3-5-8-5-3-1)',
  'Minor Pentatonic Drift',
  'SOVT Straw Phonation Siren',
  'Lip Trill Octave Glide',
  'Meend Slide / Portamento',
  'Murki Fast Turn (1-2-1)',
  'Gamak Chest-Mix Oscillation',
  'Sustained Sa Drone Anchor',
  'Vowel Resonance Bridge (mm-meh-mah)',
]

export const beginnerVocalCourse: Course = {
  id: 'seed-beginner-vocal-foundations',
  slug: 'beginner-vocal-foundations',
  title: 'Beginner Vocal Foundations',
  subtitle: 'Hindustani pitch discipline for modern alt-pop and indie singers',
  description:
    'A full beginner system based on efficient vocal function: easy onset, breath pacing, clean vowels, drone-led intonation, safe ornament adaptation, and microphone-aware performance.',
  category: 'Vocal Technique & Foundations',
  level: 'Beginner',
  thumbnailUrl: '',
  isFree: true,
  isUnlocked: true,
  isPublished: true,
  instructor: 'Voice Alchemy Coach',
  updatedAt: 'February 2026',
  estimatedDuration: '2.5 hours',
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
      description: 'Core biomechanics, safe phonation boundaries, and foundational breath alignment.',
      lessons: [
        {
          id: 'two-worlds-one-voice',
          title: 'Two Worlds, One Voice: Course Philosophy',
          duration: '11 min',
          format: 'hybrid',
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
          format: 'text',
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
        },
        {
          id: 'breath-posture-support',
          title: 'Breath, Posture, and Support for Beginners',
          duration: '18 min',
          format: 'audio_drill',
          audioDrill: {
            audioUrl: '',
            title: 'Hiss & Phonation Pacing Exercise',
            targetKey: 'C Major',
            scaleType: 'Sustained Sa Drone Anchor',
            bpm: 60,
            range: 'Chest & Lower Mix',
          },
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
      description: 'Semi-occluded drills, resonance tract tuning, and drone-guided intonation.',
      lessons: [
        {
          id: 'sovt-reset-toolkit',
          title: 'SOVT Reset Toolkit: Straw, Lip Trill, Hum',
          duration: '16 min',
          format: 'hybrid',
          audioDrill: {
            audioUrl: '',
            title: 'Straw Phonation Octave Siren Guide',
            targetKey: 'Custom / Sa Drone',
            scaleType: 'SOVT Straw Phonation Siren',
            bpm: 70,
            range: 'G3 - G4',
          },
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
            '6 lip trill sirens over a comfortable range',
          ],
        },
        {
          id: 'resonance-vowels',
          title: 'Resonance, Placement, and Vowel Shaping',
          duration: '17 min',
          format: 'text',
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
          format: 'audio_drill',
          audioDrill: {
            audioUrl: '',
            title: 'Drone Sa Intonation Anchor',
            targetKey: 'C Major',
            scaleType: '5-Tone Scale (1-2-3-4-5-4-3-2-1)',
            bpm: 72,
            range: 'C3 - G3 / C4 - G4',
          },
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
      description: 'Translating classical ornaments safely into modern pop delivery and mic technique.',
      lessons: [
        {
          id: 'ornaments-safe-adaptation',
          title: 'Hindustani Ornamentation for Pop: Safe Adaptation',
          duration: '20 min',
          format: 'hybrid',
          audioDrill: {
            audioUrl: '',
            title: 'Meend and Murki Slow Drill',
            targetKey: 'Raag Yaman',
            scaleType: 'Meend Slide / Portamento',
            bpm: 65,
            range: 'D3 - B4',
          },
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
          format: 'text',
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
          format: 'text',
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
      description: 'Daily vocal workout routines and milestone self-assessment rubrics.',
      lessons: [
        {
          id: 'weekly-systems',
          title: '15/30/60 Minute Practice Systems',
          duration: '15 min',
          format: 'text',
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
          format: 'text',
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

export const courses: Course[] = [
  beginnerVocalCourse,
  {
    id: 'seed-mix-voice-and-register-control',
    slug: 'mix-voice-and-register-control',
    title: 'Mix Voice and Register Control',
    subtitle: 'Smooth vocal registration, passagio navigation, and compression balance',
    description: 'Master the bridge between your chest voice and head voice with targeted vocal acoustics, narrow vowel modifications, and balanced cord closure drills.',
    category: 'Mix Voice & Belting',
    level: 'Intermediate',
    isFree: false,
    isUnlocked: false,
    isPublished: true,
    instructor: 'Voice Alchemy Coach',
    updatedAt: 'Coming soon',
    whatYouWillLearn: [
      'Bridge the break smoothly without flipping or straining',
      'Understand thyroid-arytenoid vs cricothyroid muscle coordination',
      'Use pharyngeal vowels to unlock high notes effortlessly',
    ],
    requirements: ['Completion of Beginner Foundations or 1+ year singing experience'],
    sections: [],
  },
  {
    id: 'seed-alt-pop-performance-and-mic-technique',
    slug: 'alt-pop-performance-and-mic-technique',
    title: 'Alt-Pop Performance and Mic Technique',
    subtitle: 'Dynamic intimacy, breathy compression, and modern stage presence',
    description: 'Unlock modern indie-pop styling, rhythmic phrasing, close-mic dynamic control, and emotional storytelling without fatigue.',
    category: 'Performance & Mic Technique',
    level: 'Intermediate',
    isFree: false,
    isUnlocked: false,
    isPublished: true,
    instructor: 'Voice Alchemy Coach',
    updatedAt: 'Coming soon',
    whatYouWillLearn: [
      'Master the close-proximity whisper-to-belt transition',
      'Rhythmic timing and back-beat vocal phrasing',
      'Live stage microphone handling and in-ear monitoring basics',
    ],
    requirements: ['Basic pitch matching capability', 'USB or dynamic microphone recommended'],
    sections: [],
  },
]

export function getCourseBySlug(slug: string): Course | undefined {
  return courses.find((course) => course.slug === slug)
}

export function getCourseLessonCount(course: Course): number {
  if (!course.sections || !Array.isArray(course.sections)) return 0
  return course.sections.reduce((sum, section) => sum + (section.lessons?.length || 0), 0)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function parseVideoEmbedUrl(url: string): { embedUrl: string; provider: 'youtube' | 'vimeo' | 'loom' | 'direct' } {
  if (!url) return { embedUrl: '', provider: 'direct' }
  const trimmed = url.trim()

  // YouTube
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)
  if (ytMatch && ytMatch[1]) {
    return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`, provider: 'youtube' }
  }

  // Vimeo
  const vimeoMatch = trimmed.match(/(?:vimeo\.com\/)(\d+)/)
  if (vimeoMatch && vimeoMatch[1]) {
    return { embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`, provider: 'vimeo' }
  }

  // Loom
  const loomMatch = trimmed.match(/(?:loom\.com\/share\/)([a-zA-Z0-9]+)/)
  if (loomMatch && loomMatch[1]) {
    return { embedUrl: `https://www.loom.com/embed/${loomMatch[1]}`, provider: 'loom' }
  }

  return { embedUrl: trimmed, provider: 'direct' }
}
