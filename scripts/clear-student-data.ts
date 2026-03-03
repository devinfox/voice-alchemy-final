/**
 * Clear all session data for a specific student
 * Usage: npx tsx scripts/clear-student-data.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clearStudentData(studentName: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Clearing all session data for student: "${studentName}"`)
  console.log(`${'='.repeat(60)}\n`)

  // 1. Find the student by name
  const { data: students, error: studentError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, name')
    .or(`name.ilike.%${studentName}%,first_name.ilike.%${studentName}%`)

  const student = students?.[0]

  if (studentError || !student) {
    console.error('Student not found:', studentError?.message || 'No matching student')

    // List all students to help find the right one
    const { data: allStudents } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name, role')
      .eq('role', 'student')
      .limit(20)

    console.log('\nAvailable students:')
    allStudents?.forEach(s => console.log(`  - ${s.name || `${s.first_name} ${s.last_name}`} (ID: ${s.id})`))
    return
  }

  const displayName = student.name || `${student.first_name} ${student.last_name}`
  console.log(`Found student: ${displayName}`)
  console.log(`Student ID: ${student.id}\n`)

  // 2. Get recordings to delete from storage
  const { data: recordings } = await supabase
    .from('lesson_recordings')
    .select('id, storage_path')
    .eq('student_id', student.id)

  console.log(`Found ${recordings?.length || 0} recordings to delete`)

  // 3. Delete recording files from storage
  if (recordings && recordings.length > 0) {
    const storagePaths = recordings
      .filter(r => r.storage_path)
      .map(r => r.storage_path)

    if (storagePaths.length > 0) {
      console.log('Deleting recording files from storage...')
      const { error: storageError } = await supabase.storage
        .from('lesson-recordings')
        .remove(storagePaths)

      if (storageError) {
        console.warn('Storage deletion warning:', storageError.message)
      } else {
        console.log(`  ✓ Deleted ${storagePaths.length} files from storage`)
      }
    }
  }

  // 4. Delete from lesson_recordings table
  const { error: recordingsError, count: recordingsCount } = await supabase
    .from('lesson_recordings')
    .delete()
    .eq('student_id', student.id)

  if (recordingsError) {
    console.error('Error deleting lesson_recordings:', recordingsError.message)
  } else {
    console.log(`  ✓ Deleted lesson_recordings`)
  }

  // 5. Delete from notes_archive table
  const { error: notesError, count: notesCount } = await supabase
    .from('notes_archive')
    .delete()
    .eq('student_id', student.id)

  if (notesError) {
    console.error('Error deleting notes_archive:', notesError.message)
  } else {
    console.log(`  ✓ Deleted notes_archive`)
  }

  // 6. Delete from class_sessions table
  const { error: sessionsError } = await supabase
    .from('class_sessions')
    .delete()
    .eq('student_id', student.id)

  if (sessionsError) {
    console.error('Error deleting class_sessions:', sessionsError.message)
  } else {
    console.log(`  ✓ Deleted class_sessions`)
  }

  // 7. Delete from session_notes table (if exists)
  const { error: sessionNotesError } = await supabase
    .from('session_notes')
    .delete()
    .eq('student_id', student.id)

  if (sessionNotesError && !sessionNotesError.message.includes('does not exist')) {
    console.error('Error deleting session_notes:', sessionNotesError.message)
  } else if (!sessionNotesError) {
    console.log(`  ✓ Deleted session_notes`)
  }

  // 8. Delete from yjs_documents table (collaborative notes state)
  const { error: yjsError } = await supabase
    .from('yjs_documents')
    .delete()
    .eq('document_id', student.id)

  if (yjsError && !yjsError.message.includes('does not exist')) {
    console.error('Error deleting yjs_documents:', yjsError.message)
  } else if (!yjsError) {
    console.log(`  ✓ Deleted yjs_documents (collaborative state)`)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ Successfully cleared all session data for "${displayName}"`)
  console.log(`${'='.repeat(60)}\n`)
}

// Run the script
clearStudentData('devin test')
