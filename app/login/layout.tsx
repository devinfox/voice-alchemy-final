import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log In',
  description: 'Log in to Voice Alchemy Academy to open your Training Center, lessons, courses and notes.',
  alternates: { canonical: '/login' },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
