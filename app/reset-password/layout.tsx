import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Choose a new Voice Alchemy Academy password.',
  alternates: { canonical: '/reset-password' },
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
