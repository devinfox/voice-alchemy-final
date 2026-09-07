import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Find a Teacher',
  description: 'Browse Voice Alchemy Academy teachers and request lessons.',
}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
