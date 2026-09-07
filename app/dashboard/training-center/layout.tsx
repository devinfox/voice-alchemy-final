import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Training Center',
  description: 'Practice with the Pitch Perfect, Scale Trainer and Rhythm Trainer tools and track your progress over time.',
}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
