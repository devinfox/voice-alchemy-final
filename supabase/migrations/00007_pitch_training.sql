-- ============================================================================
-- Migration: Pitch Training Session Tracking
-- Description: Tables for tracking pitch training sessions, note metrics,
--              weekly progress, and AI-generated feedback
-- ============================================================================

-- ============================================================================
-- TABLE: pitch_training_sessions
-- Stores the best session per day per user
-- ============================================================================
CREATE TABLE IF NOT EXISTS pitch_training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Session timing
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Aggregated session metrics (averages across all notes)
    avg_pitch_accuracy DECIMAL(5,2),        -- 0-100 percentage
    avg_pitch_onset_speed_ms INTEGER,        -- milliseconds to hit correct pitch
    avg_pitch_stability DECIMAL(5,2),        -- 0-100 percentage (lower variance = higher)
    avg_in_tune_sustain_ms INTEGER,          -- milliseconds sustained in tune

    -- Overall session score (weighted average of metrics)
    overall_score DECIMAL(5,2),

    -- Session metadata
    total_notes_attempted INTEGER DEFAULT 0,
    total_notes_matched INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Only one best session per user per day
    UNIQUE(user_id, session_date)
);

-- ============================================================================
-- TABLE: pitch_training_note_metrics
-- Stores per-note metrics within a session (best attempt per note)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pitch_training_note_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES pitch_training_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Note identification
    note_name VARCHAR(3) NOT NULL,           -- e.g., 'C', 'C#', 'D'
    octave INTEGER NOT NULL,                  -- 0-8
    target_frequency DECIMAL(10,2),           -- Hz

    -- Metrics for this note attempt
    pitch_accuracy DECIMAL(5,2),              -- 0-100 percentage
    pitch_onset_speed_ms INTEGER,             -- ms to hit correct pitch from start
    pitch_stability DECIMAL(5,2),             -- 0-100 percentage
    in_tune_sustain_ms INTEGER,               -- ms sustained within acceptable range

    -- Raw data for analysis
    avg_detected_frequency DECIMAL(10,2),     -- Hz
    avg_cents_deviation DECIMAL(6,2),         -- cents off from target
    max_cents_deviation DECIMAL(6,2),
    min_cents_deviation DECIMAL(6,2),

    -- Attempt tracking
    attempt_number INTEGER DEFAULT 1,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One best record per note per session
    UNIQUE(session_id, note_name, octave)
);

-- ============================================================================
-- TABLE: pitch_training_weekly_progress
-- Pre-computed weekly aggregates for quick progress display
-- ============================================================================
CREATE TABLE IF NOT EXISTS pitch_training_weekly_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Week identification (Monday of the week)
    week_start_date DATE NOT NULL,

    -- Weekly averages
    avg_pitch_accuracy DECIMAL(5,2),
    avg_pitch_onset_speed_ms INTEGER,
    avg_pitch_stability DECIMAL(5,2),
    avg_in_tune_sustain_ms INTEGER,
    avg_overall_score DECIMAL(5,2),

    -- Weekly totals
    total_sessions INTEGER DEFAULT 0,
    total_notes_attempted INTEGER DEFAULT 0,
    total_practice_time_seconds INTEGER DEFAULT 0,

    -- Comparison to previous week (percentages)
    pitch_accuracy_change DECIMAL(6,2),       -- e.g., +5.2 means 5.2% improvement
    pitch_onset_speed_change DECIMAL(6,2),
    pitch_stability_change DECIMAL(6,2),
    in_tune_sustain_change DECIMAL(6,2),
    overall_score_change DECIMAL(6,2),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, week_start_date)
);

-- ============================================================================
-- TABLE: pitch_training_ai_feedback
-- AI-generated personalized feedback based on training data
-- ============================================================================
CREATE TABLE IF NOT EXISTS pitch_training_ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Feedback context
    feedback_type VARCHAR(50) NOT NULL,       -- 'session', 'weekly', 'milestone'
    reference_id UUID,                         -- session_id or weekly_progress_id

    -- AI-generated content
    summary TEXT,                              -- Brief summary of performance
    strengths TEXT[],                          -- Array of identified strengths
    areas_for_improvement TEXT[],              -- Array of areas to work on
    personalized_tips TEXT[],                  -- Actionable tips
    recommended_exercises TEXT[],              -- Suggested exercises

    -- Context used for generation
    context_data JSONB,                        -- Raw data sent to AI

    -- Timestamps
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: pitch_training_raw_samples
-- Optional: Store raw pitch samples for detailed analysis
-- (Can be purged periodically to save space)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pitch_training_raw_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES pitch_training_sessions(id) ON DELETE CASCADE,
    note_metric_id UUID REFERENCES pitch_training_note_metrics(id) ON DELETE CASCADE,

    -- Sample data
    detected_frequency DECIMAL(10,2),
    cents_deviation DECIMAL(6,2),
    rms_volume DECIMAL(8,6),
    sample_timestamp_ms INTEGER,              -- ms from note attempt start

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient sample queries
CREATE INDEX IF NOT EXISTS idx_raw_samples_note_metric
    ON pitch_training_raw_samples(note_metric_id);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pitch_sessions_user_date
    ON pitch_training_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_pitch_note_metrics_session
    ON pitch_training_note_metrics(session_id);

