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
      title: '1. Your Daily Practice',
      content:
        'This is your daily practice hub. The badges show your streak, days practiced this week, and your best score. The gold bars show your latest score in each trainer. Tap any of the colorful cards to start practicing.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-lessons-link"]',
      title: '2. Book Your Coach',
      content:
        'No coach yet? Tap "Find Your Coach" to request a 1:1 lesson. Once you have one, this card becomes your "Go to Class" button and your live lessons happen right here.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-reports-link"]',
      title: '3. See Your Progress',
      content:
        'This card shows how your pitch, rhythm, and scales are changing week to week. Tap "View Progress" for the full picture and simple coaching tips.',
      placement: 'top',
    },
  ]

  const teacherSteps: SpotlightStep[] = [
    {
      target: '[data-tour="dashboard-courses-link"]',
      title: '1. Build Courses',
      content:
        'Tap "Course Studio & Quizzes" to open your course list, then hit "+ Create Course & Quizzes" to build a course for your students — quizzes are optional.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-lessons-link"]',
      title: '2. Teach Live Lessons',
      content:
        'Tap "My Students & Live Classes" to see your roster. Pick a student and hit "Open Studio" to jump into the video room, with shared notes that save when class ends.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-reports-link"]',
      title: '3. See How Everyone Is Doing',
      content:
        'This opens your own pitch, rhythm, and scale metrics with AI insights. Each student\'s practice progress lives in My Students.',
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
