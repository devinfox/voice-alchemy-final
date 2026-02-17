-- ============================================================================
-- Voice Alchemy Academy - SAFE Migration
-- Migration 00002: Bookings table (NON-DESTRUCTIVE)
-- ============================================================================

-- Create bookings table ONLY if it doesn't exist
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    lesson_day_of_week INTEGER CHECK (lesson_day_of_week >= 0 AND lesson_day_of_week <= 6),
    lesson_time TIME,
    lesson_duration_minutes INTEGER DEFAULT 60,
    lesson_timezone VARCHAR(50) DEFAULT 'America/New_York',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_student_instructor UNIQUE (student_id, instructor_id),
    CONSTRAINT different_users CHECK (student_id != instructor_id)
);

-- Add columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'lesson_day_of_week') THEN
        ALTER TABLE bookings ADD COLUMN lesson_day_of_week INTEGER CHECK (lesson_day_of_week >= 0 AND lesson_day_of_week <= 6);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'lesson_time') THEN
        ALTER TABLE bookings ADD COLUMN lesson_time TIME;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'lesson_duration_minutes') THEN
        ALTER TABLE bookings ADD COLUMN lesson_duration_minutes INTEGER DEFAULT 60;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'lesson_timezone') THEN
        ALTER TABLE bookings ADD COLUMN lesson_timezone VARCHAR(50) DEFAULT 'America/New_York';
    END IF;
END $$;

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_instructor ON bookings(instructor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- Enable RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Safe policy updates
DROP POLICY IF EXISTS bookings_select ON bookings;
DROP POLICY IF EXISTS bookings_insert ON bookings;
DROP POLICY IF EXISTS bookings_update ON bookings;
DROP POLICY IF EXISTS bookings_delete ON bookings;

CREATE POLICY bookings_select ON bookings FOR SELECT USING (
    student_id = auth.uid() OR instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY bookings_insert ON bookings FOR INSERT WITH CHECK (
    student_id = auth.uid() OR instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY bookings_update ON bookings FOR UPDATE USING (
    student_id = auth.uid() OR instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY bookings_delete ON bookings FOR DELETE USING (
    student_id = auth.uid() OR instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Safe trigger
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
