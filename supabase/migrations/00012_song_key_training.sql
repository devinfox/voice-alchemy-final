-- ============================================================================
-- Song Key Training Tables
-- Tracks user sessions practicing singing in specific musical keys
-- ============================================================================

-- Song Key Training Sessions
CREATE TABLE IF NOT EXISTS song_key_training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,

    -- Song info
    song_key TEXT NOT NULL,
    song_title TEXT,
    song_artist TEXT,
    song_bpm INTEGER,

    -- Performance metrics
    in_key_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    avg_cents_deviation DECIMAL(6,2) NOT NULL DEFAULT 0,
    total_notes INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_in_key_percentage CHECK (in_key_percentage >= 0 AND in_key_percentage <= 100)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_song_key_sessions_user_date
    ON song_key_training_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_song_key_sessions_key
    ON song_key_training_sessions(user_id, song_key);

-- Weekly Progress Aggregates
CREATE TABLE IF NOT EXISTS song_key_weekly_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,

    total_sessions INTEGER NOT NULL DEFAULT 0,
    avg_in_key_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    total_practice_seconds INTEGER NOT NULL DEFAULT 0,

    -- Keys practiced this week
    keys_practiced TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_week UNIQUE (user_id, week_start)
);

-- RLS Policies
ALTER TABLE song_key_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_key_weekly_progress ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own song key sessions"
    ON song_key_training_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own song key sessions"
    ON song_key_training_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own song key sessions"
    ON song_key_training_sessions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own song key sessions"
    ON song_key_training_sessions FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own weekly progress"
    ON song_key_weekly_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own weekly progress"
    ON song_key_weekly_progress FOR ALL
    USING (auth.uid() = user_id);

-- Function to update weekly progress
CREATE OR REPLACE FUNCTION update_song_key_weekly_progress()
RETURNS TRIGGER AS $$
DECLARE
    week_start_date DATE;
    week_stats RECORD;
BEGIN
    -- Calculate week start (Sunday)
    week_start_date := DATE_TRUNC('week', NEW.session_date)::DATE;

    -- Calculate weekly statistics
    SELECT
        COUNT(*) as total_sessions,
        COALESCE(AVG(in_key_percentage), 0) as avg_percentage,
        COALESCE(SUM(duration_seconds), 0) as total_seconds,
        ARRAY_AGG(DISTINCT song_key) as keys
    INTO week_stats
    FROM song_key_training_sessions
    WHERE user_id = NEW.user_id
    AND session_date >= week_start_date
    AND session_date < week_start_date + INTERVAL '7 days';

    -- Upsert weekly progress
    INSERT INTO song_key_weekly_progress (
        user_id,
        week_start,
        total_sessions,
        avg_in_key_percentage,
        total_practice_seconds,
        keys_practiced,
        updated_at
    )
    VALUES (
        NEW.user_id,
        week_start_date,
        week_stats.total_sessions,
        week_stats.avg_percentage,
        week_stats.total_seconds,
        week_stats.keys,
        NOW()
    )
    ON CONFLICT (user_id, week_start)
    DO UPDATE SET
        total_sessions = EXCLUDED.total_sessions,
        avg_in_key_percentage = EXCLUDED.avg_in_key_percentage,
        total_practice_seconds = EXCLUDED.total_practice_seconds,
        keys_practiced = EXCLUDED.keys_practiced,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update weekly progress after session insert
DROP TRIGGER IF EXISTS trigger_update_song_key_weekly ON song_key_training_sessions;
CREATE TRIGGER trigger_update_song_key_weekly
    AFTER INSERT ON song_key_training_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_song_key_weekly_progress();

-- Add comments
COMMENT ON TABLE song_key_training_sessions IS 'Tracks individual song key training sessions';
COMMENT ON TABLE song_key_weekly_progress IS 'Aggregated weekly progress for song key training';
COMMENT ON COLUMN song_key_training_sessions.song_key IS 'Musical key (e.g., C, Am, F#)';
COMMENT ON COLUMN song_key_training_sessions.in_key_percentage IS 'Percentage of notes that were in the target key';
