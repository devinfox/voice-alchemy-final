'use client'

import Image from 'next/image'
import Link from 'next/link'
import { GraduationCap, Users, Sparkles } from 'lucide-react'

export function SignupGateway() {
  return (
    <div
      className="min-h-[100dvh] w-full relative overflow-x-hidden overflow-y-auto px-4 py-8 sm:py-12 md:py-16 flex flex-col items-center justify-center selection:bg-[#CEB466]/30 selection:text-[#CEB466]"
      style={{
        background: 'linear-gradient(180deg, #090514 0%, #120b24 35%, #190f33 65%, #0a0616 100%)',
      }}
    >
      {/* Luminous Ambient Nebula & Atmospheric Glow Waves */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 75% 45% at 50% 15%, rgba(206, 180, 102, 0.14) 0%, transparent 65%),
            radial-gradient(ellipse 90% 55% at 50% 80%, rgba(138, 58, 220, 0.20) 0%, transparent 75%),
            radial-gradient(circle at 10% 45%, rgba(168, 85, 247, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 90% 45%, rgba(168, 85, 247, 0.15) 0%, transparent 50%)
          `,
        }}
      />

      {/* Atmospheric Wave Texture */}
      <div className="absolute inset-0 opacity-20 sm:opacity-25 pointer-events-none">
        <Image
          src="/homepage/still.png"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#090514]/75" />
      </div>

      {/* Main Single Central Composition Floating Over Background */}
      <main className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center my-auto">
        {/* Top Logo */}
        <div className="flex flex-col items-center mb-4 sm:mb-6">
          <div className="relative w-40 sm:w-52 h-10 sm:h-14">
            <Image
              src="/voice-alchemy-logo-stacked.png"
              alt="Voice Alchemy Academy"
              fill
              className="object-contain drop-shadow-[0_0_25px_rgba(206,180,102,0.35)]"
              priority
            />
          </div>
          {/* Subtle Luminous Star Below Logo */}
          <div className="mt-2 sm:mt-3 text-[#CEB466] flex items-center justify-center opacity-90">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Primary Headline */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-light text-white font-luxury tracking-tight leading-[1.18] sm:leading-[1.12] max-w-2xl mx-auto px-2">
          Unlock your voice <br className="hidden sm:inline" />
          from anywhere.
        </h1>

        {/* Subtitle */}
        <p className="text-xs sm:text-base md:text-lg text-purple-200/75 max-w-xl mx-auto leading-relaxed mt-3 sm:mt-4 mb-6 sm:mb-8 px-3">
          Create your Voice Alchemy Academy account to access live lessons,
          vocal tools, recordings, and a supportive creative community.
        </p>

        {/* Eyebrow Divider */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-6 sm:mb-8 px-2">
          <Sparkles className="w-3 h-3 text-[#CEB466]" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] sm:tracking-[0.24em] text-[#CEB466]/90">
            Choose How You&apos;ll Use The Academy
          </span>
          <Sparkles className="w-3 h-3 text-[#CEB466]" />
        </div>

        {/* Two Undisputed Primary Choice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl px-2 sm:px-4">
          {/* 1. I'm here to learn */}
          <Link
            href="/signup?role=student"
            className="group relative rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10 flex flex-col items-center text-center transition-all duration-300 backdrop-blur-2xl bg-white/[0.03] border border-white/[0.12] hover:border-[#CEB466]/70 hover:bg-white/[0.07] hover:shadow-[0_0_50px_rgba(206,180,102,0.25)] hover:-translate-y-1 active:scale-[0.98]"
          >
            {/* Ambient inner glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#CEB466]/10 rounded-full blur-2xl group-hover:bg-[#CEB466]/20 transition-all pointer-events-none" />

            {/* Circular Icon Ring */}
            <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-full border border-[#CEB466]/40 bg-[#CEB466]/10 flex items-center justify-center text-[#CEB466] mb-4 sm:mb-6 group-hover:scale-110 group-hover:border-[#CEB466] group-hover:bg-[#CEB466]/20 transition-all duration-300 shadow-[0_0_25px_rgba(206,180,102,0.2)]">
              <GraduationCap className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl md:text-3xl font-normal text-white font-luxury mb-1.5 sm:mb-2 group-hover:text-[#CEB466] transition-colors">
              I&apos;m here to learn
            </h2>

            {/* Subtle Divider */}
            <div className="w-6 h-0.5 bg-[#CEB466]/40 my-1.5 rounded-full" />

            {/* Description */}
            <p className="text-xs sm:text-sm text-purple-200/70 leading-relaxed max-w-xs mt-1">
              Take lessons, access tools, and track your progress.
            </p>
          </Link>

          {/* 2. I'm here to teach */}
          <Link
            href="/signup?role=teacher"
            className="group relative rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10 flex flex-col items-center text-center transition-all duration-300 backdrop-blur-2xl bg-white/[0.03] border border-white/[0.12] hover:border-[#CEB466]/70 hover:bg-white/[0.07] hover:shadow-[0_0_50px_rgba(206,180,102,0.25)] hover:-translate-y-1 active:scale-[0.98]"
          >
            {/* Ambient inner glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#CEB466]/10 rounded-full blur-2xl group-hover:bg-[#CEB466]/20 transition-all pointer-events-none" />

            {/* Circular Icon Ring */}
            <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-full border border-[#CEB466]/40 bg-[#CEB466]/10 flex items-center justify-center text-[#CEB466] mb-4 sm:mb-6 group-hover:scale-110 group-hover:border-[#CEB466] group-hover:bg-[#CEB466]/20 transition-all duration-300 shadow-[0_0_25px_rgba(206,180,102,0.2)]">
              <Users className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl md:text-3xl font-normal text-white font-luxury mb-1.5 sm:mb-2 group-hover:text-[#CEB466] transition-colors">
              I&apos;m here to teach
            </h2>

            {/* Subtle Divider */}
            <div className="w-6 h-0.5 bg-[#CEB466]/40 my-1.5 rounded-full" />

            {/* Description */}
            <p className="text-xs sm:text-sm text-purple-200/70 leading-relaxed max-w-xs mt-1">
              Manage students, lessons, notes, and recordings.
            </p>
          </Link>
        </div>

        {/* Secondary Authentication Path */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-8 sm:mt-12 text-xs sm:text-sm text-purple-200/80 px-4">
          <span>Already have an account?</span>
          <Link
            href="/login"
            className="text-[#CEB466] hover:text-[#e2c974] underline underline-offset-4 font-semibold transition-colors ml-1"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  )
}
