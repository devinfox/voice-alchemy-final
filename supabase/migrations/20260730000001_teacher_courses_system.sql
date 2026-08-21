-- ============================================================================
-- Voice Alchemy Academy - Migration: Teacher Course Creation & Upload System
-- Safe non-destructive upgrade for courses and curriculum
-- ============================================================================

-- Add rich metadata columns to courses table if they don't exist
DO $$
BEGIN
    -- slug for clean URLs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'slug') THEN
        ALTER TABLE courses ADD COLUMN slug TEXT;
    END IF;

    -- title
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'title') THEN
        ALTER TABLE courses ADD COLUMN title TEXT;
    END IF;

    -- subtitle
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'subtitle') THEN
        ALTER TABLE courses ADD COLUMN subtitle TEXT;
    END IF;

    -- category / vocal focus
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'category') THEN
        ALTER TABLE courses ADD COLUMN category TEXT DEFAULT 'Vocal Technique';
    END IF;

    -- level (Beginner, Intermediate, Advanced, All Levels)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'level') THEN
        ALTER TABLE courses ADD COLUMN level TEXT DEFAULT 'Beginner';
    END IF;

    -- thumbnail_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'thumbnail_url') THEN
        ALTER TABLE courses ADD COLUMN thumbnail_url TEXT;
    END IF;

    -- preview_video_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'preview_video_url') THEN
        ALTER TABLE courses ADD COLUMN preview_video_url TEXT;
    END IF;

    -- is_published
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'is_published') THEN
        ALTER TABLE courses ADD COLUMN is_published BOOLEAN DEFAULT FALSE;
    END IF;

    -- is_free
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'is_free') THEN
        ALTER TABLE courses ADD COLUMN is_free BOOLEAN DEFAULT TRUE;
    END IF;

    -- price
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'price') THEN
        ALTER TABLE courses ADD COLUMN price NUMERIC DEFAULT 0;
    END IF;

    -- what_you_will_learn (JSONB array)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'what_you_will_learn') THEN
        ALTER TABLE courses ADD COLUMN what_you_will_learn JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- requirements (JSONB array)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'requirements') THEN
        ALTER TABLE courses ADD COLUMN requirements JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- curriculum (JSONB array of sections and lessons)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'curriculum') THEN
        ALTER TABLE courses ADD COLUMN curriculum JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- instructor_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'instructor_name') THEN
        ALTER TABLE courses ADD COLUMN instructor_name TEXT;
    END IF;

    -- estimated_duration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'estimated_duration') THEN
        ALTER TABLE courses ADD COLUMN estimated_duration TEXT;
    END IF;
END $$;

-- Populate title from name if title is null
UPDATE courses SET title = name WHERE title IS NULL AND name IS NOT NULL;

-- Create indexes for fast course queries
CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_is_published ON courses(is_published);
CREATE INDEX IF NOT EXISTS idx_courses_instructor_id ON courses(instructor_id);

-- Update RLS policies
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courses_select ON courses;
CREATE POLICY courses_select ON courses FOR SELECT USING (
    is_published = TRUE 
    OR is_active = TRUE 
    OR instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS courses_insert ON courses;
CREATE POLICY courses_insert ON courses FOR INSERT WITH CHECK (
    instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'instructor'))
);

DROP POLICY IF EXISTS courses_update ON courses;
CREATE POLICY courses_update ON courses FOR UPDATE USING (
    instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS courses_delete ON courses;
CREATE POLICY courses_delete ON courses FOR DELETE USING (
    instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
