'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Zap,
  Send,
  User,
  Mail,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Sparkles,
  GraduationCap,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import { EmailAccount } from '@/types/email.types'

interface EmailTemplate {
  id: string
  name: string
  description: string
  subject: string
  category: 'coaching' | 'enrollment'
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => string
  generateText: (firstName: string, repName: string, repPhone: string, repEmail: string) => string
}

interface TemplateCategory {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  templates: EmailTemplate[]
}

// Helper to format phone number for display
const formatPhoneDisplay = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone || '(310) 209-8166'
}

// Standard Voice Alchemy Email Signature HTML
const generateSignatureHtml = (repName: string, repPhone: string, repEmail: string, repTitle: string = 'Vocal Coach & Mentor'): string => {
  const formattedPhone = formatPhoneDisplay(repPhone)
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 32px; border-collapse: collapse; width: 100%; max-width: 560px;">
      <tr>
        <td style="padding-top: 20px; border-top: 2px solid #CEB466;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align: top; padding-right: 20px;">
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 18px; font-weight: bold; color: #171229; margin-bottom: 2px;">
                  ${repName}
                </div>
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #CEB466; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                  ${repTitle} | Voice Alchemy Academy
                </div>
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #555; line-height: 1.6;">
                  <span style="color: #CEB466; font-weight: bold;">P:</span> ${formattedPhone}<br>
                  <span style="color: #CEB466; font-weight: bold;">E:</span> <a href="mailto:${repEmail}" style="color: #171229; text-decoration: underline;">${repEmail}</a><br>
                  <span style="color: #CEB466; font-weight: bold;">W:</span> <a href="https://www.voicealchemyacademy.com" style="color: #CEB466; text-decoration: none; font-weight: bold;">www.voicealchemyacademy.com</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `
}

// 1. Welcome & Orientation Template
const welcomeTemplate: EmailTemplate = {
  id: 'welcome-orientation',
  name: 'Welcome & Orientation',
  description: 'Welcome new vocal students and provide classroom setup guidelines',
  subject: 'Welcome to Voice Alchemy Academy — Your Vocal Transformation Begins!',
  category: 'coaching',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-top: 24px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #171229 0%, #2b1f47 100%); padding: 36px 30px; text-align: center; border-bottom: 3px solid #CEB466;">
      <h1 style="color: #CEB466; font-size: 24px; margin: 0; font-weight: bold; letter-spacing: 0.5px;">VOICE ALCHEMY ACADEMY</h1>
      <p style="color: #e2e8f0; font-size: 14px; margin: 6px 0 0 0; opacity: 0.9;">Mastery in Vocal Artistry, Pitch Discipline & Expression</p>
    </div>
    
    <div style="padding: 36px 30px;">
      <h2 style="color: #171229; font-size: 20px; margin-top: 0; margin-bottom: 16px;">Welcome, ${firstName}!</h2>
      <p style="font-size: 15px; line-height: 1.7; color: #334155; margin-bottom: 16px;">
        We are thrilled to welcome you to Voice Alchemy Academy. Your journey toward effortless vocal freedom, precise pitch centering, and authentic artistic expression begins today.
      </p>
      
      <div style="background-color: #fcfaf2; border-left: 4px solid #CEB466; padding: 18px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <h3 style="color: #171229; font-size: 16px; margin: 0 0 10px 0; font-weight: bold;">Quick Preparation Checklist:</h3>
        <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.7;">
          <li><strong>Studio Audio:</strong> Use wired headphones for real-time acoustic feedback and pitch accuracy.</li>
          <li><strong>Training Center:</strong> Explore our interactive pitch, scale, and rhythm trainers in your dashboard.</li>
          <li><strong>Hydration:</strong> Drink room-temperature water 30 minutes before every coaching session.</li>
          <li><strong>Songwriting:</strong> Have 1–2 songs or lyrics ready in your Songwriting Studio workspace.</li>
        </ul>
      </div>

      <p style="font-size: 15px; line-height: 1.7; color: #334155;">
        You can access your live classroom, practice recordings, and lesson notes directly through your student portal anytime.
      </p>

      <div style="text-align: center; margin: 30px 0 20px 0;">
        <a href="https://www.voicealchemyacademy.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #CEB466 0%, #a8914a 100%); color: #171229; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 12px rgba(206, 180, 102, 0.3);">
          Access Your Student Dashboard →
        </a>
      </div>

      ${generateSignatureHtml(repName, repPhone, repEmail, 'Lead Vocal Coach')}
    </div>
  </div>
</body>
</html>
`,
  generateText: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
Hi ${firstName},

Welcome to Voice Alchemy Academy! We are thrilled to partner with you on your vocal journey.

Quick Preparation Checklist:
- Studio Audio: Use wired headphones for real-time acoustic feedback and pitch tracking.
- Training Center: Explore our interactive pitch, scale, and rhythm trainers in your dashboard.
- Hydration: Drink room-temperature water 30 minutes before your sessions.
- Songwriting: Have 1–2 song ideas or lyrics ready in your studio workspace.

You can access your live classroom and lesson archives at:
https://www.voicealchemyacademy.com/dashboard

Looking forward to our upcoming sessions,
${repName}
Voice Alchemy Academy
${formatPhoneDisplay(repPhone)}
`,
}

// 2. Post-Lesson Practice Plan
const lessonPlanTemplate: EmailTemplate = {
  id: 'post-lesson-plan',
  name: 'Post-Lesson Vocal Plan',
  description: 'Send custom vocal exercises, SOVT drills, and session takeaways',
  subject: 'Your Vocal Practice Plan & Lesson Highlights — Voice Alchemy Academy',
  category: 'coaching',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-top: 24px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #171229 0%, #2b1f47 100%); padding: 32px 30px; text-align: center; border-bottom: 3px solid #CEB466;">
      <h1 style="color: #CEB466; font-size: 22px; margin: 0; font-weight: bold;">VOCAL PRACTICE PRESCRIPTION</h1>
      <p style="color: #e2e8f0; font-size: 13px; margin: 4px 0 0 0;">Voice Alchemy Academy Mastery System</p>
    </div>
    
    <div style="padding: 32px 30px;">
      <p style="font-size: 15px; line-height: 1.7; color: #334155;">
        Great work in our session today, <strong>${firstName}</strong>! Your resonance placement and breath support showed noticeable expansion.
      </p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="color: #171229; font-size: 16px; margin: 0 0 12px 0;">Recommended 20-Minute Daily Protocol:</h3>
        <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
          <li><strong>SOVT Straw Reset (5 min):</strong> Gentle semi-occluded glides from low chest to head voice to balance cord adduction.</li>
          <li><strong>Scale Trainer Practice (8 min):</strong> Sing major & minor pentatonic scales with steady intonation and zero throat tension.</li>
          <li><strong>Song Application (7 min):</strong> Apply open-vowel phrasing to your target song verse & chorus.</li>
        </ol>
      </div>

      <p style="font-size: 14px; line-height: 1.7; color: #475569;">
        Your interactive session recording and shared whiteboard notes are now updated in your Academy cockpit.
      </p>

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="https://www.voicealchemyacademy.com/dashboard/my-lessons" style="display: inline-block; background: linear-gradient(135deg, #CEB466 0%, #a8914a 100%); color: #171229; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px;">
          Review Lesson Notes & Audio →
        </a>
      </div>

      ${generateSignatureHtml(repName, repPhone, repEmail, 'Vocal Instructor')}
    </div>
  </div>
</body>
</html>
`,
  generateText: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
Hi ${firstName},

Great work in our coaching session today!

Recommended 20-Minute Daily Practice Routine:
1. SOVT Straw Reset (5 min): Gentle semi-occluded glides to balance cord adduction.
2. Scale Trainer Practice (8 min): Sing major & minor pentatonic scales with steady intonation.
3. Song Application (7 min): Apply open-vowel phrasing to your current repertoire.

Your lesson notes and recording archives are available in your portal:
https://www.voicealchemyacademy.com/dashboard/my-lessons

Keep singing with intention,
${repName}
Voice Alchemy Academy
${formatPhoneDisplay(repPhone)}
`,
}

// 3. Training Center Invitation
const trainingCenterTemplate: EmailTemplate = {
  id: 'training-center',
  name: 'Training Center Guided Drills',
  description: 'Invite students to train pitch accuracy, scales, and rhythm daily',
  subject: 'Level Up Your Pitch & Rhythm — Voice Alchemy Training Center',
  category: 'coaching',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-top: 24px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #171229 0%, #2b1f47 100%); padding: 32px 30px; text-align: center; border-bottom: 3px solid #CEB466;">
      <h1 style="color: #CEB466; font-size: 22px; margin: 0; font-weight: bold;">TRAINING CENTER SUITE</h1>
      <p style="color: #e2e8f0; font-size: 13px; margin: 4px 0 0 0;">Real-Time AI Acoustic Feedback</p>
    </div>
    
    <div style="padding: 32px 30px;">
      <p style="font-size: 15px; line-height: 1.7; color: #334155;">
        Hi <strong>${firstName}</strong>, consistent daily training builds muscle memory faster than once-a-week long sessions. Have you checked out your updated Training Center?
      </p>
      
      <div style="display: grid; gap: 12px; margin: 20px 0;">
        <div style="padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <strong style="color: #171229;">Modern Pitch Trainer:</strong> Sing sustained tones with real-time cents deviation analysis and stability scoring.
        </div>
        <div style="padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <strong style="color: #171229;">Scale & Intonation Trainer:</strong> Listen first, then sing along to major, natural minor, and modal scales.
        </div>
        <div style="padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <strong style="color: #171229;">Rhythm & Groove Trainer:</strong> Lock your rhythmic timing and syncopation to high-precision metronomes.
        </div>
      </div>

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="https://www.voicealchemyacademy.com/dashboard/training-center" style="display: inline-block; background: linear-gradient(135deg, #CEB466 0%, #a8914a 100%); color: #171229; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px;">
          Start Daily Workout →
        </a>
      </div>

      ${generateSignatureHtml(repName, repPhone, repEmail, 'Training Center Director')}
    </div>
  </div>
</body>
</html>
`,
  generateText: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
Hi ${firstName},

Consistent daily training builds muscle memory faster than once-a-week long sessions.

Check out our 3 interactive training suites:
- Modern Pitch Trainer: Sing sustained tones with real-time cents deviation analysis.
- Scale & Intonation Trainer: Listen to scales first, then sing along with real-time evaluation.
- Rhythm & Groove Trainer: Lock your rhythmic phrasing to precision tempos.

Launch your workout here:
https://www.voicealchemyacademy.com/dashboard/training-center

Happy singing,
${repName}
Voice Alchemy Academy
${formatPhoneDisplay(repPhone)}
`,
}

// 4. Live Lesson Booking Confirmation
const bookingConfirmTemplate: EmailTemplate = {
  id: 'lesson-booking-confirm',
  name: 'Live Lesson Confirmation',
  description: 'Confirm scheduled live 1-on-1 vocal coaching session and room link',
  subject: 'Confirmed: Your Live Vocal Coaching Session — Voice Alchemy Academy',
  category: 'enrollment',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-top: 24px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #171229 0%, #2b1f47 100%); padding: 32px 30px; text-align: center; border-bottom: 3px solid #CEB466;">
      <h1 style="color: #CEB466; font-size: 22px; margin: 0; font-weight: bold;">LIVE LESSON CONFIRMED</h1>
      <p style="color: #e2e8f0; font-size: 13px; margin: 4px 0 0 0;">1-on-1 Master Vocal Classroom</p>
    </div>
    
    <div style="padding: 32px 30px;">
      <p style="font-size: 15px; line-height: 1.7; color: #334155;">
        Hi <strong>${firstName}</strong>, your live vocal coaching session is officially confirmed on the schedule!
      </p>
      
      <div style="background-color: #fcfaf2; border: 1px solid #e8dbb0; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="color: #171229; font-size: 16px; margin: 0 0 10px 0;">Session Details:</h3>
        <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Instructor:</strong> ${repName}</p>
        <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Format:</strong> High-Definition WebRTC Live Classroom</p>
        <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Features:</strong> Dual-channel recording & live collaborative whiteboard</p>
      </div>

      <p style="font-size: 14px; line-height: 1.7; color: #475569;">
        Please join 2–3 minutes early using Google Chrome or Safari on desktop for the best audio latency.
      </p>

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="https://www.voicealchemyacademy.com/dashboard/my-lessons" style="display: inline-block; background: linear-gradient(135deg, #CEB466 0%, #a8914a 100%); color: #171229; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px;">
          Enter Live Classroom →
        </a>
      </div>

      ${generateSignatureHtml(repName, repPhone, repEmail, 'Academy Coordinator')}
    </div>
  </div>
</body>
</html>
`,
  generateText: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
Hi ${firstName},

Your live 1-on-1 vocal coaching session is confirmed!

Instructor: ${repName}
Platform: High-Definition WebRTC Live Classroom

Join your classroom directly from your dashboard:
https://www.voicealchemyacademy.com/dashboard/my-lessons

Please use headphones for optimal acoustic quality.

See you in class,
${repName}
Voice Alchemy Academy
${formatPhoneDisplay(repPhone)}
`,
}

// 5. Academy Feedback & Review Request
const reviewRequestTemplate: EmailTemplate = {
  id: 'review-request',
  name: 'Student Experience Review',
  description: 'Request a testimonial and review of the student coaching experience',
  subject: 'How is your voice feeling? Share your Voice Alchemy journey',
  category: 'enrollment',
  generateHtml: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-top: 24px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #171229 0%, #2b1f47 100%); padding: 32px 30px; text-align: center; border-bottom: 3px solid #CEB466;">
      <h1 style="color: #CEB466; font-size: 22px; margin: 0; font-weight: bold;">STUDENT EXPERIENCE</h1>
      <p style="color: #e2e8f0; font-size: 13px; margin: 4px 0 0 0;">Voice Alchemy Academy Community</p>
    </div>
    
    <div style="padding: 32px 30px;">
      <p style="font-size: 15px; line-height: 1.7; color: #334155;">
        Hi <strong>${firstName}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.7; color: #334155;">
        It has been such an honor watching your voice grow and hearing the confidence in your phrasing. Our team puts immense dedication into creating the highest-level coaching experience possible.
      </p>
      <p style="font-size: 15px; line-height: 1.7; color: #334155;">
        If you have a quick moment, we would love to hear about your experience with Voice Alchemy Academy and what breakthroughs you've made in your vocal journey!
      </p>

      <div style="text-align: center; margin: 28px 0 20px 0;">
        <a href="https://www.voicealchemyacademy.com" style="display: inline-block; background: linear-gradient(135deg, #CEB466 0%, #a8914a 100%); color: #171229; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px;">
          Leave Your Academy Feedback
        </a>
      </div>

      ${generateSignatureHtml(repName, repPhone, repEmail, 'Head Coach')}
    </div>
  </div>
</body>
</html>
`,
  generateText: (firstName: string, repName: string, repPhone: string, repEmail: string) => `
Hi ${firstName},

Thank you for being part of Voice Alchemy Academy! It has been an honor working with you and watching your vocal freedom expand.

If you have a moment, we would greatly appreciate your feedback and review:
https://www.voicealchemyacademy.com

Warmly,
${repName}
Voice Alchemy Academy
${formatPhoneDisplay(repPhone)}
`,
}

