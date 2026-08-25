-- ============================================================================
-- Voice Alchemy Academy - Migration: Email templates/funnels RLS hardening
--
-- Fixes:
--   * email_templates INSERT/UPDATE/DELETE were `TO authenticated ... (TRUE)`
--     and every funnel table was `FOR ALL TO authenticated USING (TRUE)` —
--     any logged-in student could rewrite or delete academy templates,
--     funnels, enrollments, and logs directly via PostgREST.
--   * The `users` role mirror never synced after signup (trigger only copies
--     email), so is_email_admin() and admin carve-outs read stale roles.
-- ============================================================================

-- Teaching staff = source-of-truth role from profiles (not the users mirror)
CREATE OR REPLACE FUNCTION is_teaching_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'instructor')
    );
$$;

-- ----------------------------------------------------------------------------
-- email_templates: staff-only (students never need direct template access)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS email_templates_select ON email_templates;
CREATE POLICY email_templates_select ON email_templates FOR SELECT TO authenticated
USING (is_teaching_staff());

DROP POLICY IF EXISTS email_templates_insert ON email_templates;
CREATE POLICY email_templates_insert ON email_templates FOR INSERT TO authenticated
WITH CHECK (is_teaching_staff());

DROP POLICY IF EXISTS email_templates_update ON email_templates;
CREATE POLICY email_templates_update ON email_templates FOR UPDATE TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());

DROP POLICY IF EXISTS email_templates_delete ON email_templates;
CREATE POLICY email_templates_delete ON email_templates FOR DELETE TO authenticated
USING (is_teaching_staff());

-- ----------------------------------------------------------------------------
-- Funnel tables: staff-only, replacing USING (TRUE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS email_funnels_all ON email_funnels;
CREATE POLICY email_funnels_all ON email_funnels FOR ALL TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());

DROP POLICY IF EXISTS email_funnel_phases_all ON email_funnel_phases;
CREATE POLICY email_funnel_phases_all ON email_funnel_phases FOR ALL TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());

DROP POLICY IF EXISTS email_funnel_enrollments_all ON email_funnel_enrollments;
CREATE POLICY email_funnel_enrollments_all ON email_funnel_enrollments FOR ALL TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());

DROP POLICY IF EXISTS email_funnel_logs_all ON email_funnel_logs;
CREATE POLICY email_funnel_logs_all ON email_funnel_logs FOR ALL TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());

-- ----------------------------------------------------------------------------
-- users role mirror: backfill and keep in sync with profiles.role
-- ----------------------------------------------------------------------------
UPDATE users u
SET role = p.role
FROM profiles p
WHERE u.id = p.id
  AND p.role IS NOT NULL
  AND u.role IS DISTINCT FROM p.role;

CREATE OR REPLACE FUNCTION sync_users_role_from_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE users SET role = NEW.role WHERE id = NEW.id AND NEW.role IS NOT NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_users_role ON profiles;
CREATE TRIGGER sync_users_role
    AFTER INSERT OR UPDATE OF role ON profiles
    FOR EACH ROW EXECUTE FUNCTION sync_users_role_from_profiles();
