-- ============================================================================
-- Voice Alchemy Academy - Migration: Lesson session notes tables + note RLS
--
-- Fixes:
--   * The Start/End Class APIs read and write `session_notes` and
--     `session_note_history`, but no migration ever created them — on a
--     fresh database "Start Class" always failed with a 500.
--   * `notes_archive` UPDATE/DELETE used is_student_or_teacher(), letting
--     STUDENTS edit and delete the teacher's archived lesson notes. Writes
--     are now teacher/admin only; students keep read access.
-- ============================================================================

-- Helper: is the caller the teacher of this student (confirmed booking) or admin?
CREATE OR REPLACE FUNCTION is_teacher_of_student(student_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.student_id = student_uuid
            AND b.instructor_id = auth.uid()
            AND b.status = 'confirmed'
        )
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        );
$$;

-- Helper: is the caller a participant (instructor or student) of this booking?
CREATE OR REPLACE FUNCTION is_booking_participant(booking_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id = booking_uuid
            AND (b.instructor_id = auth.uid() OR b.student_id = auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        );
$$;

-- Helper: is the caller the instructor of this booking (or admin)?
CREATE OR REPLACE FUNCTION is_booking_instructor(booking_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id = booking_uuid
            AND b.instructor_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        );
$$;

-- ----------------------------------------------------------------------------
-- session_notes: one row per booking per week (the live class-session record)
-- Columns match exactly what start-class / end-class / notes routes use.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    week_end DATE,
    content TEXT DEFAULT '',
    content_html TEXT DEFAULT '',
    class_active BOOLEAN DEFAULT FALSE,
    class_started_at TIMESTAMPTZ,
    class_ended_at TIMESTAMPTZ,
    is_locked BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (booking_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_session_notes_booking_week
    ON session_notes (booking_id, week_start DESC);

CREATE TABLE IF NOT EXISTS session_note_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_note_id UUID NOT NULL REFERENCES session_notes(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    content_html TEXT DEFAULT '',
    archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_note_history_note
    ON session_note_history (session_note_id, created_at DESC);

ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_note_history ENABLE ROW LEVEL SECURITY;

-- Both lesson parties can read; only the instructor (or admin) writes.
DROP POLICY IF EXISTS session_notes_select ON session_notes;
CREATE POLICY session_notes_select ON session_notes FOR SELECT
USING (is_booking_participant(booking_id));

DROP POLICY IF EXISTS session_notes_insert ON session_notes;
CREATE POLICY session_notes_insert ON session_notes FOR INSERT
WITH CHECK (is_booking_instructor(booking_id));

DROP POLICY IF EXISTS session_notes_update ON session_notes;
CREATE POLICY session_notes_update ON session_notes FOR UPDATE
USING (is_booking_instructor(booking_id))
WITH CHECK (is_booking_instructor(booking_id));

DROP POLICY IF EXISTS session_notes_delete ON session_notes;
CREATE POLICY session_notes_delete ON session_notes FOR DELETE
USING (is_booking_instructor(booking_id));

DROP POLICY IF EXISTS session_note_history_select ON session_note_history;
CREATE POLICY session_note_history_select ON session_note_history FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM session_notes sn
        WHERE sn.id = session_note_id AND is_booking_participant(sn.booking_id)
    )
);

DROP POLICY IF EXISTS session_note_history_insert ON session_note_history;
CREATE POLICY session_note_history_insert ON session_note_history FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM session_notes sn
        WHERE sn.id = session_note_id AND is_booking_instructor(sn.booking_id)
    )
);

DROP TRIGGER IF EXISTS update_session_notes_updated_at ON session_notes;
CREATE TRIGGER update_session_notes_updated_at
    BEFORE UPDATE ON session_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- notes_archive: students keep read access; writes become teacher/admin only
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS notes_archive_insert ON notes_archive;
CREATE POLICY notes_archive_insert ON notes_archive FOR INSERT
WITH CHECK (is_teacher_of_student(student_id));

DROP POLICY IF EXISTS notes_archive_update ON notes_archive;
CREATE POLICY notes_archive_update ON notes_archive FOR UPDATE
USING (is_teacher_of_student(student_id))
WITH CHECK (is_teacher_of_student(student_id));

DROP POLICY IF EXISTS notes_archive_delete ON notes_archive;
CREATE POLICY notes_archive_delete ON notes_archive FOR DELETE
USING (is_teacher_of_student(student_id));
