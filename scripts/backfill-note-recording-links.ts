/**
 * Backfill notes_archive.recording_id.
 *
 * Why this is needed: notes_archive.recording_id carried a foreign key to
 * meeting_recordings (an empty, unused table) while every code path wrote
 * lesson_recordings ids into it. Each write violated the constraint and the
 * error was swallowed, so all 73 archived classes ended up with recording_id
 * NULL and ai_summary NULL, and lesson summaries never received the handwritten
 * class notes as context.
 *
 * Run AFTER applying:
 *   supabase/migrations/20260728000001_fix_notes_archive_recording_fk.sql
 *
 * This links notes to recordings only. It deliberately does NOT re-run AI:
 * most existing recordings transcribed to near-silence, so regenerating would
 * burn OpenAI spend to produce the same fabricated summaries. Once the audio
 * capture issue is fixed, /api/admin/process-all-recordings can reprocess.
 *
 * Usage:
 *   npx tsx scripts/backfill-note-recording-links.ts           # dry run
 *   npx tsx scripts/backfill-note-recording-links.ts --apply   # write changes
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(supabaseUrl, serviceKey)
const APPLY = process.argv.includes('--apply')

/**
 * A recording belongs to a note when they share a booking and their class
 * windows overlap. Recording timestamps come from the browser at upload time
 * and notes are stamped server-side at end-class, so they can differ by a few
 * minutes; the tolerance absorbs that without matching across sessions.
 */
const MATCH_TOLERANCE_MS = 4 * 60 * 60 * 1000 // 4 hours

interface NoteRow {
  id: string
  booking_id: string | null
  student_id: string | null
  class_started_at: string | null
  class_ended_at: string | null
  recording_id: string | null
}

interface RecordingRow {
  id: string
  booking_id: string | null
  student_id: string | null
  started_at: string | null
  created_at: string | null
}

async function main() {
  console.log(APPLY ? '=== BACKFILL (APPLYING CHANGES) ===' : '=== BACKFILL (DRY RUN) ===')
  console.log('')

  // Verify the FK migration landed before writing anything, otherwise every
  // update fails exactly the way it did originally.
  if (APPLY) {
    const { data: probe } = await db.from('meeting_recordings').select('id').limit(1)
    if (probe !== null) {
      console.log('Note: meeting_recordings still exists. That is fine as long as')
      console.log('migration 20260728000001 has been applied to repoint the FK.')
      console.log('')
    }
  }

  const { data: notes, error: notesError } = await db
    .from('notes_archive')
    .select('id, booking_id, student_id, class_started_at, class_ended_at, recording_id')
    .is('recording_id', null)
    .order('class_ended_at', { ascending: false })

  if (notesError) {
    console.error('Failed to read notes_archive:', notesError.message)
    process.exit(1)
  }

  const { data: recordings, error: recError } = await db
    .from('lesson_recordings')
    .select('id, booking_id, student_id, started_at, created_at')
    .order('created_at', { ascending: false })

  if (recError) {
    console.error('Failed to read lesson_recordings:', recError.message)
    process.exit(1)
  }

  const noteRows = (notes ?? []) as NoteRow[]
  const recRows = (recordings ?? []) as RecordingRow[]

  console.log(`Unlinked notes: ${noteRows.length}`)
  console.log(`Available recordings: ${recRows.length}`)
  console.log('')

  // A recording links to at most one note.
  const claimed = new Set<string>()
  const plan: Array<{ noteId: string; recordingId: string; gapMinutes: number; basis: string }> = []
  let noBooking = 0
  let noCandidate = 0

  for (const note of noteRows) {
    if (!note.booking_id) {
      noBooking++
      continue
    }

    const noteTime = note.class_ended_at
      ? new Date(note.class_ended_at).getTime()
      : note.class_started_at
        ? new Date(note.class_started_at).getTime()
        : null

    if (noteTime === null) {
      noCandidate++
      continue
    }

    // Prefer booking match; fall back to student match for notes whose booking
    // row was recreated at some point.
    let candidates = recRows.filter(r => !claimed.has(r.id) && r.booking_id === note.booking_id)
    let basis = 'booking'

    if (candidates.length === 0 && note.student_id) {
      candidates = recRows.filter(r => !claimed.has(r.id) && r.student_id === note.student_id)
      basis = 'student'
    }

    if (candidates.length === 0) {
      noCandidate++
      continue
    }

    let best: { rec: RecordingRow; gap: number } | null = null
    for (const rec of candidates) {
      const recTime = rec.started_at
        ? new Date(rec.started_at).getTime()
        : rec.created_at
          ? new Date(rec.created_at).getTime()
          : null
      if (recTime === null) continue

      const gap = Math.abs(recTime - noteTime)
      if (gap <= MATCH_TOLERANCE_MS && (!best || gap < best.gap)) {
        best = { rec, gap }
      }
    }

    if (!best) {
      noCandidate++
      continue
    }

    claimed.add(best.rec.id)
    plan.push({
      noteId: note.id,
      recordingId: best.rec.id,
      gapMinutes: Math.round(best.gap / 60000),
      basis,
    })
  }

  console.log('=== MATCH PLAN ===')
  if (plan.length === 0) {
    console.log('  No links to create.')
  } else {
    for (const p of plan) {
      console.log(
        `  note ${p.noteId.slice(0, 8)} -> recording ${p.recordingId.slice(0, 8)} ` +
        `(${p.basis} match, ${p.gapMinutes}min apart)`
      )
    }
  }

  console.log('')
  console.log('=== SUMMARY ===')
  console.log(`  will link:              ${plan.length}`)
  console.log(`  no booking_id on note:  ${noBooking}`)
  console.log(`  no matching recording:  ${noCandidate}`)
  console.log(`  recordings left over:   ${recRows.length - claimed.size}`)

  if (!APPLY) {
    console.log('')
    console.log('Dry run only. Re-run with --apply to write these links.')
    return
  }

  console.log('')
  console.log('=== APPLYING ===')
  let ok = 0
  let failed = 0

  for (const p of plan) {
    const { error } = await db
      .from('notes_archive')
      .update({ recording_id: p.recordingId })
      .eq('id', p.noteId)
      .is('recording_id', null) // do not clobber a link created since the scan

    if (error) {
      failed++
      console.error(`  FAILED note ${p.noteId.slice(0, 8)}: ${error.code} ${error.message}`)
      if (error.code === '23503') {
        console.error('    ^ foreign key violation - migration 20260728000001 has not been applied')
        break
      }
    } else {
      ok++
    }
  }

  console.log('')
  console.log(`Linked ${ok} note(s), ${failed} failure(s).`)
  if (ok > 0) {
    console.log('Future lesson summaries for these students will now include the')
    console.log('handwritten class notes as context.')
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
