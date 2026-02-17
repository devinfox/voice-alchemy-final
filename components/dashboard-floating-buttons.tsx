'use client'

import { usePathname } from 'next/navigation'
import { ChatWidget } from '@/components/chat-widget'
import TunerButton from '@/components/TunerButton'

interface DashboardFloatingButtonsProps {
  currentUserId: string
}

export function DashboardFloatingButtons({ currentUserId }: DashboardFloatingButtonsProps) {
  const pathname = usePathname()

  // Hide chat inside an individual lesson view to avoid overlapping controls.
  const isLessonView = pathname.startsWith('/dashboard/my-lessons/')

  return (
    <>
      <TunerButton />
      {!isLessonView && <ChatWidget currentUserId={currentUserId} />}
    </>
  )
}

