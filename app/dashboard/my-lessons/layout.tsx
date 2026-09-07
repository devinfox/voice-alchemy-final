import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Lessons',
  description: 'Your teachers, upcoming live lessons and lesson notes.',
}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
