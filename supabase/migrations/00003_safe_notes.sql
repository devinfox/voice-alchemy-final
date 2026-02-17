-- ============================================================================
-- Voice Alchemy Academy - SAFE Migration
-- Migration 00003: Notes tables (NON-DESTRUCTIVE)
-- ============================================================================

-- Helper function (safe - CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION is_student_or_teacher(student_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        auth.uid() = student_uuid
        OR EXISTS (
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

-- Create lesson_current_notes if not exists
CREATE TABLE IF NOT EXISTS lesson_current_notes (
    student_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    content_html TEXT DEFAULT '',
    yjs_state BYTEA,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notes_archive if not exists
CREATE TABLE IF NOT EXISTS notes_archive (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    content_html TEXT DEFAULT '',
    class_started_at TIMESTAMPTZ NOT NULL,
    class_ended_at TIMESTAMPTZ NOT NULL,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create class_sessions if not exists
CREATE TABLE IF NOT EXISTS class_sessions (
    student_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notes_revisions if not exists
CREATE TABLE IF NOT EXISTS notes_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    archive_id UUID NOT NULL REFERENCES notes_archive(id) ON DELETE CASCADE,
    previous_content TEXT NOT NULL,
    new_content TEXT NOT NULL,
    edited_by UUID REFERENCES profiles(id),
    edited_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_current_notes' AND column_name = 'content_html') THEN
        ALTER TABLE lesson_current_notes ADD COLUMN content_html TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_current_notes' AND column_name = 'yjs_state') THEN
        ALTER TABLE lesson_current_notes ADD COLUMN yjs_state BYTEA;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes_archive' AND column_name = 'content_html') THEN
        ALTER TABLE notes_archive ADD COLUMN content_html TEXT DEFAULT '';
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_lesson_current_notes_student ON lesson_current_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_archive_student ON notes_archive(student_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_student ON class_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_revisions_archive ON notes_revisions(archive_id);

-- Enable RLS
ALTER TABLE lesson_current_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_revisions ENABLE ROW LEVEL SECURITY;

-- Safe policy updates for lesson_current_notes
DROP POLICY IF EXISTS lesson_current_notes_select ON lesson_current_notes;
DROP POLICY IF EXISTS lesson_current_notes_insert ON lesson_current_notes;
DROP POLICY IF EXISTS lesson_current_notes_update ON lesson_current_notes;
DROP POLICY IF EXISTS lesson_current_notes_delete ON lesson_current_notes;

CREATE POLICY lesson_current_notes_select ON lesson_current_notes FOR SELECT USING (is_student_or_teacher(student_id));
CREATE POLICY lesson_current_notes_insert ON lesson_current_notes FOR INSERT WITH CHECK (is_student_or_teacher(student_id));
CREATE POLICY lesson_current_notes_update ON lesson_current_notes FOR UPDATE USING (is_student_or_teacher(student_id));
CREATE POLICY lesson_current_notes_delete ON lesson_current_notes FOR DELETE USING (is_student_or_teacher(student_id));

-- Safe policy updates for notes_archive
DROP POLICY IF EXISTS notes_archive_select ON notes_archive;
DROP POLICY IF EXISTS notes_archive_insert ON notes_archive;
DROP POLICY IF EXISTS notes_archive_update ON notes_archive;
DROP POLICY IF EXISTS notes_archive_delete ON notes_archive;

CREATE POLICY notes_archive_select ON notes_archive FOR SELECT USING (is_student_or_teacher(student_id));
CREATE POLICY notes_archive_insert ON notes_archive FOR INSERT WITH CHECK (is_student_or_teacher(student_id));
CREATE POLICY notes_archive_update ON notes_archive FOR UPDATE USING (is_student_or_teacher(student_id));
CREATE POLICY notes_archive_delete ON notes_archive FOR DELETE USING (is_student_or_teacher(student_id));

-- Safe policy updates for class_sessions
DROP POLICY IF EXISTS class_sessions_select ON class_sessions;
DROP POLICY IF EXISTS class_sessions_insert ON class_sessions;
DROP POLICY IF EXISTS class_sessions_update ON class_sessions;
DROP POLICY IF EXISTS class_sessions_delete ON class_sessions;

CREATE POLICY class_sessions_select ON class_sessions FOR SELECT USING (is_student_or_teacher(student_id));
CREATE POLICY class_sessions_insert ON class_sessions FOR INSERT WITH CHECK (is_student_or_teacher(student_id));
CREATE POLICY class_sessions_update ON class_sessions FOR UPDATE USING (is_student_or_teacher(student_id));
CREATE POLICY class_sessions_delete ON class_sessions FOR DELETE USING (is_student_or_teacher(student_id));

-- Safe policy updates for notes_revisions
DROP POLICY IF EXISTS notes_revisions_select ON notes_revisions;
DROP POLICY IF EXISTS notes_revisions_insert ON notes_revisions;

CREATE POLICY notes_revisions_select ON notes_revisions FOR SELECT USING (
    EXISTS (SELECT 1 FROM notes_archive na WHERE na.id = archive_id AND is_student_or_teacher(na.student_id))
);
CREATE POLICY notes_revisions_insert ON notes_revisions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM notes_archive na WHERE na.id = archive_id AND is_student_or_teacher(na.student_id))
);

-- Enable realtime (safe - ignores if already added)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE lesson_current_notes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE class_sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
