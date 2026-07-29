-- Email funnels (drip sequences), ported from CRM 00023
BEGIN;

DO $$ BEGIN
    CREATE TYPE funnel_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE enrollment_status AS ENUM (
        'active', 'completed', 'paused', 'cancelled', 'pending_approval', 'rejected'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS email_funnels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status funnel_status DEFAULT 'draft',
    tags TEXT[] DEFAULT '{}',
    auto_enroll_enabled BOOLEAN DEFAULT FALSE,
    total_enrolled INT DEFAULT 0,
    total_completed INT DEFAULT 0,
    total_emails_sent INT DEFAULT 0,
    total_opens INT DEFAULT 0,
    total_clicks INT DEFAULT 0,
    created_by UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_funnel_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    funnel_id UUID NOT NULL REFERENCES email_funnels(id) ON DELETE CASCADE,
    template_id UUID REFERENCES email_templates(id),
    phase_order INT NOT NULL,
    name VARCHAR(100),
    delay_days INT NOT NULL DEFAULT 0,
    delay_hours INT DEFAULT 0,
    emails_sent INT DEFAULT 0,
    emails_opened INT DEFAULT 0,
    emails_clicked INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(funnel_id, phase_order)
);

CREATE TABLE IF NOT EXISTS email_funnel_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    funnel_id UUID NOT NULL REFERENCES email_funnels(id) ON DELETE CASCADE,
    lead_id UUID,
    contact_id UUID,
    status enrollment_status DEFAULT 'active',
    current_phase INT DEFAULT 1,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    enrolled_by UUID REFERENCES users(id),
    last_email_sent_at TIMESTAMPTZ,
    next_email_scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    match_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_funnel_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enrollment_id UUID NOT NULL REFERENCES email_funnel_enrollments(id) ON DELETE CASCADE,
    phase_id UUID NOT NULL REFERENCES email_funnel_phases(id) ON DELETE CASCADE,
    email_id UUID REFERENCES emails(id),
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_funnels_status ON email_funnels(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_funnel_phases_funnel ON email_funnel_phases(funnel_id);
CREATE INDEX IF NOT EXISTS idx_email_funnel_enrollments_funnel ON email_funnel_enrollments(funnel_id);
CREATE INDEX IF NOT EXISTS idx_email_funnel_enrollments_status ON email_funnel_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_email_funnel_logs_enrollment ON email_funnel_logs(enrollment_id);

ALTER TABLE email_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_funnel_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_funnel_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_funnel_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_funnels_all ON email_funnels;
CREATE POLICY email_funnels_all ON email_funnels FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS email_funnel_phases_all ON email_funnel_phases;
CREATE POLICY email_funnel_phases_all ON email_funnel_phases FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS email_funnel_enrollments_all ON email_funnel_enrollments;
CREATE POLICY email_funnel_enrollments_all ON email_funnel_enrollments FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS email_funnel_logs_all ON email_funnel_logs;
CREATE POLICY email_funnel_logs_all ON email_funnel_logs FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

COMMIT;
