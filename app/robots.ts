import type { MetadataRoute } from 'next'
import { APP_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/login', '/signup'], disallow: ['/dashboard/', '/api/', '/auth/', '/forgot-password', '/reset-password'] }],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  }
}
