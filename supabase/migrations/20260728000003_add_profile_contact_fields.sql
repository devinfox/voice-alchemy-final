-- ============================================================================
-- Admin student directory: contact fields
-- ============================================================================
-- The admin CRM view needs first name, last name, email, phone and join date.
--
-- Already available, no change needed:
--   first_name / last_name / created_at  -> public.profiles
--   email / last_sign_in_at              -> auth.users (service-role read only)
--
-- Missing entirely: phone. It is not on profiles, and all 114 auth.users rows
-- have phone IS NULL because signup never collects one. This adds the column so
-- the field exists and can be populated going forward; it will read as empty
-- for every current student until phone capture is added to signup/settings.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.profiles.phone
    IS 'Contact phone. Not collected at signup as of this migration - backfill manually or add to the signup form.';

-- Admin free-text notes about a student, CRM-style.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS admin_notes text;

COMMENT ON COLUMN public.profiles.admin_notes
    IS 'Internal notes visible to admins only. Never exposed to student-facing queries.';

-- Directory sorting/filtering by signup recency.
CREATE INDEX IF NOT EXISTS idx_profiles_role_created
    ON public.profiles (role, created_at DESC);

COMMIT;
