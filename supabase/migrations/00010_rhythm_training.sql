-- ============================================================================
-- Migration: Rhythm Training Session Tracking
-- Description: Tables for tracking rhythm/BPM training sessions, beat metrics,
--              weekly progress for timing and rhythm analysis
-- ============================================================================

-- ============================================================================
-- TABLE: rhythm_training_sessions
-- Stores rhythm training sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS rhythm_training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Session timing
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Session settings
    bpm INTEGER NOT NULL,
    time_signature VARCHAR(10) NOT NULL DEFAULT '4/4',

    -- Aggregated session metrics
    total_beats INTEGER DEFAULT 0,
    on_beat_count INTEGER DEFAULT 0,
    early_count INTEGER DEFAULT 0,
    late_count INTEGER DEFAULT 0,
    missed_count INTEGER DEFAULT 0,

    -- Timing metrics
    avg_timing_offset_ms DECIMAL(8,2),          -- Average ms off from expected beat
    timing_consistency DECIMAL(5,2),             -- 0-100 percentage (lower variance = higher)
    on_beat_percent DECIMAL(5,2),                -- Percentage of beats hit on time

    -- Streak tracking
    best_streak INTEGER DEFAULT 0,

    -- Overall session score (weighted average of metrics)
    overall_score DECIMAL(5,2),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: rhythm_training_beat_metrics
-- Stores per-beat timing data within a session
-- ============================================================================
CREATE TABLE IF NOT EXISTS rhythm_training_beat_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES rhythm_training_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Beat identification
    beat_number INTEGER NOT NULL,
    expected_time_ms BIGINT NOT NULL,
    actual_time_ms BIGINT,

    -- Timing metrics
    timing_offset_ms DECIMAL(8,2),               -- Positive = late, Negative = early
    timing_result VARCHAR(20) NOT NULL,          -- 'on-beat', 'early', 'late', 'missed'

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per beat per session
    UNIQUE(session_id, beat_number)
);

-- ============================================================================
-- TABLE: rhythm_training_weekly_progress
-- Pre-computed weekly aggregates for quick progress display
-- ============================================================================
CREATE TABLE IF NOT EXISTS rhythm_training_weekly_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Week identification (Monday of the week)
    week_start_date DATE NOT NULL,

    -- Weekly averages
    avg_timing_offset_ms DECIMAL(8,2),
    avg_timing_consistency DECIMAL(5,2),
    avg_on_beat_percent DECIMAL(5,2),
    avg_overall_score DECIMAL(5,2),

    -- Weekly totals
    total_sessions INTEGER DEFAULT 0,
    total_beats_attempted INTEGER DEFAULT 0,
    total_practice_time_seconds INTEGER DEFAULT 0,

    -- BPM range practiced
    min_bpm_practiced INTEGER,
    max_bpm_practiced INTEGER,
    avg_bpm_practiced DECIMAL(5,1),

    -- Comparison to previous week (percentages)
    timing_offset_change DECIMAL(6,2),           -- Negative = improvement (less offset)
    consistency_change DECIMAL(6,2),             -- Positive = improvement
    on_beat_percent_change DECIMAL(6,2),         -- Positive = improvement

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, week_start_date)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_rhythm_sessions_user_date
    ON rhythm_training_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_rhythm_beat_metrics_session
    ON rhythm_training_beat_metrics(session_id);

CREATE INDEX IF NOT EXISTS idx_rhythm_weekly_user_week
    ON rhythm_training_weekly_progress(user_id, week_start_date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE rhythm_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythm_training_beat_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythm_training_weekly_progress ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own rhythm sessions"
    ON rhythm_training_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rhythm sessions"
    ON rhythm_training_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rhythm sessions"
    ON rhythm_training_sessions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rhythm sessions"
    ON rhythm_training_sessions FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own beat metrics"
    ON rhythm_training_beat_metrics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own beat metrics"
    ON rhythm_training_beat_metrics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own rhythm weekly progress"
    ON rhythm_training_weekly_progress FOR SELECT
    USING (auth.uid() = user_id);

-- Teachers can view their students' data
CREATE POLICY "Teachers can view student rhythm sessions"
    ON rhythm_training_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.student_id = rhythm_training_sessions.user_id
            AND bookings.instructor_id = auth.uid()
            AND bookings.status = 'confirmed'
        )
    );

