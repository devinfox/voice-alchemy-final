-- =============================================================================
-- Training sessions: community "Zoom-style" rooms hosted by a teacher.
-- Anyone with the link can ask to join with first name, last name and email;
-- the host invites (pre-approves by email) or admits people from a waiting
-- room, then talks, shares a screen, and runs the session. Same WebRTC mesh
-- as recitals; separate tables so the two features never collide.
-- =============================================================================

CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
    join_code TEXT NOT NULL UNIQUE,
    -- { waitingRoom: bool, audienceVideo: bool, allowSelfUnmute: bool, uplinkKbps: number }
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_host ON training_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);

CREATE TABLE IF NOT EXISTS training_session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT,
    role TEXT NOT NULL DEFAULT 'attendee' CHECK (role IN ('host', 'attendee')),
    -- Pre-approved by the host (skips the waiting room when the email matches).
    invited BOOLEAN NOT NULL DEFAULT false,
    admitted_at TIMESTAMPTZ,
    denied_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_participants_session ON training_session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_training_participants_email ON training_session_participants(session_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_participants_profile
    ON training_session_participants(session_id, profile_id) WHERE profile_id IS NOT NULL;

DROP TRIGGER IF EXISTS training_sessions_set_updated_at ON training_sessions;
CREATE TRIGGER training_sessions_set_updated_at
    BEFORE UPDATE ON training_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_session_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_training_host(p_session_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM training_sessions t
        WHERE t.id = p_session_id
          AND (t.host_id = auth.uid()
               OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS training_sessions_select ON training_sessions;
CREATE POLICY training_sessions_select ON training_sessions FOR SELECT
    USING (is_training_host(id) OR EXISTS (
        SELECT 1 FROM training_session_participants tp
        WHERE tp.session_id = training_sessions.id AND tp.profile_id = auth.uid()
    ));
DROP POLICY IF EXISTS training_sessions_insert ON training_sessions;
CREATE POLICY training_sessions_insert ON training_sessions FOR INSERT
    WITH CHECK (host_id = auth.uid() AND EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'instructor', 'admin')
    ));
DROP POLICY IF EXISTS training_sessions_update ON training_sessions;
CREATE POLICY training_sessions_update ON training_sessions FOR UPDATE
    USING (is_training_host(id)) WITH CHECK (is_training_host(id));
DROP POLICY IF EXISTS training_sessions_delete ON training_sessions;
CREATE POLICY training_sessions_delete ON training_sessions FOR DELETE USING (is_training_host(id));

DROP POLICY IF EXISTS training_participants_all ON training_session_participants;
CREATE POLICY training_participants_all ON training_session_participants FOR ALL
    USING (is_training_host(session_id)) WITH CHECK (is_training_host(session_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON training_sessions, training_session_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_sessions, training_session_participants TO service_role;
