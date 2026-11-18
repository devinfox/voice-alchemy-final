import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No "X-Powered-By" header: one less byte per response and less to fingerprint.
  poweredByHeader: false,
  experimental: {
    // Import only the pieces used from these large libraries.
    optimizePackageImports: ['date-fns', 'date-fns-tz', 'lucide-react'],
  },
  images: {
    // Serve modern, smaller formats when the browser supports them.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'voicealchemyacademy.com',
        pathname: '/wp-content/uploads/**',
      },
    ],
  },
  // Allow Cloudflare tunnel domains in development
  allowedDevOrigins: [
    'http://localhost:3000',
    'https://*.trycloudflare.com',
  ],
};

export default nextConfig;
