-- ============================================================================
-- Contact tags + tag-driven funnel automation
-- ============================================================================
-- * email_tags: labels Julia attaches to people ("Mentorship 2026",
--   "Asked about pricing", "VIP"). Shared by website leads and account holders.
-- * email_contact_tags: which tag is on which person. A row points at either
--   a website lead (email_leads.id) or an account (profiles.id), never both.
-- * email_funnels gains three tag hooks:
--     trigger_tag_ids  - adding any of these tags starts the funnel
--     exit_tag_ids     - adding any of these tags stops the funnel for them
--     complete_tag_ids - tags applied when someone finishes the funnel
--   Several funnels may listen to the same tag, unlike trigger_key.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(60) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT 'gold',   -- palette key, see lib/email-tags.ts
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_tags_name_live
    ON email_tags (LOWER(name)) WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS email_contact_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id UUID NOT NULL REFERENCES email_tags(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES email_leads(id) ON DELETE CASCADE,       -- website lead
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,       -- account holder
    added_via VARCHAR(20) NOT NULL DEFAULT 'manual',                 -- manual | website | funnel | import
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT email_contact_tags_one_target CHECK (
        (lead_id IS NOT NULL AND profile_id IS NULL) OR (lead_id IS NULL AND profile_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_contact_tags_lead
    ON email_contact_tags (tag_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_contact_tags_profile
    ON email_contact_tags (tag_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_contact_tags_by_lead ON email_contact_tags (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_contact_tags_by_profile ON email_contact_tags (profile_id) WHERE profile_id IS NOT NULL;

ALTER TABLE email_funnels ADD COLUMN IF NOT EXISTS trigger_tag_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE email_funnels ADD COLUMN IF NOT EXISTS exit_tag_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE email_funnels ADD COLUMN IF NOT EXISTS complete_tag_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_email_funnels_trigger_tags ON email_funnels USING GIN (trigger_tag_ids) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_funnels_exit_tags ON email_funnels USING GIN (exit_tag_ids) WHERE is_deleted = FALSE;

COMMENT ON COLUMN email_funnels.trigger_tag_ids IS 'Adding any of these tags to a person enrolls them (while the funnel is active)';
COMMENT ON COLUMN email_funnels.exit_tag_ids IS 'Adding any of these tags cancels the person''s live enrollment in this funnel';
COMMENT ON COLUMN email_funnels.complete_tag_ids IS 'Tags applied to a person when they finish the last step';

ALTER TABLE email_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_contact_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_tags_all ON email_tags;
CREATE POLICY email_tags_all ON email_tags FOR ALL TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());
DROP POLICY IF EXISTS email_contact_tags_all ON email_contact_tags;
CREATE POLICY email_contact_tags_all ON email_contact_tags FOR ALL TO authenticated
USING (is_teaching_staff()) WITH CHECK (is_teaching_staff());

DROP TRIGGER IF EXISTS update_email_tags_updated_at ON email_tags;
CREATE TRIGGER update_email_tags_updated_at
    BEFORE UPDATE ON email_tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
