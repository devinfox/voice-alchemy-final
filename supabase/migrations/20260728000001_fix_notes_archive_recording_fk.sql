-- ============================================================================
-- Fix: notes_archive.recording_id points at the wrong table
-- ============================================================================
-- notes_archive.recording_id has a FK to meeting_recordings (0 rows, unused).
-- All application code writes lesson_recordings.id into this column:
--   app/api/lessons/[relationshipId]/end-class/route.ts
--   app/api/lessons/[relationshipId]/recordings/complete/route.ts
-- Every one of those writes violates the constraint and is silently swallowed,
-- which is why all 73 notes_archive rows have recording_id IS NULL and
-- ai_summary IS NULL, and why generateLessonSummary() has never received the
-- handwritten class notes as context.
--
-- Safe to run: every existing row has recording_id IS NULL, so recreating the
-- constraint cannot fail on existing data.
-- ============================================================================

BEGIN;

-- Drop whatever FK currently exists on notes_archive.recording_id, by lookup
-- rather than by hardcoded name (the name was never recorded in this repo).
DO $$
DECLARE
    con_name text;
BEGIN
    SELECT con.conname INTO con_name
    FROM pg_constraint con
    JOIN pg_class rel        ON rel.oid = con.conrelid
    JOIN pg_namespace nsp    ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att    ON att.attrelid = rel.oid
                            AND att.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'notes_archive'
      AND att.attname = 'recording_id'
      AND con.contype = 'f';

    IF con_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.notes_archive DROP CONSTRAINT %I', con_name);
        RAISE NOTICE 'Dropped existing FK % on notes_archive.recording_id', con_name;
    ELSE
        RAISE NOTICE 'No existing FK found on notes_archive.recording_id';
    END IF;
END $$;

-- Repoint at the table the application actually writes.
-- ON DELETE SET NULL: deleting a recording must not delete the lesson notes.
ALTER TABLE public.notes_archive
    ADD CONSTRAINT notes_archive_recording_id_fkey
    FOREIGN KEY (recording_id)
    REFERENCES public.lesson_recordings (id)
    ON DELETE SET NULL;

-- Supports the per-recording note lookup in process-recording / cron.
CREATE INDEX IF NOT EXISTS idx_notes_archive_recording_id
    ON public.notes_archive (recording_id)
    WHERE recording_id IS NOT NULL;

-- Supports the booking_id + recency lookup used when auto-linking.
CREATE INDEX IF NOT EXISTS idx_notes_archive_booking_ended
    ON public.notes_archive (booking_id, class_ended_at DESC);

COMMIT;
