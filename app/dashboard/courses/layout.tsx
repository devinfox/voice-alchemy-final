import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Courses',
  description: 'Structured vocal courses and masterclasses with lessons, modules and quizzes.',
}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
