import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

interface Contact {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  avatar_url: string | null
  role: string | null
}

// GET /api/chat/contacts - Get chat contacts organized by role
export async function GET() {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUser()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isTeacher = profile.role === 'teacher' || profile.role === 'instructor' || profile.role === 'admin'

    // Fetch all profiles
    const { data: allProfiles, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name, avatar_url, role')
      .neq('id', profile.id) // Exclude current user
      .order('first_name')

    if (error) {
      console.error('[Chat Contacts API] Error fetching profiles:', error)
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
    }

    // Categorize contacts
    const teachers: Contact[] = []
    const students: Contact[] = []

    allProfiles?.forEach((p) => {
      const contact: Contact = {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        name: p.name,
        avatar_url: p.avatar_url,
        role: p.role,
      }

      if (p.role === 'teacher' || p.role === 'instructor' || p.role === 'admin') {
        teachers.push(contact)
      } else {
        students.push(contact)
      }
    })

    // For students: only show teachers
    // For teachers: show both teachers and students
    if (isTeacher) {
      return NextResponse.json({
        teachers,
        students,
        isTeacher: true,
      })
    } else {
      return NextResponse.json({
        teachers,
        students: [], // Students can only see teachers
        isTeacher: false,
      })
    }
  } catch (error) {
    console.error('[Chat Contacts API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
