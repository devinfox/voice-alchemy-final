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
      title: '1. Practice Tools',
      content:
        'Start here to practice pitch, rhythm, and scales. For scales, listen first, then sing.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-reports-link"]',
      title: '2. See Your Progress',
      content:
        'Open the Training Center to see how your practice is going and get simple coaching tips.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-lessons-link"]',
      title: '3. Book Your Coach',
      content:
        'When you’re ready, find your voice coach and request a 1:1 lesson. Once you have one, your live lessons and shared notes happen right here.',
      placement: 'top',
    },
  ]

  const teacherSteps: SpotlightStep[] = [
    {
      target: '[data-tour="dashboard-courses-link"]',
      title: '1. Make Courses',
      content:
        'Create lessons for your students and add simple quizzes if you want.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-lessons-link"]',
      title: '2. Teach Live Lessons',
      content:
        'Start a video lesson, take notes together, and review past sessions later.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-reports-link"]',
      title: '3. Check Student Progress',
      content:
        'See your students, their bookings, and how their practice is going.',
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
          ? 'Want a quick tour? I can show you where to make courses, start lessons, and check student progress.'
          : 'Want a quick tour? I can show you where to practice, take lessons, and see your progress.',
        confirmText: 'Yes, Show Me',
        cancelText: 'No thanks',
      }}
    />
  )
}
