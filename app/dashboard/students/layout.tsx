import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Students',
  description: 'Your roster with live practice data, lesson requests, notes and check-ins for every student.',
}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
