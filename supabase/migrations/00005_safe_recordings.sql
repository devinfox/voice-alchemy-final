-- ============================================================================
-- Voice Alchemy Academy - SAFE Migration
-- Migration 00005: Recordings table (NON-DESTRUCTIVE)
-- ============================================================================

-- Create meeting_recordings table ONLY if it doesn't exist
CREATE TABLE IF NOT EXISTS meeting_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    room_name TEXT,
    storage_type TEXT DEFAULT 'supabase',
    storage_path TEXT,
    storage_url TEXT,
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    mime_type TEXT DEFAULT 'video/webm',
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_recordings_booking ON meeting_recordings(booking_id);
CREATE INDEX IF NOT EXISTS idx_recordings_room ON meeting_recordings(room_name);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON meeting_recordings(status);

-- Enable RLS
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;

-- Helper function for recording access
CREATE OR REPLACE FUNCTION can_access_recording(rec_booking_id UUID, rec_room_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id = rec_booking_id
            AND (b.student_id = auth.uid() OR b.instructor_id = auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
        )
        OR EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id::text = rec_room_name
            AND (b.student_id = auth.uid() OR b.instructor_id = auth.uid())
        );
$$;

-- Safe policy updates
DROP POLICY IF EXISTS recordings_select ON meeting_recordings;
DROP POLICY IF EXISTS recordings_insert ON meeting_recordings;
DROP POLICY IF EXISTS recordings_update ON meeting_recordings;
DROP POLICY IF EXISTS recordings_delete ON meeting_recordings;

CREATE POLICY recordings_select ON meeting_recordings FOR SELECT USING (can_access_recording(booking_id, room_name));
CREATE POLICY recordings_insert ON meeting_recordings FOR INSERT WITH CHECK (can_access_recording(booking_id, room_name));
CREATE POLICY recordings_update ON meeting_recordings FOR UPDATE USING (can_access_recording(booking_id, room_name));
CREATE POLICY recordings_delete ON meeting_recordings FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Safe trigger
DROP TRIGGER IF EXISTS update_recordings_updated_at ON meeting_recordings;
CREATE TRIGGER update_recordings_updated_at
    BEFORE UPDATE ON meeting_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
