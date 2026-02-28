-- Add booking_id to notes_archive for proper class-level linking
-- This fixes the issue where all notes for a student appear together
-- regardless of which class/teacher they belong to

ALTER TABLE notes_archive
ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

-- Create index for faster lookups by booking
CREATE INDEX IF NOT EXISTS idx_notes_archive_booking_id ON notes_archive(booking_id);

-- Also add booking_id to lesson_recordings if not already present
-- (lesson_recordings uses booking_id already, but let's ensure consistency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_recordings' AND column_name = 'booking_id'
  ) THEN
    ALTER TABLE lesson_recordings ADD COLUMN booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;
    CREATE INDEX idx_lesson_recordings_booking_id ON lesson_recordings(booking_id);
  END IF;
END $$;
