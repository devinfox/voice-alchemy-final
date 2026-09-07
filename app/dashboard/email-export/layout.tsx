import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Email Export',
  description: 'Export email conversations.',
}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