const templates: EmailTemplate[] = [
  welcomeTemplate,
  lessonPlanTemplate,
  trainingCenterTemplate,
  bookingConfirmTemplate,
  reviewRequestTemplate,
]

const templateCategories: TemplateCategory[] = [
  {
    id: 'coaching',
    name: 'Vocal Coaching & Practice',
    icon: Sparkles,
    templates: templates.filter((t) => t.category === 'coaching'),
  },
  {
    id: 'enrollment',
    name: 'Enrollment & Classroom',
    icon: GraduationCap,
    templates: templates.filter((t) => t.category === 'enrollment'),
  },
]

export default function QuickSendPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate>(templates[0])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [repInfo, setRepInfo] = useState({ name: '', phone: '(310) 209-8166', email: '' })
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['coaching', 'enrollment'])

  // Form fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  // Editable canvas state
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [subject, setSubject] = useState(templates[0].subject)
  const [isEditing, setIsEditing] = useState(false)
  const [hasEdits, setHasEdits] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!isEditing && !hasEdits) {
      setPreviewHtml(
        selectedTemplate.generateHtml(
          firstName || '[First Name]',
          repInfo.name || 'Voice Alchemy Coach',
          repInfo.phone,
          repInfo.email
        )
      )
    }
  }, [selectedTemplate, firstName, repInfo, isEditing, hasEdits])

  useEffect(() => {
    setSubject(selectedTemplate.subject)
  }, [selectedTemplate])

  const toggleEditMode = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    if (!isEditing) {
      doc.designMode = 'on'
      setIsEditing(true)
    } else {
      doc.designMode = 'off'
      setPreviewHtml('<!DOCTYPE html>\n' + doc.documentElement.outerHTML)
      setHasEdits(true)
      setIsEditing(false)
    }
  }

  const resetEdits = () => {
    const doc = iframeRef.current?.contentDocument
    if (doc && doc.designMode === 'on') doc.designMode = 'off'
    setIsEditing(false)
    setHasEdits(false)
    setSubject(selectedTemplate.subject)
    setPreviewHtml(
      selectedTemplate.generateHtml(
        firstName || '[First Name]',
        repInfo.name || 'Voice Alchemy Coach',
        repInfo.phone,
        repInfo.email
      )
    )
  }

  const loadData = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name, email')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        setUserId(profile.id)
        const coachName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Voice Alchemy Coach'
        setRepInfo({
          name: coachName,
          phone: '(310) 209-8166',
          email: profile.email || user.email || '',
        })
      }

      const { data: accountsData } = await supabase
        .from('email_accounts')
        .select('*, email_domains(*)')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('is_primary', { ascending: false })

      if (accountsData && accountsData.length > 0) {
        setAccounts(accountsData)
        const primary = accountsData.find((a) => a.is_primary) || accountsData[0]
        setSelectedAccount(primary)
      }
    } catch (err) {
      console.error('Error loading quick-send data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!email || !firstName) {
      setError('Please fill in student name and email address')
      return
    }

    setSending(true)
    setError(null)

    try {
      const supabase = createClient()

      const { data: studentProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle()

      const canvasDoc = iframeRef.current?.contentDocument
      if (canvasDoc && canvasDoc.designMode === 'on') canvasDoc.designMode = 'off'
      const usingEditedCanvas = (hasEdits || isEditing) && !!canvasDoc

      const bodyHtml = usingEditedCanvas
        ? '<!DOCTYPE html>\n' + canvasDoc!.documentElement.outerHTML
        : selectedTemplate.generateHtml(firstName, repInfo.name, repInfo.phone, repInfo.email)

      let bodyText = selectedTemplate.generateText(firstName, repInfo.name, repInfo.phone, repInfo.email)
      if (usingEditedCanvas && canvasDoc?.body) {
        bodyText = (canvasDoc.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim()
      }

      const sendResponse = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: selectedAccount?.id,
          to: [email],
          subject: subject.trim() || selectedTemplate.subject,
          body_html: bodyHtml,
          body_text: bodyText,
          recipient_id: studentProfile?.id || null,
        }),
      })

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to dispatch email')
      }

      setSuccess(true)
      setFirstName('')
      setLastName('')
      setEmail('')
      resetEdits()
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      console.error('Error sending quick email:', err)
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <section className="glass-card-luxe rounded-3xl border border-[#CEB466]/40 p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-xs font-semibold text-[#CEB466] mb-2">
              <Zap className="w-3.5 h-3.5" />
              <span>Direct Studio Dispatch</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white font-luxury">
              Quick Send Coaching Emails
            </h1>
            <p className="text-xs sm:text-sm text-gray-300 mt-1 max-w-2xl">
              Dispatch structured onboarding, practice plans, and classroom links to students in seconds.
            </p>
          </div>

          {selectedAccount && (
            <div className="glass-card-subtle px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div className="text-left">
                <span className="text-[10px] uppercase text-gray-400 font-bold block">Sending Account</span>
                <span className="text-xs text-white font-mono">{selectedAccount.email_address}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template Selection & Recipient Info */}
        <div className="lg:col-span-5 space-y-6">
          {/* Recipient Form */}
          <div className="glass-card rounded-2xl border border-white/10 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-[#CEB466]" />
              <span>Student Recipient</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">First Name *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Elena"
                  className="glass-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Rostova"
                  className="glass-input w-full text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Student Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="glass-input w-full text-sm"
              />
            </div>
          </div>

          {/* Template Picker */}
          <div className="glass-card rounded-2xl border border-white/10 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#CEB466]" />
              <span>Select Preset Template</span>
            </h3>

            <div className="space-y-4">
              {templateCategories.map((category) => {
                const isExpanded = expandedCategories.includes(category.id)
                const CategoryIcon = category.icon

                return (
                  <div key={category.id} className="space-y-2">
                    <button
                      onClick={() =>
                        setExpandedCategories((prev) =>
                          prev.includes(category.id)
                            ? prev.filter((id) => id !== category.id)
                            : [...prev, category.id]
                        )
                      }
                      className="w-full flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider py-1 hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <CategoryIcon className="w-3.5 h-3.5 text-[#CEB466]" />
                        {category.name} ({category.templates.length})
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="space-y-2 pl-2">
                        {category.templates.map((tpl) => {
                          const isSelected = selectedTemplate.id === tpl.id
                          return (
                            <button
                              key={tpl.id}
                              onClick={() => {
                                setSelectedTemplate(tpl)
                                resetEdits()
                              }}
                              className={`w-full text-left p-3 rounded-xl border transition-all ${
                                isSelected
                                  ? 'bg-[#CEB466]/15 border-[#CEB466] shadow-md shadow-[#CEB466]/10'
                                  : 'bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.05]'
                              }`}
                            >
                              <div className="font-semibold text-sm text-white">{tpl.name}</div>
                              <div className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                                {tpl.description}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Email Preview & Dispatch */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card rounded-2xl border border-white/10 p-5 space-y-4 flex flex-col h-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex-1">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">
                  Subject Line (Editable)
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value)
                    setHasEdits(true)
                  }}
                  className="glass-input w-full text-sm font-semibold text-white"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={toggleEditMode}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isEditing
                      ? 'bg-amber-500 text-black font-bold animate-pulse'
                      : 'glass-button text-gray-300 hover:text-white'
                  }`}
                  title={isEditing ? 'Click to finalize canvas edits' : 'Click to edit text directly inside preview'}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Editing Canvas...' : 'Edit Content'}</span>
                </button>

                {hasEdits && (
                  <button
                    onClick={resetEdits}
                    className="p-2 rounded-xl glass-button text-gray-400 hover:text-white"
                    title="Reset to original template"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Email Preview Frame */}
            <div className="flex-1 min-h-[460px] bg-slate-100 rounded-xl overflow-hidden border border-white/10 relative">
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                title="Email Preview"
                className="w-full h-full min-h-[460px] border-none"
              />
            </div>

            {/* Messages */}
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Email successfully sent to {email}!</span>
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={handleSend}
              disabled={sending || !firstName || !email}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#CEB466] to-[#9c8644] hover:from-[#e0c97d] hover:to-[#CEB466] text-[#171229] font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#CEB466]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#171229] border-t-transparent" />
                  <span>Dispatching Email...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Coaching Email Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