CREATE INDEX IF NOT EXISTS idx_pitch_weekly_user_week
    ON pitch_training_weekly_progress(user_id, week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_pitch_ai_feedback_user
    ON pitch_training_ai_feedback(user_id, generated_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE pitch_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_training_note_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_training_weekly_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_training_ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_training_raw_samples ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own pitch sessions"
    ON pitch_training_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pitch sessions"
    ON pitch_training_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pitch sessions"
    ON pitch_training_sessions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pitch sessions"
    ON pitch_training_sessions FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own note metrics"
    ON pitch_training_note_metrics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own note metrics"
    ON pitch_training_note_metrics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own note metrics"
    ON pitch_training_note_metrics FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own weekly progress"
    ON pitch_training_weekly_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own AI feedback"
    ON pitch_training_ai_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI feedback"
    ON pitch_training_ai_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own raw samples"
    ON pitch_training_raw_samples FOR SELECT
    USING (session_id IN (
        SELECT id FROM pitch_training_sessions WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own raw samples"
    ON pitch_training_raw_samples FOR INSERT
    WITH CHECK (session_id IN (
        SELECT id FROM pitch_training_sessions WHERE user_id = auth.uid()
    ));

-- Teachers can view their students' data
CREATE POLICY "Teachers can view student pitch sessions"
    ON pitch_training_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.student_id = pitch_training_sessions.user_id
            AND bookings.instructor_id = auth.uid()
            AND bookings.status = 'confirmed'
        )
    );

CREATE POLICY "Teachers can view student weekly progress"
    ON pitch_training_weekly_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.student_id = pitch_training_weekly_progress.user_id
            AND bookings.instructor_id = auth.uid()
            AND bookings.status = 'confirmed'
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate weekly progress
CREATE OR REPLACE FUNCTION calculate_weekly_progress(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
DECLARE
    v_current_week RECORD;
    v_previous_week RECORD;
BEGIN
    -- Get current week averages
    SELECT
        AVG(avg_pitch_accuracy) as avg_accuracy,
        AVG(avg_pitch_onset_speed_ms) as avg_onset,
        AVG(avg_pitch_stability) as avg_stability,
        AVG(avg_in_tune_sustain_ms) as avg_sustain,
        AVG(overall_score) as avg_score,
        COUNT(*) as total_sessions,
        SUM(total_notes_attempted) as total_notes,
        SUM(duration_seconds) as total_time
    INTO v_current_week
    FROM pitch_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    -- Get previous week averages
    SELECT
        AVG(avg_pitch_accuracy) as avg_accuracy,
        AVG(avg_pitch_onset_speed_ms) as avg_onset,
        AVG(avg_pitch_stability) as avg_stability,
        AVG(avg_in_tune_sustain_ms) as avg_sustain,
        AVG(overall_score) as avg_score
    INTO v_previous_week
    FROM pitch_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start - INTERVAL '7 days'
    AND session_date < p_week_start;

    -- Upsert weekly progress
    INSERT INTO pitch_training_weekly_progress (
        user_id, week_start_date,
        avg_pitch_accuracy, avg_pitch_onset_speed_ms, avg_pitch_stability,
        avg_in_tune_sustain_ms, avg_overall_score,
        total_sessions, total_notes_attempted, total_practice_time_seconds,
        pitch_accuracy_change, pitch_onset_speed_change, pitch_stability_change,
        in_tune_sustain_change, overall_score_change,
        updated_at
    ) VALUES (
        p_user_id, p_week_start,
        v_current_week.avg_accuracy, v_current_week.avg_onset, v_current_week.avg_stability,
        v_current_week.avg_sustain, v_current_week.avg_score,
        v_current_week.total_sessions, v_current_week.total_notes,
        v_current_week.total_time,
        CASE WHEN v_previous_week.avg_accuracy > 0
            THEN ((v_current_week.avg_accuracy - v_previous_week.avg_accuracy) / v_previous_week.avg_accuracy * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_onset > 0
            THEN ((v_previous_week.avg_onset - v_current_week.avg_onset) / v_previous_week.avg_onset * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_stability > 0
            THEN ((v_current_week.avg_stability - v_previous_week.avg_stability) / v_previous_week.avg_stability * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_sustain > 0
            THEN ((v_current_week.avg_sustain - v_previous_week.avg_sustain) / v_previous_week.avg_sustain * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_score > 0
            THEN ((v_current_week.avg_score - v_previous_week.avg_score) / v_previous_week.avg_score * 100)
            ELSE NULL END,
        NOW()
    )
    ON CONFLICT (user_id, week_start_date) DO UPDATE SET
        avg_pitch_accuracy = EXCLUDED.avg_pitch_accuracy,
        avg_pitch_onset_speed_ms = EXCLUDED.avg_pitch_onset_speed_ms,
        avg_pitch_stability = EXCLUDED.avg_pitch_stability,
        avg_in_tune_sustain_ms = EXCLUDED.avg_in_tune_sustain_ms,
        avg_overall_score = EXCLUDED.avg_overall_score,
        total_sessions = EXCLUDED.total_sessions,
        total_notes_attempted = EXCLUDED.total_notes_attempted,
        total_practice_time_seconds = EXCLUDED.total_practice_time_seconds,
        pitch_accuracy_change = EXCLUDED.pitch_accuracy_change,
        pitch_onset_speed_change = EXCLUDED.pitch_onset_speed_change,
        pitch_stability_change = EXCLUDED.pitch_stability_change,
        in_tune_sustain_change = EXCLUDED.in_tune_sustain_change,
        overall_score_change = EXCLUDED.overall_score_change,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update weekly progress when session is saved
CREATE OR REPLACE FUNCTION trigger_update_weekly_progress()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_weekly_progress(
        NEW.user_id,
        DATE_TRUNC('week', NEW.session_date)::DATE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_update_weekly ON pitch_training_sessions;
CREATE TRIGGER trg_session_update_weekly
    AFTER INSERT OR UPDATE ON pitch_training_sessions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_weekly_progress();

-- ============================================================================
-- ENABLE REALTIME (optional, for live updates)
-- ============================================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE pitch_training_sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE pitch_training_note_metrics;

-- ============================================================================
-- SONG PITCH TRAINING TABLES
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
