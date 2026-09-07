import type { Metadata, Viewport } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_URL, MARKETING_URL, OG_IMAGE } from "@/lib/seo";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  applicationName: APP_NAME,
  title: {
    default: 'Voice Alchemy Academy · Vocal Training App, Online Voice Lessons & Mentorship',
    template: '%s · Voice Alchemy Academy',
  },
  description: APP_DESCRIPTION,
  keywords: ['singing app', 'vocal training app', 'pitch trainer', 'online voice lessons', 'voice mentorship', 'Voice Alchemy Academy'],
  authors: [{ name: APP_NAME, url: MARKETING_URL }],
  creator: APP_NAME,
  publisher: APP_NAME,
  category: 'education',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: APP_NAME,
    title: 'Voice Alchemy Academy · Your Training Center, lessons and courses in one place',
    description: APP_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Voice Alchemy Academy app',
    description: APP_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  formatDetection: { email: false, address: false, telephone: false },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'black-translucent' },
  // Favicon and touch icon come from app/favicon.ico, app/icon.png and
  // app/apple-icon.png (the VAA gold badge); Next emits the <link> tags itself.
};

export const viewport: Viewport = {
  themeColor: '#0f0b1e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${cormorant.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
