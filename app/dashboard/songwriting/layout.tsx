import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Songwriting',
  description: 'Write, arrange and get feedback on your songs.',
}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
