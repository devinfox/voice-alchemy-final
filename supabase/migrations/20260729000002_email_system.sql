-- ============================================================================
-- Email system, ported from the ByeTalk/Citadel CRM
-- ============================================================================
-- Consolidates CRM migrations 00017, 00018, 00019, 00021 (email columns only),
-- 00154, 00155, 00156, 00157, 00158, 00163, 00167, 00168, 00170 and 00185 into
-- one migration, because this database is starting from zero and replaying
-- fourteen incremental steps (several of which patch each other) would only
-- reproduce their intermediate bugs.
--
-- Deliberate differences from the source, all consequences of this app not
-- being a sales CRM:
--
--   * No FKs to contacts / leads / deals / calls / tasks / activity_log. The
--     columns survive as plain nullable UUIDs so that any ported query still
--     selecting them keeps working; nothing writes them.
--   * No Microsoft Graph or Gmail columns and no batch_insert_emails(). This
--     install is SendGrid-only.
--   * emails.message_id is unique per (email_account_id, message_id), never
--     globally — CRM 00185 landed that fix after internal mail silently
--     vanished, and starting with the broken constraint would repeat it.
-- ============================================================================

BEGIN;

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE email_folder AS ENUM ('inbox', 'sent', 'drafts', 'trash', 'spam', 'archive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE email_status AS ENUM (
        'draft', 'queued', 'sending', 'sent', 'delivered',
        'opened', 'clicked', 'bounced', 'failed', 'spam_reported'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE domain_verification_status AS ENUM ('pending', 'verifying', 'verified', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE thread_workflow_state AS ENUM ('needs_response', 'waiting_on_reply', 'snoozed', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ai_analysis_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- EMAIL DOMAINS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain VARCHAR(255) NOT NULL UNIQUE,

    -- SendGrid domain authentication
    sendgrid_domain_id VARCHAR(100),
    sendgrid_authenticated BOOLEAN DEFAULT FALSE,

    verification_status domain_verification_status DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    last_verification_check TIMESTAMPTZ,
    verification_error TEXT,

    -- Rendered for the user on the domain settings screen, e.g.
    -- { "type": "mx", "host": "@", "value": "mx.sendgrid.net", "priority": 10 }
    dns_records JSONB DEFAULT '[]'::jsonb,

    inbound_enabled BOOLEAN DEFAULT TRUE,
    is_shared BOOLEAN DEFAULT FALSE,

    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_domains_domain ON email_domains(domain) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_domains_status ON email_domains(verification_status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_domains_created_by ON email_domains(created_by) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_domains_org ON email_domains(organization_id) WHERE is_deleted = FALSE;

-- ============================================================================
-- EMAIL ACCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_address VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(200),

    domain_id UUID REFERENCES email_domains(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    signature_html TEXT,
    signature_text TEXT,

    auto_reply_enabled BOOLEAN DEFAULT FALSE,
    auto_reply_subject VARCHAR(500),
    auto_reply_body TEXT,
    auto_reply_start TIMESTAMPTZ,
    auto_reply_end TIMESTAMPTZ,

    -- Undo-send window. 0 disables the delay entirely.
    undo_send_seconds INTEGER DEFAULT 10 CHECK (undo_send_seconds >= 0 AND undo_send_seconds <= 30),

    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_accounts_domain ON email_accounts(domain_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_accounts_address ON email_accounts(email_address) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_accounts_primary ON email_accounts(user_id, is_primary)
    WHERE is_deleted = FALSE AND is_primary = TRUE;

-- ============================================================================
-- EMAIL THREADS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject VARCHAR(1000),
    participants JSONB DEFAULT '[]'::jsonb,

    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,

    has_attachments BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE,

    folder email_folder DEFAULT 'inbox',
    labels TEXT[] DEFAULT '{}',

    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    -- Threading identity (CRM 00167). conversation_key is the O(1) lookup key;
    -- the JSONB-participants scan it replaced was the slowest query in the app.
    conversation_key VARCHAR(500),
    provider_thread_id VARCHAR(500),
    provider VARCHAR(20) DEFAULT 'sendgrid',

    -- Workflow (CRM 00158)
    workflow_state thread_workflow_state,
    snoozed_until TIMESTAMPTZ,
    last_outbound_at TIMESTAMPTZ,
    last_inbound_at TIMESTAMPTZ,

    -- Inert in this app; see header note.
    contact_id UUID,
    lead_id UUID,
    deal_id UUID,

    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_threads_account ON email_threads(email_account_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_threads_folder ON email_threads(email_account_id, folder) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_threads_last_message ON email_threads(email_account_id, last_message_at DESC)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_threads_starred ON email_threads(email_account_id, is_starred)
    WHERE is_deleted = FALSE AND is_starred = TRUE;
CREATE INDEX IF NOT EXISTS idx_email_threads_unread ON email_threads(email_account_id, is_read)
    WHERE is_deleted = FALSE AND is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_threads_conversation_key ON email_threads(email_account_id, conversation_key)
    WHERE is_deleted = FALSE AND conversation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_threads_provider_thread ON email_threads(email_account_id, provider_thread_id)
    WHERE is_deleted = FALSE AND provider_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_threads_workflow_state ON email_threads(workflow_state)
    WHERE workflow_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_threads_snoozed_until ON email_threads(snoozed_until)
    WHERE snoozed_until IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_threads_unique_conversation
    ON email_threads(email_account_id, conversation_key)
    WHERE is_deleted = FALSE AND conversation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_threads_search ON email_threads USING gin(
    to_tsvector('english', COALESCE(subject, ''))
) WHERE is_deleted = FALSE;

-- ============================================================================
-- EMAILS
-- ============================================================================

CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,

    -- RFC 5322 identifiers
    message_id VARCHAR(500),
    in_reply_to VARCHAR(500),
    references_header TEXT[],
    conversation_key VARCHAR(500),

    from_address VARCHAR(255) NOT NULL,
    from_name VARCHAR(200),
    to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
    cc_addresses JSONB DEFAULT '[]'::jsonb,
    bcc_addresses JSONB DEFAULT '[]'::jsonb,
    reply_to_address VARCHAR(255),

    subject VARCHAR(1000),
    body_text TEXT,
    body_html TEXT,
    snippet VARCHAR(500),

    is_inbound BOOLEAN NOT NULL,

    status email_status DEFAULT 'draft',
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,

    sendgrid_message_id VARCHAR(100),

    has_attachments BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_starred BOOLEAN DEFAULT FALSE,

    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    headers JSONB,
    scheduled_at TIMESTAMPTZ,

    -- Undo send (CRM 00155)
    send_after TIMESTAMPTZ,
    can_undo_until TIMESTAMPTZ,

    -- AI enrichment (CRM 00021, email columns only)
    ai_analysis_status ai_analysis_status DEFAULT 'pending',
    ai_analyzed_at TIMESTAMPTZ,
    ai_processed_at TIMESTAMPTZ,
    ai_summary TEXT,
    ai_sentiment VARCHAR(20),
    ai_sentiment_score DECIMAL(4,3),
    ai_intent VARCHAR(50),
    ai_urgency_score INTEGER,
    ai_action_items TEXT[],
    ai_key_topics TEXT[],
    ai_commitments JSONB,
    ai_requests JSONB,
    ai_raw_response JSONB,

    email_template_id UUID,

    -- Inert in this app; see header note.
    contact_id UUID,
    lead_id UUID,
    deal_id UUID,

    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-account, NOT global. A single message legitimately exists once per
-- mailbox that received it, plus the sender's Sent copy.
CREATE UNIQUE INDEX IF NOT EXISTS emails_account_message_id_key
    ON emails (email_account_id, message_id) WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(email_account_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_emails_sent ON emails(email_account_id, sent_at DESC)
    WHERE is_deleted = FALSE AND sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id)
    WHERE is_deleted = FALSE AND message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_in_reply_to ON emails(in_reply_to)
    WHERE is_deleted = FALSE AND in_reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_inbound ON emails(email_account_id, is_inbound) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_emails_scheduled ON emails(scheduled_at)
    WHERE is_deleted = FALSE AND scheduled_at IS NOT NULL AND status = 'queued';
CREATE INDEX IF NOT EXISTS idx_emails_send_after ON emails(send_after)
    WHERE send_after IS NOT NULL AND status = 'queued';
CREATE INDEX IF NOT EXISTS idx_emails_sendgrid ON emails(sendgrid_message_id)
    WHERE sendgrid_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_conversation_key ON emails(email_account_id, conversation_key)
    WHERE is_deleted = FALSE AND conversation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_search ON emails USING gin(
    to_tsvector('english',
        COALESCE(subject, '') || ' ' || COALESCE(body_text, '') || ' ' || COALESCE(from_address, ''))
) WHERE is_deleted = FALSE;

-- ============================================================================
-- ATTACHMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE NOT NULL,

    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(200),
    size_bytes BIGINT,

    storage_bucket VARCHAR(100) DEFAULT 'email-attachments',
    storage_path TEXT NOT NULL,
    public_url TEXT,

    content_id VARCHAR(255),
    is_inline BOOLEAN DEFAULT FALSE,

    -- Lazy fetch (CRM 00168)
    is_fetched BOOLEAN DEFAULT FALSE,
    provider_attachment_id VARCHAR(500),
    provider VARCHAR(20) DEFAULT 'sendgrid',
    fetch_attempts INTEGER DEFAULT 0,
    last_fetch_error TEXT,
    last_fetch_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email ON email_attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_content_id ON email_attachments(content_id)
    WHERE content_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_attachments_unfetched ON email_attachments(email_id)
    WHERE is_fetched = FALSE;

-- ============================================================================
-- EVENTS (SendGrid webhook)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    sendgrid_message_id VARCHAR(100),

    event_type VARCHAR(50) NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,

    recipient VARCHAR(255),
    url TEXT,
    user_agent TEXT,
    ip_address VARCHAR(45),
    bounce_type VARCHAR(50),
    bounce_reason TEXT,

    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(email_id);
CREATE INDEX IF NOT EXISTS idx_email_events_sg_message ON email_events(sendgrid_message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_timestamp ON email_events(event_timestamp DESC);

-- ============================================================================
-- TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    body_html TEXT,
    description TEXT,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category) WHERE is_deleted = FALSE;

-- ============================================================================
-- DRAFTS
-- ============================================================================

-- User-composed drafts, autosaved from the composer.
CREATE TABLE IF NOT EXISTS user_email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,
    reply_to_email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
    to_emails JSONB DEFAULT '[]',
    cc_emails JSONB DEFAULT '[]',
    bcc_emails JSONB DEFAULT '[]',
    subject TEXT,
    body_html TEXT,
    attachments JSONB DEFAULT '[]',
    compose_mode VARCHAR(20) DEFAULT 'new' CHECK (compose_mode IN ('new', 'reply', 'forward')),
    last_saved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_email_drafts_user_id ON user_email_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_drafts_account_id ON user_email_drafts(email_account_id);
CREATE INDEX IF NOT EXISTS idx_user_email_drafts_thread_id ON user_email_drafts(thread_id);
CREATE INDEX IF NOT EXISTS idx_user_email_drafts_updated_at ON user_email_drafts(updated_at DESC);

-- Suggested drafts. In the CRM these were generated from call transcripts;
-- here nothing writes them yet, so the AI Drafts screen renders empty.
CREATE TABLE IF NOT EXISTS email_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    from_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    to_name TEXT,
    subject TEXT,
    body_html TEXT,
    body_text TEXT,
    attachment_ids UUID[] DEFAULT '{}',
    due_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed')),
    ai_generated BOOLEAN DEFAULT TRUE,
    commitment_quote TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_user_pending ON email_drafts(user_id, status)
    WHERE status = 'pending';

-- ============================================================================
-- LABELS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#6366f1',
    icon VARCHAR(50) DEFAULT 'tag',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS email_thread_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE NOT NULL,
    label_id UUID REFERENCES email_labels(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(thread_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_email_labels_user_id ON email_labels(user_id);
CREATE INDEX IF NOT EXISTS idx_email_thread_labels_thread_id ON email_thread_labels(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_thread_labels_label_id ON email_thread_labels(label_id);

-- ============================================================================
-- SAVED VIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_saved_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'folder',
    color VARCHAR(7) DEFAULT '#6366f1',
    filters JSONB NOT NULL DEFAULT '{}',
    is_system BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_saved_views_user_id ON email_saved_views(user_id);
CREATE INDEX IF NOT EXISTS idx_email_saved_views_sort_order ON email_saved_views(user_id, sort_order);

-- ============================================================================
-- NOTIFICATION TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_notification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_notification_tokens_token ON email_notification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_notification_tokens_user ON email_notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notification_tokens_expires ON email_notification_tokens(expires_at);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_thread_on_email_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE email_threads SET
        message_count = message_count + 1,
        unread_count = CASE WHEN NEW.is_inbound AND NOT NEW.is_read THEN unread_count + 1 ELSE unread_count END,
        last_message_at = GREATEST(last_message_at, NEW.created_at),
        has_attachments = has_attachments OR NEW.has_attachments,
        is_read = CASE WHEN NEW.is_inbound THEN FALSE ELSE is_read END,
        updated_at = NOW()
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_thread_on_email_insert ON emails;
CREATE TRIGGER trigger_update_thread_on_email_insert
    AFTER INSERT ON emails
    FOR EACH ROW WHEN (NEW.thread_id IS NOT NULL)
    EXECUTE FUNCTION update_thread_on_email_insert();

CREATE OR REPLACE FUNCTION update_thread_on_email_read()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_read = FALSE AND NEW.is_read = TRUE AND NEW.is_inbound = TRUE THEN
        UPDATE email_threads SET
            unread_count = GREATEST(0, unread_count - 1),
            is_read = (
                SELECT COUNT(*) = 0 FROM emails
                WHERE thread_id = NEW.thread_id AND is_inbound = TRUE
                  AND is_read = FALSE AND is_deleted = FALSE
            ),
            updated_at = NOW()
        WHERE id = NEW.thread_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_thread_on_email_read ON emails;
CREATE TRIGGER trigger_update_thread_on_email_read
    AFTER UPDATE OF is_read ON emails
    FOR EACH ROW WHEN (NEW.thread_id IS NOT NULL)
    EXECUTE FUNCTION update_thread_on_email_read();

-- Workflow state follows message direction: inbound needs a reply, outbound is
-- waiting on one. A snoozed thread stays snoozed until its timer fires.
CREATE OR REPLACE FUNCTION update_thread_workflow_on_email()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_inbound THEN
        UPDATE email_threads
        SET last_inbound_at = COALESCE(NEW.sent_at, NEW.created_at),
            workflow_state = CASE
                WHEN workflow_state = 'snoozed' THEN 'snoozed'
                ELSE 'needs_response'
            END
        WHERE id = NEW.thread_id;
    ELSE
        UPDATE email_threads
        SET last_outbound_at = COALESCE(NEW.sent_at, NEW.created_at),
            workflow_state = 'waiting_on_reply'
        WHERE id = NEW.thread_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_workflow_trigger ON emails;
CREATE TRIGGER email_workflow_trigger
    AFTER INSERT ON emails
    FOR EACH ROW WHEN (NEW.thread_id IS NOT NULL)
    EXECUTE FUNCTION update_thread_workflow_on_email();

CREATE OR REPLACE FUNCTION wake_snoozed_threads()
RETURNS INTEGER AS $$
DECLARE
    woken_count INTEGER;
BEGIN
    UPDATE email_threads
    SET workflow_state = 'needs_response',
        snoozed_until = NULL,
        folder = 'inbox'
    WHERE workflow_state = 'snoozed' AND snoozed_until <= NOW();

    GET DIAGNOSTICS woken_count = ROW_COUNT;
    RETURN woken_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_conversation_key(
    p_email_account_id UUID,
    p_subject TEXT,
    p_from_email TEXT,
    p_message_id TEXT DEFAULT NULL,
    p_in_reply_to TEXT DEFAULT NULL,
    p_references TEXT[] DEFAULT NULL
) RETURNS VARCHAR(500) AS $$
DECLARE
    v_clean_subject TEXT;
BEGIN
    IF p_in_reply_to IS NOT NULL THEN
        RETURN md5(p_email_account_id::text || '::' || p_in_reply_to);
    END IF;

    IF p_references IS NOT NULL AND array_length(p_references, 1) > 0 THEN
        RETURN md5(p_email_account_id::text || '::' || p_references[1]);
    END IF;

    IF p_message_id IS NOT NULL THEN
        RETURN md5(p_email_account_id::text || '::' || p_message_id);
    END IF;

    v_clean_subject := LOWER(REGEXP_REPLACE(COALESCE(p_subject, ''), '^(Re:|Fwd:|RE:|FW:)\s*', '', 'gi'));
    RETURN md5(p_email_account_id::text || '::' || v_clean_subject || '::' || LOWER(COALESCE(p_from_email, '')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION update_thread_stats(p_thread_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE email_threads SET
        message_count = (SELECT COUNT(*) FROM emails WHERE thread_id = p_thread_id AND is_deleted = FALSE),
        unread_count = (
            SELECT COUNT(*) FROM emails
            WHERE thread_id = p_thread_id AND is_deleted = FALSE AND is_inbound = TRUE AND is_read = FALSE
        ),
        last_message_at = (
            SELECT MAX(COALESCE(sent_at, delivered_at, created_at))
            FROM emails WHERE thread_id = p_thread_id AND is_deleted = FALSE
        ),
        has_attachments = (
            SELECT EXISTS(
                SELECT 1 FROM emails
                WHERE thread_id = p_thread_id AND is_deleted = FALSE AND has_attachments = TRUE
            )
        ),
        updated_at = NOW()
    WHERE id = p_thread_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upsert_email_thread(
    p_email_account_id UUID,
    p_conversation_key VARCHAR(500),
    p_provider_thread_id VARCHAR(500),
    p_provider VARCHAR(20),
    p_subject VARCHAR(1000),
    p_participants JSONB,
    p_folder email_folder,
    p_has_attachments BOOLEAN DEFAULT FALSE,
    p_is_read BOOLEAN DEFAULT TRUE,
    p_last_message_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS UUID AS $$
DECLARE
    v_thread_id UUID;
BEGIN
    SELECT id INTO v_thread_id
    FROM email_threads
    WHERE email_account_id = p_email_account_id
      AND conversation_key = p_conversation_key
      AND is_deleted = FALSE
    LIMIT 1;

    IF v_thread_id IS NOT NULL THEN
        UPDATE email_threads SET
            message_count = message_count + 1,
            unread_count = CASE WHEN NOT p_is_read THEN unread_count + 1 ELSE unread_count END,
            last_message_at = GREATEST(last_message_at, p_last_message_at),
            has_attachments = has_attachments OR p_has_attachments,
            updated_at = NOW()
        WHERE id = v_thread_id;
        RETURN v_thread_id;
    END IF;

    INSERT INTO email_threads (
        email_account_id, conversation_key, provider_thread_id, provider,
        subject, participants, folder, has_attachments, is_read,
        message_count, unread_count, last_message_at
    ) VALUES (
        p_email_account_id, p_conversation_key, p_provider_thread_id, p_provider,
        p_subject, p_participants, p_folder, p_has_attachments, p_is_read,
        1, CASE WHEN p_is_read THEN 0 ELSE 1 END, p_last_message_at
    )
    RETURNING id INTO v_thread_id;

    RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql;

-- updated_at triggers
DROP TRIGGER IF EXISTS update_email_domains_updated_at ON email_domains;
CREATE TRIGGER update_email_domains_updated_at BEFORE UPDATE ON email_domains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_accounts_updated_at ON email_accounts;
CREATE TRIGGER update_email_accounts_updated_at BEFORE UPDATE ON email_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_threads_updated_at ON email_threads;
CREATE TRIGGER update_email_threads_updated_at BEFORE UPDATE ON email_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_emails_updated_at ON emails;
CREATE TRIGGER update_emails_updated_at BEFORE UPDATE ON emails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_labels_updated_at ON email_labels;
CREATE TRIGGER update_email_labels_updated_at BEFORE UPDATE ON email_labels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_saved_views_updated_at ON email_saved_views;
CREATE TRIGGER update_email_saved_views_updated_at BEFORE UPDATE ON email_saved_views
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_drafts_updated_at ON email_drafts;
CREATE TRIGGER update_email_drafts_updated_at BEFORE UPDATE ON email_drafts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_user_email_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_saved_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_email_drafts_updated_at ON user_email_drafts;
CREATE TRIGGER user_email_drafts_updated_at BEFORE UPDATE ON user_email_drafts
    FOR EACH ROW EXECUTE FUNCTION update_user_email_drafts_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW v_email_folder_counts AS
SELECT
    ea.id AS email_account_id,
    ea.user_id,
    et.folder,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE NOT et.is_read) AS unread_count
FROM email_accounts ea
LEFT JOIN email_threads et ON et.email_account_id = ea.id AND et.is_deleted = FALSE
WHERE ea.is_deleted = FALSE
GROUP BY ea.id, ea.user_id, et.folder;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_thread_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_notification_tokens ENABLE ROW LEVEL SECURITY;

-- Admins here take the place of the CRM's super_admin/admin roles.
CREATE OR REPLACE FUNCTION is_email_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
        WHERE auth_id = auth.uid() AND role IN ('admin', 'super_admin')
    );
$$;

-- Domains
DROP POLICY IF EXISTS email_domains_select ON email_domains;
DROP POLICY IF EXISTS email_domains_insert ON email_domains;
DROP POLICY IF EXISTS email_domains_update ON email_domains;
DROP POLICY IF EXISTS email_domains_delete ON email_domains;
CREATE POLICY email_domains_select ON email_domains FOR SELECT TO authenticated
    USING (created_by = get_current_user_id() OR is_shared = TRUE OR is_email_admin());
CREATE POLICY email_domains_insert ON email_domains FOR INSERT TO authenticated
    WITH CHECK (created_by = get_current_user_id());
CREATE POLICY email_domains_update ON email_domains FOR UPDATE TO authenticated
    USING (created_by = get_current_user_id() OR is_email_admin());
CREATE POLICY email_domains_delete ON email_domains FOR DELETE TO authenticated
    USING (created_by = get_current_user_id() OR is_email_admin());

-- Accounts
DROP POLICY IF EXISTS email_accounts_select ON email_accounts;
DROP POLICY IF EXISTS email_accounts_insert ON email_accounts;
DROP POLICY IF EXISTS email_accounts_update ON email_accounts;
DROP POLICY IF EXISTS email_accounts_delete ON email_accounts;
CREATE POLICY email_accounts_select ON email_accounts FOR SELECT TO authenticated
    USING (user_id = get_current_user_id() OR is_email_admin());
CREATE POLICY email_accounts_insert ON email_accounts FOR INSERT TO authenticated
    WITH CHECK (user_id = get_current_user_id());
CREATE POLICY email_accounts_update ON email_accounts FOR UPDATE TO authenticated
    USING (user_id = get_current_user_id() OR is_email_admin());
CREATE POLICY email_accounts_delete ON email_accounts FOR DELETE TO authenticated
    USING (user_id = get_current_user_id() OR is_email_admin());

-- Threads
DROP POLICY IF EXISTS email_threads_select ON email_threads;
DROP POLICY IF EXISTS email_threads_insert ON email_threads;
DROP POLICY IF EXISTS email_threads_update ON email_threads;
DROP POLICY IF EXISTS email_threads_delete ON email_threads;
CREATE POLICY email_threads_select ON email_threads FOR SELECT TO authenticated
    USING (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
           OR is_email_admin());
CREATE POLICY email_threads_insert ON email_threads FOR INSERT TO authenticated
    WITH CHECK (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id()));
CREATE POLICY email_threads_update ON email_threads FOR UPDATE TO authenticated
    USING (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
           OR is_email_admin());
CREATE POLICY email_threads_delete ON email_threads FOR DELETE TO authenticated
    USING (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
           OR is_email_admin());

-- Emails
DROP POLICY IF EXISTS emails_select ON emails;
DROP POLICY IF EXISTS emails_insert ON emails;
DROP POLICY IF EXISTS emails_update ON emails;
DROP POLICY IF EXISTS emails_delete ON emails;
CREATE POLICY emails_select ON emails FOR SELECT TO authenticated
    USING (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
           OR is_email_admin());
CREATE POLICY emails_insert ON emails FOR INSERT TO authenticated
    WITH CHECK (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id()));
CREATE POLICY emails_update ON emails FOR UPDATE TO authenticated
    USING (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
           OR is_email_admin());
CREATE POLICY emails_delete ON emails FOR DELETE TO authenticated
    USING (email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
           OR is_email_admin());

-- Attachments
DROP POLICY IF EXISTS email_attachments_select ON email_attachments;
DROP POLICY IF EXISTS email_attachments_insert ON email_attachments;
DROP POLICY IF EXISTS email_attachments_delete ON email_attachments;
CREATE POLICY email_attachments_select ON email_attachments FOR SELECT TO authenticated
    USING (email_id IN (
        SELECT e.id FROM emails e
        JOIN email_accounts ea ON e.email_account_id = ea.id
        WHERE ea.user_id = get_current_user_id()
    ) OR is_email_admin());
CREATE POLICY email_attachments_insert ON email_attachments FOR INSERT TO authenticated
    WITH CHECK (email_id IN (
        SELECT e.id FROM emails e
        JOIN email_accounts ea ON e.email_account_id = ea.id
        WHERE ea.user_id = get_current_user_id()
    ));
CREATE POLICY email_attachments_delete ON email_attachments FOR DELETE TO authenticated
    USING (email_id IN (
        SELECT e.id FROM emails e
        JOIN email_accounts ea ON e.email_account_id = ea.id
        WHERE ea.user_id = get_current_user_id()
    ) OR is_email_admin());

-- Events
DROP POLICY IF EXISTS email_events_select ON email_events;
CREATE POLICY email_events_select ON email_events FOR SELECT TO authenticated
    USING (email_id IN (
        SELECT e.id FROM emails e
        JOIN email_accounts ea ON e.email_account_id = ea.id
        WHERE ea.user_id = get_current_user_id()
    ) OR is_email_admin());

-- Templates: shared across the academy, as in the CRM.
DROP POLICY IF EXISTS email_templates_select ON email_templates;
DROP POLICY IF EXISTS email_templates_insert ON email_templates;
DROP POLICY IF EXISTS email_templates_update ON email_templates;
DROP POLICY IF EXISTS email_templates_delete ON email_templates;
CREATE POLICY email_templates_select ON email_templates FOR SELECT TO authenticated
    USING (is_deleted = FALSE);
CREATE POLICY email_templates_insert ON email_templates FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY email_templates_update ON email_templates FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY email_templates_delete ON email_templates FOR DELETE TO authenticated USING (TRUE);

-- Per-user tables, keyed directly on auth.uid()
DROP POLICY IF EXISTS email_drafts_all ON email_drafts;
CREATE POLICY email_drafts_all ON email_drafts FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_email_drafts_all ON user_email_drafts;
CREATE POLICY user_email_drafts_all ON user_email_drafts FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS email_labels_all ON email_labels;
CREATE POLICY email_labels_all ON email_labels FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS email_saved_views_select ON email_saved_views;
DROP POLICY IF EXISTS email_saved_views_insert ON email_saved_views;
DROP POLICY IF EXISTS email_saved_views_update ON email_saved_views;
DROP POLICY IF EXISTS email_saved_views_delete ON email_saved_views;
CREATE POLICY email_saved_views_select ON email_saved_views FOR SELECT TO authenticated
    USING (user_id = auth.uid());
CREATE POLICY email_saved_views_insert ON email_saved_views FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
CREATE POLICY email_saved_views_update ON email_saved_views FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
CREATE POLICY email_saved_views_delete ON email_saved_views FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND is_system = FALSE);

DROP POLICY IF EXISTS email_thread_labels_select ON email_thread_labels;
DROP POLICY IF EXISTS email_thread_labels_insert ON email_thread_labels;
DROP POLICY IF EXISTS email_thread_labels_delete ON email_thread_labels;
CREATE POLICY email_thread_labels_select ON email_thread_labels FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM email_threads et
        JOIN email_accounts ea ON et.email_account_id = ea.id
        WHERE et.id = thread_id AND ea.user_id = get_current_user_id()
    ));
CREATE POLICY email_thread_labels_insert ON email_thread_labels FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM email_threads et
        JOIN email_accounts ea ON et.email_account_id = ea.id
        WHERE et.id = thread_id AND ea.user_id = get_current_user_id()
    ));
CREATE POLICY email_thread_labels_delete ON email_thread_labels FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM email_threads et
        JOIN email_accounts ea ON et.email_account_id = ea.id
        WHERE et.id = thread_id AND ea.user_id = get_current_user_id()
    ));

DROP POLICY IF EXISTS email_notification_tokens_select ON email_notification_tokens;
CREATE POLICY email_notification_tokens_select ON email_notification_tokens FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- REALTIME
-- ============================================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE emails;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE email_threads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE email_drafts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-images', 'email-images', TRUE)
ON CONFLICT (id) DO NOTHING;

COMMIT;
