import type { Metadata } from 'next'
import { NOINDEX } from '@/lib/seo'
import { RecitalRoom } from '@/components/recital/RecitalRoom'

export const metadata: Metadata = { title: 'Recital', robots: NOINDEX }
export const dynamic = 'force-dynamic'

/**
 * Public recital entrance. Guests join with a name; logged-in students and
 * the host are recognised automatically. Lives outside the dashboard layout
 * so the stage can use the whole viewport.
 */
export default async function RecitalPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <div
      className="min-h-screen w-full relative"
      style={{
        background: 'linear-gradient(135deg, #0f0b1e 0%, #171229 25%, #1f1839 50%, #171229 75%, #0f0b1e 100%)',
      }}
    >
      <div
        className="fixed inset-0 pointer-events-none opacity-30 z-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 20%, rgba(206, 180, 102, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(206, 180, 102, 0.05) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(31, 24, 57, 0.5) 0%, transparent 70%)
          `,
        }}
      />
      <div className="relative z-10">
        <RecitalRoom code={code} />
      </div>
    </div>
  )
}
