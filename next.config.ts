import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
