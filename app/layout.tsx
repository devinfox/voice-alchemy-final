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
  icons: {
    icon: "https://voicealchemyacademy.com/wp-content/uploads/2023/04/cropped-favicon-vaa-32x32.png",
    apple: "https://voicealchemyacademy.com/wp-content/uploads/2023/04/cropped-favicon-vaa-180x180.png",
  },
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
