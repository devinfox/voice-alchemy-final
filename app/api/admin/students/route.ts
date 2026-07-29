import { NextResponse } from 'next/server'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

// ============================================================================
// GET /api/admin/students - full student directory for the admin CRM view
// ============================================================================
// Admin only. Email lives in auth.users, not profiles, so it can only be read
// with the service role key - which is exactly why this is a server route and
// never a client-side query.
// ============================================================================

export interface AdminStudentRow {
  id: string
  firstName: string | null
  lastName: string | null
  displayName: string
  email: string | null
  phone: string | null
  role: string | null
  timezone: string | null
  joinedAt: string | null
  lastSignInAt: string | null
  emailConfirmed: boolean
  /** Confirmed teacher relationships. */
  activeTeachers: number
  pendingRequests: number
  teacherNames: string[]
  lessonsRecorded: number
  notesCount: number
  trainingSessions: number
  lastActivityAt: string | null
  hasProfile: boolean
}

export async function GET() {
  try {
    const profile = await getCurrentUser()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Confirm the session is real rather than trusting the profile lookup alone.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== profile.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdmin()

    // --- auth.users: the only source of email --------------------------------
    // listUsers is paginated; walk it so the directory is not silently truncated.
    const authUsers: Array<{
      id: string
      email: string | null
      phone: string | null
      created_at: string
      last_sign_in_at: string | null
      email_confirmed_at: string | null
    }> = []

    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) {
        console.error('[AdminStudents] listUsers failed:', error.message)
        break
      }
      authUsers.push(
        ...data.users.map(u => ({
          id: u.id,
          email: u.email ?? null,
          phone: u.phone ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
        }))
      )
      if (data.users.length < 200) break
    }

    const authById = new Map(authUsers.map(u => [u.id, u]))

    // --- profiles ------------------------------------------------------------
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, first_name, last_name, name, role, timezone, created_at')
      .order('created_at', { ascending: false })

    if (profilesError) {
      console.error('[AdminStudents] profiles query failed:', profilesError.message)
      return NextResponse.json({ error: 'Failed to load students' }, { status: 500 })
    }

    // phone / admin_notes only exist after migration 20260728000003. Query them
    // separately so the directory still renders if it has not been applied yet.
    let contactById = new Map<string, { phone: string | null; admin_notes: string | null }>()
    const { data: contactRows, error: contactError } = await admin
      .from('profiles')
      .select('id, phone, admin_notes')
    if (!contactError && contactRows) {
      contactById = new Map(
        contactRows.map(r => [r.id, { phone: r.phone ?? null, admin_notes: r.admin_notes ?? null }])
      )
    }

    // --- relationships and activity -----------------------------------------
    const { data: bookings } = await admin
      .from('bookings')
      .select('id, student_id, instructor_id, status')

    const { data: recordings } = await admin
      .from('lesson_recordings')
      .select('student_id, created_at')

    const { data: notes } = await admin
      .from('notes_archive')
      .select('student_id, class_ended_at')

    const { data: pitchSessions } = await admin
      .from('pitch_training_sessions')
      .select('user_id, created_at')

    const { data: rhythmSessions } = await admin
      .from('rhythm_training_sessions')
      .select('user_id, created_at')

    const { data: scaleSessions } = await admin
      .from('scale_training_sessions')
      .select('user_id, created_at')

    const nameById = new Map(
      (profiles || []).map(p => [
        p.id,
        p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown',
      ])
    )

    // Aggregate per student, tracking the most recent activity of any kind.
    const agg = new Map<string, {
      activeTeachers: number
      pendingRequests: number
      teacherNames: string[]
      lessonsRecorded: number
      notesCount: number
      trainingSessions: number
      lastActivityAt: string | null
    }>()

    const ensure = (id: string) => {
      let row = agg.get(id)
      if (!row) {
        row = {
          activeTeachers: 0,
          pendingRequests: 0,
          teacherNames: [],
          lessonsRecorded: 0,
          notesCount: 0,
          trainingSessions: 0,
          lastActivityAt: null,
        }
        agg.set(id, row)
      }
      return row
    }

    const touch = (id: string, when: string | null | undefined) => {
      if (!when) return
      const row = ensure(id)
      if (!row.lastActivityAt || when > row.lastActivityAt) row.lastActivityAt = when
    }

    for (const b of bookings || []) {
      if (!b.student_id) continue
      const row = ensure(b.student_id)
      if (b.status === 'confirmed') {
        row.activeTeachers++
        const teacherName = nameById.get(b.instructor_id)
        if (teacherName && !row.teacherNames.includes(teacherName)) row.teacherNames.push(teacherName)
      } else if (b.status === 'pending') {
        row.pendingRequests++
      }
    }

    for (const r of recordings || []) {
      if (!r.student_id) continue
      ensure(r.student_id).lessonsRecorded++
      touch(r.student_id, r.created_at)
    }

    for (const n of notes || []) {
      if (!n.student_id) continue
      ensure(n.student_id).notesCount++
      touch(n.student_id, n.class_ended_at)
    }

    for (const list of [pitchSessions, rhythmSessions, scaleSessions]) {
      for (const s of list || []) {
        if (!s.user_id) continue
        ensure(s.user_id).trainingSessions++
        touch(s.user_id, s.created_at)
      }
    }

    const students: AdminStudentRow[] = (profiles || []).map(p => {
      const auth = authById.get(p.id)
      const contact = contactById.get(p.id)
      const a = agg.get(p.id)
      const displayName =
        p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || auth?.email || 'Unknown'

      return {
        id: p.id,
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        displayName,
        email: auth?.email ?? null,
        // profiles.phone is authoritative; auth.users.phone is a fallback and is
        // currently null for every account since signup never collects one.
        phone: contact?.phone ?? auth?.phone ?? null,
        role: p.role ?? null,
        timezone: p.timezone ?? null,
        joinedAt: p.created_at ?? auth?.created_at ?? null,
        lastSignInAt: auth?.last_sign_in_at ?? null,
        emailConfirmed: !!auth?.email_confirmed_at,
        activeTeachers: a?.activeTeachers ?? 0,
        pendingRequests: a?.pendingRequests ?? 0,
        teacherNames: a?.teacherNames ?? [],
        lessonsRecorded: a?.lessonsRecorded ?? 0,
        notesCount: a?.notesCount ?? 0,
        trainingSessions: a?.trainingSessions ?? 0,
        lastActivityAt: a?.lastActivityAt ?? null,
        hasProfile: true,
      }
    })

    // Accounts that signed up but never loaded a page that creates a profile
    // row. They are invisible everywhere else in the app, so surface them here.
    const profileIds = new Set((profiles || []).map(p => p.id))
    const orphaned: AdminStudentRow[] = authUsers
      .filter(u => !profileIds.has(u.id))
      .map(u => ({
        id: u.id,
        firstName: null,
        lastName: null,
        displayName: u.email ?? 'Unknown',
        email: u.email,
        phone: u.phone,
        role: null,
        timezone: null,
        joinedAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        emailConfirmed: !!u.email_confirmed_at,
        activeTeachers: 0,
        pendingRequests: 0,
        teacherNames: [],
        lessonsRecorded: 0,
        notesCount: 0,
        trainingSessions: 0,
        lastActivityAt: null,
        hasProfile: false,
      }))

    const all = [...students, ...orphaned]

    return NextResponse.json({
      students: all,
      summary: {
        total: all.length,
        withProfile: students.length,
        withoutProfile: orphaned.length,
        byRole: students.reduce<Record<string, number>>((acc, s) => {
          const key = s.role ?? 'unset'
          acc[key] = (acc[key] || 0) + 1
          return acc
        }, {}),
        neverSignedIn: all.filter(s => !s.lastSignInAt).length,
        withPhone: all.filter(s => s.phone).length,
      },
    })
  } catch (error) {
    console.error('[AdminStudents] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
