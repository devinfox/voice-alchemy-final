import type { MetadataRoute } from 'next'
import { APP_NAME } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: 'VAA',
    description: 'Practice with the pitch, scale and rhythm trainers, review lesson notes and join live lessons.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0f0b1e',
    theme_color: '#0f0b1e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
