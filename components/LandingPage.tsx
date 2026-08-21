'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Instagram, Facebook, Linkedin, Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="landing-page">
      {/* Video Background - exactly like reference CRM */}
      <video
        className="video-background"
        autoPlay
        muted
        loop
        playsInline
        poster="/homepage/still.png"
      >
        <source src="/homepage/video-optimized.mp4" type="video/mp4" />
      </video>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="glass-card-subtle mx-4 mt-4 px-6 py-4 rounded-2xl">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <Image
                src="https://voicealchemyacademy.com/wp-content/uploads/2023/02/cropped-vaa-logo.png"
                alt="Voice Alchemy Academy"
                width={80}
                height={32}
                className="h-8 w-auto"
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              {['Home', 'Events', 'Mentorship', 'Test the App', 'Creative Coaching'].map((item) => (
                <Link
                  key={item}
                  href={item === 'Home' ? '/' : `#${item.toLowerCase().replace(/\s+/g, '-')}`}
                  className="text-white/70 hover:text-[var(--accent)] transition-colors text-sm font-medium tracking-wide"
                >
                  {item}
                </Link>
              ))}
              <Link
                href="/login"
                className="glass-button-gold px-5 py-2.5 text-sm font-semibold rounded-xl"
              >
                Sign In
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden text-white/70 hover:text-[var(--accent)] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <nav className="md:hidden mt-4 pt-4 border-t border-white/10 flex flex-col gap-4">
              {['Home', 'Events', 'Mentorship', 'Test the App', 'Creative Coaching'].map((item) => (
                <Link
                  key={item}
                  href={item === 'Home' ? '/' : `#${item.toLowerCase().replace(/\s+/g, '-')}`}
                  className="text-white/70 hover:text-[var(--accent)] transition-colors text-sm font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item}
                </Link>
              ))}
              <Link
                href="/login"
                className="glass-button-gold px-5 py-2.5 text-sm font-semibold rounded-xl text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
            </nav>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden z-10">
        {/* Animated Gradient Orbs - floating on top of video */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-[120px] animate-pulse pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--accent)]/10 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '1s' }} />

        {/* Hero Content */}
        <div className="relative z-10 text-center px-6 pt-32 pb-20">
          <h1 className="hero-title text-5xl md:text-7xl lg:text-8xl font-light tracking-[0.25em] text-white mb-6">
            <span className="text-gold-gradient">VOICE ALCHEMY</span>
            <br />
            <span className="text-white/90">ACADEMY</span>
          </h1>
          <div className="w-32 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent mx-auto mb-8" />
          <p className="text-[var(--accent)] text-lg md:text-xl font-medium tracking-wide max-w-2xl mx-auto">
            Online Voice Lessons, Artist Mentorship & Music Workshops
          </p>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-[var(--accent)] rounded-full animate-pulse" />
          </div>
        </div>
      </section>

      {/* Tagline Section */}
      <section className="relative py-20 overflow-hidden z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--accent)]/5 to-transparent" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="glass-card-gold p-10 md:p-14">
            <h2 className="text-[var(--accent)] text-xl md:text-2xl font-semibold tracking-wide mb-6">
              Voice Alchemy | Online Voice Lessons, Artist Mentorship & Music Workshops
            </h2>
            <p className="text-white/80 text-lg leading-relaxed">
              Unlock your voice with world-class online singing lessons, private mentorship, and exclusive music events.
              Develop vocal mastery, artistic confidence, and stage presence from anywhere.
            </p>
          </div>
        </div>
      </section>

      {/* Three Cards Section */}
      <section id="services" className="relative py-24 overflow-hidden z-10">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-[var(--background-dark)]/80 backdrop-blur-sm" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Events Card */}
            <div id="events" className="glass-card glass-card-hover p-8 flex flex-col items-center text-center group">
              <h3 className="text-2xl font-semibold text-white mb-6 tracking-wide">Events</h3>
              <div className="relative w-full aspect-[4/3] mb-6 rounded-xl overflow-hidden">
                <Image
                  src="https://voicealchemyacademy.com/wp-content/uploads/2025/02/Untitled-design-3.png"
                  alt="Voice Alchemy Events"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)]/60 to-transparent" />
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-8 flex-grow">
                Looking for a space to share your music, refine your craft, or connect with fellow creatives?
                Whether you&apos;re a songwriter, singer, or music enthusiast, our events offer a welcoming space
                to create, perform, and grow.
              </p>
              <Link
                href="#events"
                className="glass-button px-8 py-3 text-sm font-medium rounded-xl hover:border-[var(--accent)]/50 transition-all"
              >
                View Events
              </Link>
            </div>

            {/* Private Mentorship Card */}
            <div id="mentorship" className="glass-card glass-card-hover p-8 flex flex-col items-center text-center group">
              <h3 className="text-2xl font-semibold text-white mb-6 tracking-wide">Private Mentorship</h3>
              <div className="relative w-full aspect-[4/3] mb-6 rounded-xl overflow-hidden">
                <Image
                  src="https://voicealchemyacademy.com/wp-content/uploads/2023/12/zoom-class-julia-1.jpg"
                  alt="Private Voice Mentorship with Julia"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)]/60 to-transparent" />
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-8 flex-grow">
                Elevate your vocal journey with our personalized one-on-one mentorship program.
                Join Voice Alchemy Academy for a transformative semester of tailored guidance and mentorship.
              </p>
              <Link
                href="/signup"
                className="glass-button px-8 py-3 text-sm font-medium rounded-xl hover:border-[var(--accent)]/50 transition-all"
              >
                Apply
              </Link>
            </div>

            {/* Test the App Card */}
            <div id="test-the-app" className="glass-card glass-card-hover p-8 flex flex-col items-center text-center group">
              <h3 className="text-2xl font-semibold text-white mb-6 tracking-wide">Test the App</h3>
              <div className="relative w-full aspect-[4/3] mb-6 rounded-xl overflow-hidden bg-gradient-to-br from-purple-900/40 to-[var(--background)] flex items-center justify-center">
                {/* App Mockup Placeholder */}
                <div className="glass-card-animated p-6 rounded-2xl">
                  <div className="w-20 h-36 bg-gradient-to-b from-[var(--accent)]/30 to-purple-600/30 rounded-xl border border-white/20 flex items-center justify-center">
                    <div className="text-[var(--accent)] text-2xl font-bold">VAA</div>
                  </div>
                </div>
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-8 flex-grow">
                Explore the exclusive Voice Alchemy Academy app offering live video classes, video courses
                and essential vocal tools. Sign up to be one of the first to experience the magic.
              </p>
              <Link
                href="/signup"
                className="glass-button px-8 py-3 text-sm font-medium rounded-xl hover:border-[var(--accent)]/50 transition-all"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* About Julia Section */}
      <section className="relative py-20 overflow-hidden z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--background-dark)]/70 via-purple-950/30 to-[var(--background-dark)]/70 backdrop-blur-sm" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--accent)]/5 rounded-full blur-[150px]" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <p className="text-white/80 text-lg md:text-xl leading-relaxed">
            At Voice Alchemy Academy, <span className="text-[var(--accent)] font-medium">Julia</span> is your dedicated voice coach
            on a mission to unlock your full potential. Join us in a journey of self-discovery, creative expression,
            and vocal transformation. Let Julia guide you to unlock the hidden depths of your voice and take your
            singing to new heights.
          </p>
        </div>
      </section>

      {/* Creative Coaching CTA Section */}
      <section id="creative-coaching" className="relative py-24 overflow-hidden z-10">
        <div className="absolute inset-0 bg-[var(--background)]/80 backdrop-blur-sm" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent" />

        {/* Decorative Elements */}
        <div className="absolute top-10 left-10 w-32 h-32 border border-[var(--accent)]/10 rounded-full" />
        <div className="absolute bottom-10 right-10 w-48 h-48 border border-purple-500/10 rounded-full" />

        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-light text-white mb-6 tracking-wide">
            Interested in <span className="text-gold-gradient">Creative Coaching</span>?
          </h2>
          <p className="text-white/70 text-lg leading-relaxed mb-10">
            Mindful Artistry is the future of creative coworking. Join online retreats for artists, entrepreneurs,
            and doers of all kinds. Click below for sessions and resources.
          </p>
          <Link
            href="/signup"
            className="btn-primary-glow inline-block px-10 py-4 text-base font-semibold rounded-xl"
          >
            Sign Up
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 border-t border-white/10 z-10 bg-[var(--background)]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Privacy Policy */}
            <Link
              href="/privacy"
              className="text-[var(--accent)] text-sm font-medium tracking-wider hover:text-[var(--accent-light)] transition-colors"
            >
              PRIVACY POLICY
            </Link>

            {/* Social Icons */}
            <div className="flex items-center gap-6">
              <a
                href="https://instagram.com/voicealchemyacademy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-[var(--accent)] transition-colors"
              >
                <Instagram size={22} />
              </a>
              <a
                href="https://facebook.com/voicealchemyacademy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-[var(--accent)] transition-colors"
              >
                <Facebook size={22} />
              </a>
              <a
                href="https://linkedin.com/company/voicealchemyacademy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-[var(--accent)] transition-colors"
              >
                <Linkedin size={22} />
              </a>
            </div>

            {/* Contact Email */}
            <a
              href="mailto:HELLO@VOICEALCHEMYACADEMY.COM"
              className="text-[var(--accent)] text-sm font-medium tracking-wider hover:text-[var(--accent-light)] transition-colors"
            >
              HELLO@VOICEALCHEMYACADEMY.COM
            </a>
          </div>

          {/* Copyright */}
          <div className="mt-8 pt-8 border-t border-white/5 text-center">
            <p className="text-white/30 text-sm">
              &copy; {new Date().getFullYear()} Voice Alchemy Academy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
