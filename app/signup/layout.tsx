import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create a Free Account',
  description: 'Create a free Voice Alchemy Academy account as a student or teacher. Start with the pitch, scale and rhythm trainers today.',
  alternates: { canonical: '/signup' },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
