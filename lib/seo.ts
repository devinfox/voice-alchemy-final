/**
 * App-wide SEO constants. The app is mostly behind login: only the root
 * gateway, /login and /signup are indexable; everything under /dashboard
 * is noindex (see app/dashboard/layout.tsx and app/robots.ts).
 */
export const APP_NAME = 'Voice Alchemy Academy'
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.voicealchemyacademy.app').replace(/\/$/, '')
export const MARKETING_URL = 'https://voicealchemyacademy.app'
export const APP_DESCRIPTION =
  'The Voice Alchemy Academy app: real-time pitch, scale and rhythm trainers, AI coaching feedback, online voice lessons with notes and recordings, courses and one-on-one mentorship. Free to start.'
export const OG_IMAGE = { url: '/og/app.png', width: 1200, height: 630, alt: 'Voice Alchemy Academy app' }

/** Titles for sections whose pages are client components (set via a segment layout). */
export const NOINDEX = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } } as const
