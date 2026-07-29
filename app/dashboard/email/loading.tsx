/**
 * Inbox skeleton. Mirrors the thread-list layout so the switch to real content
 * doesn't shift anything, and covers the nested email routes (threads, sent,
 * drafts, starred, …) that don't define their own.
 */
export default function EmailLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading mailbox…</span>

      {/* Header — desktop only, matching the real inbox header */}
      <div className="hidden md:block px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-32 rounded-md bg-white/10 animate-pulse" />
            <div className="h-3.5 w-48 rounded bg-white/5 animate-pulse" />
          </div>
          <div className="flex-1 max-w-md h-9 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-3.5 w-28 rounded bg-white/5 animate-pulse" />
        </div>
      </div>

      {/* Search bar — mobile */}
      <div className="md:hidden px-4 py-3 border-b border-white/10">
        <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
      </div>

      {/* Thread rows */}
      <div className="flex-1 overflow-hidden divide-y divide-white/5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 md:px-6 py-3.5">
            <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className="h-3.5 rounded bg-white/10 animate-pulse"
                  style={{ width: `${28 + ((i * 7) % 22)}%` }}
                />
                <div className="ml-auto h-3 w-12 rounded bg-white/5 animate-pulse" />
              </div>
              <div
                className="h-3.5 rounded bg-white/[0.07] animate-pulse"
                style={{ width: `${45 + ((i * 11) % 35)}%` }}
              />
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
