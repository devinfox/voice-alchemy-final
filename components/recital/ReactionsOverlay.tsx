'use client'

import type { Reaction } from '@/lib/recital/use-recital-room'

/** Floating applause and flowers. Purely decorative; keyframes live in globals.css. */
export function ReactionsOverlay({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-30" aria-hidden="true">
      {reactions.map((r) => {
        const left = 8 + ((r.id * 37) % 84)
        return (
          <span
            key={r.id}
            className="absolute bottom-6 text-3xl sm:text-4xl recital-float drop-shadow-lg"
            style={{ left: `${left}%`, animationDelay: `${(r.id % 5) * 60}ms` }}
          >
            {r.emoji}
          </span>
        )
      })}
    </div>
  )
}
