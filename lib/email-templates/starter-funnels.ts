/**
 * The Voice Alchemy Academy email campaign: which starter templates make up
 * each funnel, in what order, and how many days apart. Installed by
 * POST /api/email-funnels/starter; editable in the funnel builder afterwards.
 *
 * Delays are relative to the previous phase (the CRM's model). The doc's
 * "day N" timings are converted here: Students land on days 0, 2, 5, 10, 17.
 */
import type { FunnelTriggerKey } from '@/lib/email-leads'

export interface StarterFunnelPhase {
  /** Starter template key, e.g. "students-1" */
  template: string
  name: string
  delay_days: number
  delay_hours: number
}

export interface StarterFunnel {
  trigger_key: FunnelTriggerKey
  name: string
  description: string
  tags: string[]
  phases: StarterFunnelPhase[]
}

export const STARTER_FUNNELS: StarterFunnel[] = [
  {
    trigger_key: 'student_signup',
    name: 'Students · New account',
    description:
      'A singer who just created a free account. Get them to sing one note in Pitch Perfect, build a small habit, then show courses, coaching feedback and mentorship once they have felt value.',
    tags: ['students', 'onboarding'],
    phases: [
      { template: 'students-1', name: 'Welcome / First Note', delay_days: 0, delay_hours: 0 },
      { template: 'students-2', name: '30-Second Check', delay_days: 2, delay_hours: 0 },
      { template: 'students-3', name: 'Scales + Rhythm', delay_days: 3, delay_hours: 0 },
      { template: 'students-4', name: 'Upgrade Path', delay_days: 5, delay_hours: 0 },
      { template: 'students-5', name: 'Re-engagement', delay_days: 7, delay_hours: 0 },
    ],
  },
  {
    trigger_key: 'student_lead',
    name: 'Student Leads · Pitch guide',
    description:
      'A visitor who left an email for the free pitch guide but has no account. Deliver the guide, teach one thing, then convert them to a free account. Ends automatically when they sign up.',
    tags: ['leads', 'students'],
    phases: [
      { template: 'leads-1', name: 'Pitch Guide Delivery', delay_days: 0, delay_hours: 0 },
      { template: 'leads-2', name: 'The Mistake Your Ears Miss', delay_days: 2, delay_hours: 0 },
      { template: 'leads-3', name: 'Before Your Next Rehearsal', delay_days: 3, delay_hours: 0 },
    ],
  },
  {
    trigger_key: 'teacher_demo',
    name: 'Teachers · Demo request',
    description:
      'A vocal coach or studio owner who requested a platform demo. Confirm, remind if unbooked, offer the playbook, then one thought-leadership email two weeks later. Remove them from the funnel once the demo is booked; the recap and keep-your-spot emails are sent by hand.',
    tags: ['teachers', 'demo'],
    phases: [
      { template: 'teachers-1', name: 'Demo Request Received', delay_days: 0, delay_hours: 0 },
      { template: 'teachers-2', name: 'Unbooked Reminder', delay_days: 3, delay_hours: 0 },
      { template: 'teachers-3', name: 'Practice Visibility Playbook', delay_days: 2, delay_hours: 0 },
      { template: 'teachers-6', name: 'Between Lessons', delay_days: 14, delay_hours: 0 },
    ],
  },
  {
    trigger_key: 'teacher_lead',
    name: 'Teachers · Playbook (email only)',
    description:
      'A coach who left an email on the website without asking for a demo. Send the practice visibility playbook, then the between-lessons essay two weeks later.',
    tags: ['teachers', 'leads'],
    phases: [
      { template: 'teachers-3', name: 'Practice Visibility Playbook', delay_days: 0, delay_hours: 0 },
      { template: 'teachers-6', name: 'Between Lessons', delay_days: 14, delay_hours: 0 },
    ],
  },
  {
    trigger_key: 'mentorship_application',
    name: 'Mentorship · Voice Application',
    description:
      'Someone who submitted a Voice Application for 1:1 mentorship. Confirm it landed and keep them warm in the free app while Julia reads it. The acceptance and not-this-semester emails are sent by hand from the template list.',
    tags: ['mentorship'],
    phases: [
      { template: 'mentorship-1', name: 'Application Received', delay_days: 0, delay_hours: 0 },
      { template: 'mentorship-2', name: 'While Julia Reviews', delay_days: 2, delay_hours: 0 },
    ],
  },
]

/** Templates in the campaign that are only ever sent by hand. */
export const MANUAL_SEND_TEMPLATES = ['teachers-4', 'teachers-5', 'mentorship-3', 'mentorship-4']

/** Doc emails that are not installed (the website cannot fire them yet). */
export const SKIPPED_TEMPLATES = ['mentorship-5', 'mentorship-6']

export const CAMPAIGN_TEMPLATE_KEYS = [
  ...new Set([...STARTER_FUNNELS.flatMap(f => f.phases.map(p => p.template)), ...MANUAL_SEND_TEMPLATES]),
]
