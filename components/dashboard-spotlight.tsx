'use client'

import React from 'react'
import { SpotlightTour, SpotlightStep } from '@/components/spotlight-tour'

interface DashboardSpotlightProps {
  isTeacher?: boolean
  userName?: string
}

export function DashboardSpotlight({ isTeacher = false, userName }: DashboardSpotlightProps) {
  const studentSteps: SpotlightStep[] = [
    {
      target: '[data-tour="dashboard-practice-arena"]',
      title: '1. The Three Live Practice Tools',
      content:
        'Right on your homepage, you have instant access to Pitch Perfect (chromatic ear training), the Rhythm Metronome game, and the Scale Trainer. In the Scale Trainer, remember to always click "1. Listen to Scale" first to internalize the intervals, then click "2. Start Practice" to sing!',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-reports-link"]',
      title: '2. Training Center & Progress Reports',
      content:
        'View in-depth reports tracking your pitch onset speed, vocal stability, and singing accuracy over time. Run AI Coach Analysis on your notes and practice recordings.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-lessons-link"]',
      title: '3. Live Classes & Collaborative Notes',
      content:
        'Enter your 1-on-1 live video classroom with your vocal coach, take synchronized notes together in real time, and review archived lesson recordings anytime.',
      placement: 'top',
    },
  ]

  const teacherSteps: SpotlightStep[] = [
    {
      target: '[data-tour="dashboard-courses-link"]',
      title: '1. Course Studio & Quizzes',
      content:
        'Design custom courses and transformation modules for your students. Add optional quizzes with multiple-choice questions, instant answers, and scoring.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-lessons-link"]',
      title: '2. Live Video Classroom & Shared Notes',
      content:
        'Launch 1-on-1 live video lessons with your students, collaborate on lesson notes in real time, and easily revisit past recorded sessions.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-reports-link"]',
      title: '3. Student Rosters & Progress Reports',
      content:
        'Manage student bookings, review daily pitch and rhythm practice metrics, and monitor vocal progress over time.',
      placement: 'top',
    },
  ]

  const tourKey = isTeacher ? 'teacher_dashboard_v4' : 'student_dashboard_v4'

  return (
    <SpotlightTour
      tourKey={tourKey}
      steps={isTeacher ? teacherSteps : studentSteps}
      autoStartOnFirstVisit={true}
      welcomePrompt={{
        title: isTeacher
          ? `Welcome Coach ${userName || ''}`
          : 'Welcome to Voice Alchemy Academy',
        message: isTeacher
          ? 'Ready to guide your vocalists? Take a quick tour to see how to build custom courses & quizzes, launch live classes, and review student progress reports.'
          : "There's tons of tools to help you become the brightest star you can! Would you like a walk around the platform?",
        confirmText: 'Yes, Walk Me Around',
        cancelText: 'No thanks',
      }}
    />
  )
}
