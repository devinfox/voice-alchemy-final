-- ============================================================================
-- Website lead intake, trigger-based funnel enrollment, unsubscribes, preheaders
-- ============================================================================
-- * email_leads: people who gave the website an email but have no account
--   (singer leads, demo requests, mentorship applicants). Funnel enrollments
--   point at them through email_funnel_enrollments.contact_id; account
--   holders keep using lead_id (= profiles.id).
-- * email_funnels.trigger_key: which website/app event auto-enrolls into the
--   funnel. One live funnel per trigger.
-- * email_unsubscribes: addresses that clicked the unsubscribe link. The
--   delivery worker refuses to send to them.
-- * email_templates.preheader / starter_key: inbox preview text, and the
--   code-defined starter the row was installed from (idempotent installs).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    persona VARCHAR(20) NOT NULL DEFAULT 'singer',   -- singer | coach
    source VARCHAR(80),                              -- form that captured them
    last_type VARCHAR(40),                           -- lead | teacher_demo | mentorship_application ...
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,     -- goal, level, studio, application answers ...
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- set once they create an account
    is_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_leads_email ON email_leads(email);
CREATE INDEX IF NOT EXISTS idx_email_leads_profile ON email_leads(profile_id);
CREATE INDEX IF NOT EXISTS idx_email_leads_created ON email_leads(created_at DESC);

CREATE TABLE IF NOT EXISTS email_unsubscribes (
    email VARCHAR(255) PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_funnels ADD COLUMN IF NOT EXISTS trigger_key VARCHAR(60);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_funnels_trigger_key
    ON email_funnels(trigger_key) WHERE trigger_key IS NOT NULL AND is_deleted = FALSE;

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS preheader VARCHAR(255);
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS starter_key VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_email_templates_starter_key ON email_templates(starter_key) WHERE starter_key IS NOT NULL;

ALTER TABLE email_funnel_enrollments ADD COLUMN IF NOT EXISTS enrolled_via VARCHAR(40) DEFAULT 'manual'; -- manual | website | signup | ai
CREATE INDEX IF NOT EXISTS idx_email_funnel_enrollments_contact ON email_funnel_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_funnel_enrollments_lead ON email_funnel_enrollments(lead_id);

COMMENT ON COLUMN email_funnel_enrollments.lead_id IS 'profiles.id when the recipient has an account';
COMMENT ON COLUMN email_funnel_enrollments.contact_id IS 'email_leads.id when the recipient is a website lead without an account';

ALTER TABLE email_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_leads_all ON email_leads;
CREATE POLICY email_leads_all ON email_leads FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS email_unsubscribes_read ON email_unsubscribes;
CREATE POLICY email_unsubscribes_read ON email_unsubscribes FOR SELECT TO authenticated USING (TRUE);

COMMIT;
