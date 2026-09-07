-- ============================================================================
-- Email audiences ("user types") for funnels
-- ============================================================================
-- Funnels are grouped on the Funnels page by who they are for: students,
-- student leads, teachers, mentorship applicants, or any type a teacher adds.
-- A funnel belongs to at most one audience; unassigned funnels still work.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_audiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(60) UNIQUE,                 -- stable handle for built-in types; NULL for custom ones
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 100,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_funnels ADD COLUMN IF NOT EXISTS audience_id UUID REFERENCES email_audiences(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_funnels_audience ON email_funnels(audience_id) WHERE is_deleted = FALSE;

-- Built-in audiences (match the campaign roles in lib/email-templates/starter-funnels.ts)
INSERT INTO email_audiences (key, name, description, sort_order) VALUES
    ('students',      'Students',               'Singers with an account in the app.', 10),
    ('student_leads', 'Student Sign-ups',       'Singers who left an email on the website but have no account yet.', 20),
    ('teachers',      'Teachers & Studios',     'Vocal coaches and studio owners: demo requests and playbook leads.', 30),
    ('mentorship',    'Mentorship Applicants',  'People who submitted a Voice Application for 1:1 mentorship.', 40)
ON CONFLICT (key) DO NOTHING;

-- File existing trigger-based funnels under their audience
UPDATE email_funnels f
SET audience_id = a.id
FROM email_audiences a
WHERE f.audience_id IS NULL
  AND a.key = CASE f.trigger_key
      WHEN 'student_signup'         THEN 'students'
      WHEN 'student_lead'           THEN 'student_leads'
      WHEN 'teacher_demo'           THEN 'teachers'
      WHEN 'teacher_lead'           THEN 'teachers'
      WHEN 'mentorship_application' THEN 'mentorship'
  END;

ALTER TABLE email_audiences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_audiences_all ON email_audiences;
CREATE POLICY email_audiences_all ON email_audiences FOR ALL TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());

DROP TRIGGER IF EXISTS update_email_audiences_updated_at ON email_audiences;
CREATE TRIGGER update_email_audiences_updated_at
    BEFORE UPDATE ON email_audiences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
