// Email notifications for the lesson request/approval loop.
// These close the funnel's biggest gap: previously a join request or an
// approval wrote a row and told no one. All sends are best-effort — a
// notification failure never fails the underlying action.

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/sendgrid'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getUserEmail(userId: string): Promise<string | null> {
  const admin = getAdminClient()
  if (!admin) return null
  const { data } = await admin.from('users').select('email').eq('id', userId).maybeSingle()
  return data?.email ?? null
}

/** Tell the teacher a student has requested lessons. */
export async function notifyLessonRequest(teacherId: string, studentName: string): Promise<void> {
  try {
    if (!FROM_EMAIL) return
    const teacherEmail = await getUserEmail(teacherId)
    if (!teacherEmail) return
    await sendEmail({
      to: [{ email: teacherEmail }],
      from: { email: FROM_EMAIL, name: 'Voice Alchemy Academy' },
      subject: `${studentName} requested lessons with you`,
      text: `${studentName} just requested to join your lessons on Voice Alchemy Academy.\n\nReview and approve the request here: ${APP_URL}/dashboard/students/requests\n\n— Voice Alchemy Academy`,
      html: `<p><strong>${studentName}</strong> just requested to join your lessons on Voice Alchemy Academy.</p><p><a href="${APP_URL}/dashboard/students/requests">Review and approve the request</a></p><p>— Voice Alchemy Academy</p>`,
    })
  } catch (err) {
    console.error('[Lesson Notifications] Failed to send request notification:', err)
  }
}

/** Tell the student their request was approved. */
export async function notifyLessonApproval(studentId: string, teacherName: string): Promise<void> {
  try {
    if (!FROM_EMAIL) return
    const studentEmail = await getUserEmail(studentId)
    if (!studentEmail) return
    await sendEmail({
      to: [{ email: studentEmail }],
      from: { email: FROM_EMAIL, name: 'Voice Alchemy Academy' },
      subject: `${teacherName} accepted your lesson request 🎉`,
      text: `Great news — ${teacherName} accepted your lesson request on Voice Alchemy Academy.\n\nHead to My Lessons to see your coach and get ready for your first session: ${APP_URL}/dashboard/my-lessons\n\n— Voice Alchemy Academy`,
      html: `<p>Great news — <strong>${teacherName}</strong> accepted your lesson request on Voice Alchemy Academy.</p><p><a href="${APP_URL}/dashboard/my-lessons">Go to My Lessons</a> to see your coach and get ready for your first session.</p><p>— Voice Alchemy Academy</p>`,
    })
  } catch (err) {
    console.error('[Lesson Notifications] Failed to send approval notification:', err)
  }
}
