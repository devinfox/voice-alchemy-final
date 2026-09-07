'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pause, Play, X, Loader2 } from 'lucide-react'

type EnrollmentAction = 'pause' | 'resume' | 'cancel'

interface EnrollmentRowActionsProps {
  enrollmentId: string
  status: string
  studentName: string
}

/** Pause, resume, or remove one student from a funnel. */
export function EnrollmentRowActions({ enrollmentId, status, studentName }: EnrollmentRowActionsProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<EnrollmentAction | null>(null)

  const run = async (action: EnrollmentAction) => {
    if (action === 'cancel' && !confirm(`Remove ${studentName} from this funnel? They will not receive the remaining emails.`)) return
    setBusy(action)
    try {
      const response = await fetch(`/api/email-funnels/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) {
        const result = await response.json()
        alert(result.error || 'Could not update enrollment')
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error('Enrollment action failed:', err)
      alert('Could not update enrollment')
    } finally {
      setBusy(null)
    }
  }

  const iconFor = (action: EnrollmentAction, Icon: typeof Pause) =>
    busy === action ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />

  if (status !== 'active' && status !== 'paused') return null

  return (
    <div className="flex items-center justify-end gap-1">
      {status === 'active' && (
        <button
          onClick={() => run('pause')}
          disabled={busy !== null}
          title="Pause this student's sequence"
          className="p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all disabled:opacity-50"
        >
          {iconFor('pause', Pause)}
        </button>
      )}
      {status === 'paused' && (
        <button
          onClick={() => run('resume')}
          disabled={busy !== null}
          title="Resume this student's sequence"
          className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg transition-all disabled:opacity-50"
        >
          {iconFor('resume', Play)}
        </button>
      )}
      <button
        onClick={() => run('cancel')}
        disabled={busy !== null}
        title="Remove from funnel"
        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
      >
        {iconFor('cancel', X)}
      </button>
    </div>
  )
}