CREATE POLICY "Teachers can view student rhythm weekly progress"
    ON rhythm_training_weekly_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.student_id = rhythm_training_weekly_progress.user_id
            AND bookings.instructor_id = auth.uid()
            AND bookings.status = 'confirmed'
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate weekly rhythm progress
CREATE OR REPLACE FUNCTION calculate_rhythm_weekly_progress(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
DECLARE
    v_current_week RECORD;
    v_previous_week RECORD;
BEGIN
    -- Get current week averages
    SELECT
        AVG(avg_timing_offset_ms) as avg_offset,
        AVG(timing_consistency) as avg_consistency,
        AVG(on_beat_percent) as avg_on_beat,
        AVG(overall_score) as avg_score,
        COUNT(*) as total_sessions,
        SUM(total_beats) as total_beats,
        SUM(duration_seconds) as total_time,
        MIN(bpm) as min_bpm,
        MAX(bpm) as max_bpm,
        AVG(bpm) as avg_bpm
    INTO v_current_week
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    -- Get previous week averages
    SELECT
        AVG(avg_timing_offset_ms) as avg_offset,
        AVG(timing_consistency) as avg_consistency,
        AVG(on_beat_percent) as avg_on_beat
    INTO v_previous_week
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start - INTERVAL '7 days'
    AND session_date < p_week_start;

    -- Upsert weekly progress
    INSERT INTO rhythm_training_weekly_progress (
        user_id, week_start_date,
        avg_timing_offset_ms, avg_timing_consistency, avg_on_beat_percent,
        avg_overall_score,
        total_sessions, total_beats_attempted, total_practice_time_seconds,
        min_bpm_practiced, max_bpm_practiced, avg_bpm_practiced,
        timing_offset_change, consistency_change, on_beat_percent_change,
        updated_at
    ) VALUES (
        p_user_id, p_week_start,
        v_current_week.avg_offset, v_current_week.avg_consistency, v_current_week.avg_on_beat,
        v_current_week.avg_score,
        v_current_week.total_sessions, v_current_week.total_beats,
        v_current_week.total_time,
        v_current_week.min_bpm, v_current_week.max_bpm, v_current_week.avg_bpm,
        -- For timing offset, negative change = improvement (less offset)
        CASE WHEN v_previous_week.avg_offset IS NOT NULL AND v_previous_week.avg_offset != 0
            THEN ((v_current_week.avg_offset - v_previous_week.avg_offset) / ABS(v_previous_week.avg_offset) * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_consistency IS NOT NULL AND v_previous_week.avg_consistency > 0
            THEN ((v_current_week.avg_consistency - v_previous_week.avg_consistency) / v_previous_week.avg_consistency * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_on_beat IS NOT NULL AND v_previous_week.avg_on_beat > 0
            THEN ((v_current_week.avg_on_beat - v_previous_week.avg_on_beat) / v_previous_week.avg_on_beat * 100)
            ELSE NULL END,
        NOW()
    )
    ON CONFLICT (user_id, week_start_date) DO UPDATE SET
        avg_timing_offset_ms = EXCLUDED.avg_timing_offset_ms,
        avg_timing_consistency = EXCLUDED.avg_timing_consistency,
        avg_on_beat_percent = EXCLUDED.avg_on_beat_percent,
        avg_overall_score = EXCLUDED.avg_overall_score,
        total_sessions = EXCLUDED.total_sessions,
        total_beats_attempted = EXCLUDED.total_beats_attempted,
        total_practice_time_seconds = EXCLUDED.total_practice_time_seconds,
        min_bpm_practiced = EXCLUDED.min_bpm_practiced,
        max_bpm_practiced = EXCLUDED.max_bpm_practiced,
        avg_bpm_practiced = EXCLUDED.avg_bpm_practiced,
        timing_offset_change = EXCLUDED.timing_offset_change,
        consistency_change = EXCLUDED.consistency_change,
        on_beat_percent_change = EXCLUDED.on_beat_percent_change,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update weekly progress when session is saved
CREATE OR REPLACE FUNCTION trigger_update_rhythm_weekly_progress()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_rhythm_weekly_progress(
        NEW.user_id,
        DATE_TRUNC('week', NEW.session_date)::DATE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rhythm_session_update_weekly ON rhythm_training_sessions;
CREATE TRIGGER trg_rhythm_session_update_weekly
    AFTER INSERT OR UPDATE ON rhythm_training_sessions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_rhythm_weekly_progress();
