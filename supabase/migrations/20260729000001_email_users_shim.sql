-- ============================================================================
-- Users / organizations shim for the ported email system
-- ============================================================================
-- The email subsystem was lifted from the ByeTalk/Citadel CRM, where identity
-- lives in a `users` table keyed by `auth_id` and scoped by `organization_id`.
-- Every ported route and RLS policy does one of:
--
--     .from('users').select('id, organization_id').eq('auth_id', <auth uid>)
--     USING (... = get_current_user_id())
--
-- This app's identity table is `profiles`, whose id IS the auth user id. Rather
-- than rewrite ~53 call sites and every ported policy (and re-introduce drift
-- against the CRM the code came from), we give this database the same shape.
--
-- The shim is deliberately thin:
--   * users.id == users.auth_id == auth.users.id == profiles.id
--     One value everywhere, so a join in either direction works and FKs to
--     either table stay valid.
--   * A single default organization. This app is single-tenant; the column
--     exists so the ported org-stamping code has somewhere to write.
--
-- profiles remains the source of truth for app-facing identity. users is a
-- mirror maintained by trigger, not a second place to edit a person's name.
-- ============================================================================

BEGIN;

-- --- organizations ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- The single tenant. Fixed UUID so seeds/backfills are reproducible.
INSERT INTO organizations (id, name, domain)
VALUES (
    '00000000-0000-4000-a000-000000000001',
    'Voice Alchemy Academy',
    'voicealchemyacademy.com'
)
ON CONFLICT (id) DO NOTHING;

-- --- users ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    name VARCHAR(200),
    role VARCHAR(50) NOT NULL DEFAULT 'student',
    timezone VARCHAR(50) DEFAULT 'America/New_York',

    -- Notification preferences (CRM migration 00164). The ported notification
    -- service reads these; without them it errors on a missing column.
    personal_email VARCHAR(255),
    personal_phone VARCHAR(20),
    email_notification_enabled BOOLEAN DEFAULT FALSE,
    sms_notification_enabled BOOLEAN DEFAULT FALSE,
    notification_quiet_hours_start TIME,
    notification_quiet_hours_end TIME,

    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- --- get_current_user_id() --------------------------------------------------
-- Every ported RLS policy calls this. SECURITY DEFINER + STABLE so it can be
-- used inside policies without recursing through users' own RLS.
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- --- keep users in step with auth.users / profiles ---------------------------
CREATE OR REPLACE FUNCTION sync_user_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    meta_name TEXT;
BEGIN
    meta_name := COALESCE(
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'full_name'
    );

    INSERT INTO public.users (id, auth_id, organization_id, email, name, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.id,
        '00000000-0000-4000-a000-000000000001',
        NEW.email,
        meta_name,
        COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(COALESCE(meta_name, ''), ' ', 1)),
        COALESCE(NEW.raw_user_meta_data->>'last_name', NULLIF(split_part(COALESCE(meta_name, ''), ' ', 2), ''))
    )
    ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_sync_users ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_users
    AFTER INSERT OR UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION sync_user_from_auth();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --- backfill existing accounts ---------------------------------------------
-- Name/role come from profiles where present, so the mirror starts accurate.
INSERT INTO users (id, auth_id, organization_id, email, name, first_name, last_name, role, timezone)
SELECT
    au.id,
    au.id,
    '00000000-0000-4000-a000-000000000001',
    au.email,
    p.name,
    p.first_name,
    p.last_name,
    COALESCE(p.role, 'student'),
    COALESCE(p.timezone, 'America/New_York')
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
ON CONFLICT (id) DO NOTHING;

-- --- RLS --------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_update_self ON users;
CREATE POLICY users_select ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY users_update_self ON users FOR UPDATE TO authenticated
    USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS organizations_select ON organizations;
CREATE POLICY organizations_select ON organizations FOR SELECT TO authenticated USING (true);

COMMIT;
