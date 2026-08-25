-- ============================================================================
-- Voice Alchemy Academy - Migration: Courses RLS hardening & data integrity
--
-- Corrects issues in 00006_safe_courses.sql / 20260730000001_teacher_courses_system.sql:
--   * courses_select made every row public because `is_active` (default TRUE)
--     was OR-ed with `is_published` — drafts were world-readable
--   * courses_insert let any authenticated user create courses (role check
--     was OR-ed instead of AND-ed with the ownership check)
--   * UPDATE policies had no WITH CHECK, so an owner could reassign
--     instructor_id or otherwise write rows they couldn't target
--   * slug had a plain (non-unique) index
--   * duplicate index on instructor_id; no DELETE policy on enrollments;
--     unrestricted self-enrollment; no price/level constraints
--
-- Non-destructive: safe to run on a fresh DB or on top of the old policies.
-- ============================================================================

-- Ensure the shared updated_at trigger function exists even if this migration
-- set is run standalone (it normally comes from 00001_safe_profiles.sql).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Columns: re-assert schema-qualified (the original guards queried
-- information_schema without table_schema and could be skipped if a
-- same-named table existed in another schema). ADD COLUMN IF NOT EXISTS is
-- idempotent and explicitly targets public.courses.
-- ----------------------------------------------------------------------------
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Vocal Technique';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'Beginner';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS preview_video_url TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT TRUE;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS what_you_will_learn JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS curriculum JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS instructor_name TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS estimated_duration TEXT;

-- ----------------------------------------------------------------------------
-- Data constraints
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'courses_price_non_negative' AND conrelid = 'public.courses'::regclass
    ) THEN
        -- NOT VALID so legacy rows can't fail the migration; validated below.
        ALTER TABLE public.courses
            ADD CONSTRAINT courses_price_non_negative CHECK (price IS NULL OR price >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'courses_level_valid' AND conrelid = 'public.courses'::regclass
    ) THEN
        ALTER TABLE public.courses
            ADD CONSTRAINT courses_level_valid
            CHECK (level IS NULL OR level IN ('Beginner', 'Intermediate', 'Advanced', 'All Levels')) NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    ALTER TABLE public.courses VALIDATE CONSTRAINT courses_price_non_negative;
    ALTER TABLE public.courses VALIDATE CONSTRAINT courses_level_valid;
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Legacy course rows violate new constraints; constraints left NOT VALID. Clean up data, then VALIDATE CONSTRAINT manually.';
END $$;

-- ----------------------------------------------------------------------------
-- Slug uniqueness: de-duplicate existing slugs, then replace the plain index
-- with a partial unique index (slug is nullable on legacy rows).
-- ----------------------------------------------------------------------------
WITH dups AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
    FROM public.courses
    WHERE slug IS NOT NULL
)
UPDATE public.courses c
SET slug = c.slug || '-' || LEFT(c.id::text, 8)
FROM dups
WHERE c.id = dups.id AND dups.rn > 1;

DROP INDEX IF EXISTS idx_courses_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_slug_unique
    ON public.courses (slug) WHERE slug IS NOT NULL;

-- idx_courses_instructor_id (from 20260730000001) duplicates
-- idx_courses_instructor (from 00006) on the same column.
DROP INDEX IF EXISTS idx_courses_instructor_id;

-- ----------------------------------------------------------------------------
-- Visibility backfill: under the old policy every is_active course was
-- effectively public, so mark those rows published to preserve current
-- catalog visibility as the policy tightens. New drafts (is_published FALSE)
-- become private from here on.
-- ----------------------------------------------------------------------------
UPDATE public.courses
SET is_published = TRUE
WHERE is_active = TRUE AND is_published IS DISTINCT FROM TRUE;

-- ----------------------------------------------------------------------------
-- Courses RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- NOTE: this policy must not reference course_enrollments — enrollments_select
-- already references courses, and mutual references between the two tables'
-- policies would make Postgres raise "infinite recursion detected in policy".
-- Enrolled students see their courses through the published+active branch
-- (the backfill above keeps every currently-visible course published), and
-- unpublishing a course intentionally withdraws it from students.
DROP POLICY IF EXISTS courses_select ON public.courses;
CREATE POLICY courses_select ON public.courses FOR SELECT USING (
    (is_published = TRUE AND is_active = TRUE)
    OR instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS courses_insert ON public.courses;
CREATE POLICY courses_insert ON public.courses FOR INSERT WITH CHECK (
    (
        instructor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'instructor')
        )
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS courses_update ON public.courses;
CREATE POLICY courses_update ON public.courses FOR UPDATE
USING (
    instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
    -- Non-admin instructors can't reassign a course to someone else.
    instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS courses_delete ON public.courses;
CREATE POLICY courses_delete ON public.courses FOR DELETE USING (
    instructor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ----------------------------------------------------------------------------
-- Enrollments RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrollments_insert ON public.course_enrollments;
CREATE POLICY enrollments_insert ON public.course_enrollments FOR INSERT WITH CHECK (
    (
        -- Students may self-enroll only into published, active, free courses;
        -- paid enrollment must go through a server-side (service role) flow.
        student_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_id
              AND c.is_published = TRUE
              AND c.is_active = TRUE
              AND (c.is_free = TRUE OR c.price IS NULL OR c.price = 0)
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id AND c.instructor_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS enrollments_update ON public.course_enrollments;
CREATE POLICY enrollments_update ON public.course_enrollments FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Students can unenroll themselves; instructors and admins can remove
-- enrollments from their courses. (Previously there was no DELETE policy at
-- all, so nobody could ever unenroll.)
DROP POLICY IF EXISTS enrollments_delete ON public.course_enrollments;
CREATE POLICY enrollments_delete ON public.course_enrollments FOR DELETE USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.instructor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
