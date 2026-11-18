// Shown instantly while a dashboard page's data loads, so navigation never
// looks frozen. Shapes follow the design template (16px cards, 24px gaps).
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-3 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading">
      <div className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
    </div>
  )
}
