-- ============================================================================
-- Voice Alchemy Academy - SAFE Migration
-- Migration 00009: AI Lesson Summaries (NON-DESTRUCTIVE)
-- ============================================================================

-- Create lesson_recordings table if it doesn't exist (used by the recordings API)
CREATE TABLE IF NOT EXISTS lesson_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    student_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    recording_id TEXT,
    room_name TEXT,
    status TEXT DEFAULT 'pending',
    upload_status TEXT DEFAULT 'pending',
    storage_provider TEXT DEFAULT 'supabase',
    storage_path TEXT,
    storage_url TEXT,
    file_size_bytes BIGINT,
    format TEXT DEFAULT 'webm',
    duration_seconds INTEGER,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    -- AI processing columns
    transcript TEXT,
    ai_summary JSONB,
    ai_processing_status TEXT DEFAULT 'pending',
    ai_processed_at TIMESTAMPTZ,
    ai_processing_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for lesson_recordings
CREATE INDEX IF NOT EXISTS idx_lesson_recordings_booking ON lesson_recordings(booking_id);
CREATE INDEX IF NOT EXISTS idx_lesson_recordings_student ON lesson_recordings(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_recordings_ai_status ON lesson_recordings(ai_processing_status);

-- Enable RLS on lesson_recordings
ALTER TABLE lesson_recordings ENABLE ROW LEVEL SECURITY;

-- RLS policies for lesson_recordings
DROP POLICY IF EXISTS lesson_recordings_select ON lesson_recordings;
DROP POLICY IF EXISTS lesson_recordings_insert ON lesson_recordings;
DROP POLICY IF EXISTS lesson_recordings_update ON lesson_recordings;

CREATE POLICY lesson_recordings_select ON lesson_recordings FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND b.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY lesson_recordings_insert ON lesson_recordings FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND b.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY lesson_recordings_update ON lesson_recordings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND b.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Also add AI columns to meeting_recordings if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_recordings') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meeting_recordings' AND column_name = 'transcript') THEN
            ALTER TABLE meeting_recordings ADD COLUMN transcript TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meeting_recordings' AND column_name = 'ai_summary') THEN
            ALTER TABLE meeting_recordings ADD COLUMN ai_summary JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meeting_recordings' AND column_name = 'ai_processing_status') THEN
            ALTER TABLE meeting_recordings ADD COLUMN ai_processing_status TEXT DEFAULT 'pending';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meeting_recordings' AND column_name = 'ai_processed_at') THEN
            ALTER TABLE meeting_recordings ADD COLUMN ai_processed_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meeting_recordings' AND column_name = 'ai_processing_error') THEN
            ALTER TABLE meeting_recordings ADD COLUMN ai_processing_error TEXT;
        END IF;
    END IF;
END $$;

-- Add AI summary to notes_archive
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes_archive' AND column_name = 'ai_summary') THEN
        ALTER TABLE notes_archive ADD COLUMN ai_summary JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes_archive' AND column_name = 'recording_id') THEN
        ALTER TABLE notes_archive ADD COLUMN recording_id UUID;
    END IF;
END $$;

-- Create index for notes_archive
CREATE INDEX IF NOT EXISTS idx_notes_archive_recording ON notes_archive(recording_id);

-- Trigger for lesson_recordings updated_at
DROP TRIGGER IF EXISTS update_lesson_recordings_updated_at ON lesson_recordings;
CREATE TRIGGER update_lesson_recordings_updated_at
    BEFORE UPDATE ON lesson_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE lesson_recordings IS 'Stores lesson video/audio recordings with AI transcription and summaries';
COMMENT ON COLUMN lesson_recordings.transcript IS 'Whisper transcription of the lesson audio';
COMMENT ON COLUMN lesson_recordings.ai_summary IS 'AI-generated lesson summary JSON with topics, exercises, feedback, etc.';
COMMENT ON COLUMN lesson_recordings.ai_processing_status IS 'Status of AI processing: pending, processing, completed, failed';
COMMENT ON COLUMN notes_archive.ai_summary IS 'AI-generated summary combining transcript and human notes';
COMMENT ON COLUMN notes_archive.recording_id IS 'Link to the lesson recording for this class session';
