-- =============================================================================
-- Recitals: host-led group video performances on the in-app WebRTC mesh.
--
-- A recital is a scheduled room owned by a teacher (the host). Guests join by
-- join code, optionally without an account. The host builds a program of
-- performances and puts one performer "on stage" at a time; everyone else is
-- muted by default while a performance is running.
--
-- Signaling/media live in Supabase Realtime + browser WebRTC — nothing here
-- stores media. Recordings (performer-local pristine captures and host-side
-- archives) land in the private `recital-recordings` bucket.
-- =============================================================================

CREATE TABLE IF NOT EXISTS recitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 90,
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
    join_code TEXT NOT NULL UNIQUE,
    current_performance_id UUID,
    -- { audienceVideo: bool, localRecording: bool, hostArchive: bool,
    --   performerUplinkKbps: number, allowSelfUnmute: bool }
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recitals_host ON recitals(host_id);
CREATE INDEX IF NOT EXISTS idx_recitals_status ON recitals(status);
CREATE INDEX IF NOT EXISTS idx_recitals_scheduled ON recitals(scheduled_at);

CREATE TABLE IF NOT EXISTS recital_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recital_id UUID NOT NULL REFERENCES recitals(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'audience'
        CHECK (role IN ('host', 'audience')),
    -- { rawPeakDb, verdict, trimDb, deviceLabel, isBluetooth, headphones, at }
    soundcheck JSONB,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recital_participants_recital ON recital_participants(recital_id);
CREATE INDEX IF NOT EXISTS idx_recital_participants_profile ON recital_participants(profile_id) WHERE profile_id IS NOT NULL;
-- One row per account per recital; guests (profile_id NULL) can repeat.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recital_participants_profile
    ON recital_participants(recital_id, profile_id) WHERE profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS recital_performances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recital_id UUID NOT NULL REFERENCES recitals(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES recital_participants(id) ON DELETE SET NULL,
    performer_name TEXT NOT NULL,
    song_title TEXT NOT NULL,
    composer TEXT,
    notes TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'performing', 'done', 'skipped')),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recital_performances_recital
    ON recital_performances(recital_id, order_index);

ALTER TABLE recitals
    DROP CONSTRAINT IF EXISTS recitals_current_performance_fk;
ALTER TABLE recitals
    ADD CONSTRAINT recitals_current_performance_fk
    FOREIGN KEY (current_performance_id) REFERENCES recital_performances(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recital_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recital_id UUID NOT NULL REFERENCES recitals(id) ON DELETE CASCADE,
    performance_id UUID REFERENCES recital_performances(id) ON DELETE SET NULL,
    participant_id UUID REFERENCES recital_participants(id) ON DELETE SET NULL,
    -- 'performer-local': pristine capture on the singer's own device
    -- 'host-archive':    what the host received over the network
    kind TEXT NOT NULL CHECK (kind IN ('performer-local', 'host-archive')),
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size BIGINT,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recital_recordings_recital ON recital_recordings(recital_id);

-- updated_at maintenance (function already exists from earlier migrations,
-- but recreate defensively so this file runs standalone)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recitals_set_updated_at ON recitals;
CREATE TRIGGER recitals_set_updated_at
    BEFORE UPDATE ON recitals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Row level security. Guests never touch these tables directly: every guest
-- path goes through API routes using the service role. Logged-in students can
-- read recitals they are part of; hosts own theirs outright.
-- -----------------------------------------------------------------------------
ALTER TABLE recitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE recital_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE recital_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE recital_recordings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_recital_host(p_recital_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM recitals r
        WHERE r.id = p_recital_id
          AND (r.host_id = auth.uid()
               OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_recital_member(p_recital_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM recital_participants rp
        WHERE rp.recital_id = p_recital_id AND rp.profile_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- recitals
DROP POLICY IF EXISTS recitals_select ON recitals;
CREATE POLICY recitals_select ON recitals FOR SELECT
    USING (is_recital_host(id) OR is_recital_member(id)
           -- students may see upcoming/live recitals hosted by their teachers
           OR (status IN ('scheduled', 'live') AND EXISTS (
                SELECT 1 FROM bookings b
                WHERE b.student_id = auth.uid() AND b.instructor_id = recitals.host_id
           )));
DROP POLICY IF EXISTS recitals_insert ON recitals;
CREATE POLICY recitals_insert ON recitals FOR INSERT
    WITH CHECK (host_id = auth.uid() AND EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'instructor', 'admin')
    ));
DROP POLICY IF EXISTS recitals_update ON recitals;
CREATE POLICY recitals_update ON recitals FOR UPDATE
    USING (is_recital_host(id)) WITH CHECK (is_recital_host(id));
DROP POLICY IF EXISTS recitals_delete ON recitals;
CREATE POLICY recitals_delete ON recitals FOR DELETE USING (is_recital_host(id));

-- participants
DROP POLICY IF EXISTS recital_participants_select ON recital_participants;
CREATE POLICY recital_participants_select ON recital_participants FOR SELECT
    USING (is_recital_host(recital_id) OR is_recital_member(recital_id));
DROP POLICY IF EXISTS recital_participants_write ON recital_participants;
CREATE POLICY recital_participants_write ON recital_participants FOR ALL
    USING (is_recital_host(recital_id)) WITH CHECK (is_recital_host(recital_id));

-- performances
DROP POLICY IF EXISTS recital_performances_select ON recital_performances;
CREATE POLICY recital_performances_select ON recital_performances FOR SELECT
    USING (is_recital_host(recital_id) OR is_recital_member(recital_id));
DROP POLICY IF EXISTS recital_performances_write ON recital_performances;
CREATE POLICY recital_performances_write ON recital_performances FOR ALL
    USING (is_recital_host(recital_id)) WITH CHECK (is_recital_host(recital_id));

-- recordings: host sees everything, a performer sees their own
DROP POLICY IF EXISTS recital_recordings_select ON recital_recordings;
CREATE POLICY recital_recordings_select ON recital_recordings FOR SELECT
    USING (is_recital_host(recital_id) OR EXISTS (
        SELECT 1 FROM recital_participants rp
        WHERE rp.id = recital_recordings.participant_id AND rp.profile_id = auth.uid()
    ));
DROP POLICY IF EXISTS recital_recordings_write ON recital_recordings;
CREATE POLICY recital_recordings_write ON recital_recordings FOR ALL
    USING (is_recital_host(recital_id)) WITH CHECK (is_recital_host(recital_id));

-- Private bucket for recital recordings. All uploads go through signed
-- upload URLs minted server-side, so no storage policies are needed for anon.
INSERT INTO storage.buckets (id, name, public)
VALUES ('recital-recordings', 'recital-recordings', false)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON recitals, recital_participants, recital_performances, recital_recordings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recitals, recital_participants, recital_performances, recital_recordings TO service_role;
