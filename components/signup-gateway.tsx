'use client'

import Image from 'next/image'
import Link from 'next/link'
import { GraduationCap, Sparkles, Users } from 'lucide-react'

export function SignupGateway() {
  return (
    <div
      className="min-h-screen relative overflow-hidden px-4 py-8 flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0f0b1e 0%, #171229 25%, #1f1839 50%, #171229 75%, #0f0b1e 100%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 20%, rgba(206, 180, 102, 0.16) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 75%, rgba(168, 85, 247, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(31, 24, 57, 0.72) 0%, transparent 70%)
          `,
        }}
      />

      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <Image
          src="/homepage/still.png"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#0f0b1e]/75" />
      </div>

      <main className="relative z-10 w-full max-w-5xl">
        <div className="flex justify-center mb-8">
          <Image
            src="/voice-alchemy-logo-stacked.png"
            alt="Voice Alchemy Academy"
            width={190}
            height={46}
            className="object-contain"
            priority
          />
        </div>

        <section className="grid lg:grid-cols-[1.05fr_0.95fr] gap-6 items-stretch">
          <div className="glass-card-gold rounded-[20px] p-8 md:p-10 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-[#CEB466]/30 bg-[#CEB466]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#CEB466] mb-8">
              <Sparkles className="w-4 h-4" />
              Voice Alchemy Academy
            </div>

            <h1 className="text-4xl md:text-6xl font-light text-white leading-tight mb-5">
              Unlock your voice from anywhere.
            </h1>

            <p className="text-base md:text-lg text-white/75 leading-relaxed max-w-xl mb-8">
              Create your Voice Alchemy Academy account to access live lessons,
              vocal tools, recordings, and a supportive creative community.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-[#CEB466]/35 bg-[#CEB466]/10 px-5 py-3 text-sm font-bold text-[#CEB466] transition-all hover:border-[#CEB466]/70 hover:bg-[#CEB466]/15 hover:text-[#e0c97d]"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </div>

          <div className="glass-card rounded-[20px] p-6 md:p-8 border border-white/10">
            <h2 className="text-2xl md:text-3xl font-light text-white mb-3">
              Begin your journey
            </h2>
            <p className="text-sm text-white/60 mb-6">
              Choose the account that fits how you will use the academy.
            </p>

            <div className="space-y-4">
              <Link
                href="/signup?role=student"
                className="group block rounded-2xl border border-[#CEB466]/25 bg-[#CEB466]/10 p-5 transition-all duration-300 hover:border-[#CEB466]/60 hover:bg-[#CEB466]/15 hover:shadow-lg hover:shadow-[#CEB466]/10"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#CEB466]/20 border border-[#CEB466]/30 flex items-center justify-center text-[#CEB466] flex-shrink-0">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white group-hover:text-[#CEB466] transition-colors">
                      I&apos;m here to learn
                    </div>
                    <p className="text-sm text-white/60 mt-1 leading-relaxed">
                      Take lessons, access tools, and track your progress.
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                href="/signup?role=teacher"
                className="group block rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-all duration-300 hover:border-[#CEB466]/45 hover:bg-white/[0.07]"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white/75 group-hover:text-[#CEB466] transition-colors flex-shrink-0">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white group-hover:text-[#CEB466] transition-colors">
                      I&apos;m here to teach
                    </div>
                    <p className="text-sm text-white/60 mt-1 leading-relaxed">
                      Manage students, lessons, notes, and recordings.
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
