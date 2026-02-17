-- ============================================================================
-- SONG PITCH TRAINING TABLES
-- Migration: 00008_song_pitch_training.sql
-- ============================================================================

-- ============================================================================
-- TABLE: song_pitch_sessions
-- Stores song pitch training sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS song_pitch_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Session timing
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Song info
    song_id VARCHAR(50),
    song_title VARCHAR(255),
    song_artist VARCHAR(255),
    song_key VARCHAR(10),
    song_bpm INTEGER,

    -- Session metrics
    total_notes INTEGER DEFAULT 0,
    notes_in_key INTEGER DEFAULT 0,
    notes_out_of_key INTEGER DEFAULT 0,
    accuracy_percent DECIMAL(5,2),
    avg_cents_off DECIMAL(6,2),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: song_pitch_weekly_progress
-- Pre-computed weekly aggregates for song pitch training
-- ============================================================================
CREATE TABLE IF NOT EXISTS song_pitch_weekly_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Week identification (Monday of the week)
    week_start_date DATE NOT NULL,

    -- Weekly averages
    avg_accuracy_percent DECIMAL(5,2),
    avg_cents_off DECIMAL(6,2),
    total_notes INTEGER DEFAULT 0,
    total_notes_in_key INTEGER DEFAULT 0,

    -- Weekly totals
    total_sessions INTEGER DEFAULT 0,
    total_songs_practiced INTEGER DEFAULT 0,
    total_practice_time_seconds INTEGER DEFAULT 0,

    -- Comparison to previous week (percentages)
    accuracy_change DECIMAL(6,2),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, week_start_date)
);

-- ============================================================================
-- INDEXES for song pitch tables
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_song_sessions_user_date
    ON song_pitch_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_song_weekly_user_week
    ON song_pitch_weekly_progress(user_id, week_start_date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY for song pitch tables
-- ============================================================================
ALTER TABLE song_pitch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_pitch_weekly_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own song sessions" ON song_pitch_sessions;
DROP POLICY IF EXISTS "Users can insert own song sessions" ON song_pitch_sessions;
DROP POLICY IF EXISTS "Users can update own song sessions" ON song_pitch_sessions;
DROP POLICY IF EXISTS "Users can delete own song sessions" ON song_pitch_sessions;
DROP POLICY IF EXISTS "Users can view own song weekly progress" ON song_pitch_weekly_progress;
DROP POLICY IF EXISTS "Teachers can view student song sessions" ON song_pitch_sessions;
DROP POLICY IF EXISTS "Teachers can view student song weekly progress" ON song_pitch_weekly_progress;

CREATE POLICY "Users can view own song sessions"
    ON song_pitch_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own song sessions"
    ON song_pitch_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own song sessions"
    ON song_pitch_sessions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own song sessions"
    ON song_pitch_sessions FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own song weekly progress"
    ON song_pitch_weekly_progress FOR SELECT
    USING (auth.uid() = user_id);

-- Teachers can view student song sessions
CREATE POLICY "Teachers can view student song sessions"
    ON song_pitch_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.student_id = song_pitch_sessions.user_id
            AND bookings.instructor_id = auth.uid()
            AND bookings.status = 'confirmed'
        )
    );

CREATE POLICY "Teachers can view student song weekly progress"
    ON song_pitch_weekly_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.student_id = song_pitch_weekly_progress.user_id
            AND bookings.instructor_id = auth.uid()
            AND bookings.status = 'confirmed'
        )
    );

-- ============================================================================
-- FUNCTION: Calculate song pitch weekly progress
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_song_weekly_progress(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
DECLARE
    v_current_week RECORD;
    v_previous_week RECORD;
BEGIN
    -- Get current week aggregates
    SELECT
        AVG(accuracy_percent) as avg_accuracy,
        AVG(avg_cents_off) as avg_cents,
        SUM(total_notes) as total_notes,
        SUM(notes_in_key) as total_in_key,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT song_id) as songs_practiced,
        SUM(duration_seconds) as total_time
    INTO v_current_week
    FROM song_pitch_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    -- Get previous week for comparison
    SELECT AVG(accuracy_percent) as avg_accuracy
    INTO v_previous_week
    FROM song_pitch_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start - INTERVAL '7 days'
    AND session_date < p_week_start;

    -- Upsert weekly progress
    INSERT INTO song_pitch_weekly_progress (
        user_id, week_start_date,
        avg_accuracy_percent, avg_cents_off,
        total_notes, total_notes_in_key,
        total_sessions, total_songs_practiced, total_practice_time_seconds,
        accuracy_change,
        updated_at
    ) VALUES (
        p_user_id, p_week_start,
        v_current_week.avg_accuracy, v_current_week.avg_cents,
        v_current_week.total_notes, v_current_week.total_in_key,
        v_current_week.total_sessions, v_current_week.songs_practiced,
        v_current_week.total_time,
        CASE WHEN v_previous_week.avg_accuracy > 0
            THEN ((v_current_week.avg_accuracy - v_previous_week.avg_accuracy) / v_previous_week.avg_accuracy * 100)
            ELSE NULL END,
        NOW()
    )
    ON CONFLICT (user_id, week_start_date) DO UPDATE SET
        avg_accuracy_percent = EXCLUDED.avg_accuracy_percent,
        avg_cents_off = EXCLUDED.avg_cents_off,
        total_notes = EXCLUDED.total_notes,
        total_notes_in_key = EXCLUDED.total_notes_in_key,
        total_sessions = EXCLUDED.total_sessions,
        total_songs_practiced = EXCLUDED.total_songs_practiced,
        total_practice_time_seconds = EXCLUDED.total_practice_time_seconds,
        accuracy_change = EXCLUDED.accuracy_change,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for song sessions
CREATE OR REPLACE FUNCTION trigger_update_song_weekly_progress()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_song_weekly_progress(
        NEW.user_id,
        DATE_TRUNC('week', NEW.session_date)::DATE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_song_session_update_weekly ON song_pitch_sessions;
CREATE TRIGGER trg_song_session_update_weekly
    AFTER INSERT OR UPDATE ON song_pitch_sessions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_song_weekly_progress();
