import type { Metadata } from "next";
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
  title: "Voice Alchemy Academy | Online Voice Lessons & Artist Mentorship",
  description: "Unlock your voice with world-class online singing lessons, private mentorship, and exclusive music events. Develop vocal mastery, artistic confidence, and stage presence from anywhere.",
  // Favicon and touch icon come from app/favicon.ico, app/icon.png and
  // app/apple-icon.png (the VAA gold badge); Next emits the <link> tags itself.
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
