-- ============================================================================
-- Migration: Singer-Focused Pitch Training Metrics
-- Description: Adds new columns to track metrics more relevant to singing students
--              including target accuracy, voice stability, semitone deviation, etc.
-- ============================================================================

-- ============================================================================
-- ADD COLUMNS TO pitch_training_sessions
-- ============================================================================
ALTER TABLE pitch_training_sessions
ADD COLUMN IF NOT EXISTS avg_target_accuracy DECIMAL(5,2),        -- 0-100, considers semitone distance
ADD COLUMN IF NOT EXISTS avg_voice_stability DECIMAL(5,2),        -- 0-100, pitch steadiness regardless of target
ADD COLUMN IF NOT EXISTS avg_semitone_deviation DECIMAL(4,2),     -- Average semitones from target (can be negative)
ADD COLUMN IF NOT EXISTS pitch_tendency VARCHAR(20);              -- 'sharp', 'flat', or 'on-target'

-- ============================================================================
-- ADD COLUMNS TO pitch_training_note_metrics
-- ============================================================================
ALTER TABLE pitch_training_note_metrics
ADD COLUMN IF NOT EXISTS target_accuracy DECIMAL(5,2),            -- 0-100, considers semitone distance
ADD COLUMN IF NOT EXISTS voice_stability DECIMAL(5,2),            -- 0-100, pitch steadiness
ADD COLUMN IF NOT EXISTS avg_semitone_deviation DECIMAL(4,2),     -- Semitones from target
ADD COLUMN IF NOT EXISTS most_sung_note VARCHAR(3),               -- Note actually sung most
ADD COLUMN IF NOT EXISTS most_sung_octave INTEGER,                -- Octave actually sung most
ADD COLUMN IF NOT EXISTS pitch_direction VARCHAR(20),             -- 'sharp', 'flat', or 'on-target'
ADD COLUMN IF NOT EXISTS time_to_first_sound INTEGER,             -- ms until any pitch detected
ADD COLUMN IF NOT EXISTS sample_count INTEGER DEFAULT 0;          -- Number of samples recorded

-- ============================================================================
-- ADD COLUMNS TO pitch_training_weekly_progress
-- ============================================================================
ALTER TABLE pitch_training_weekly_progress
ADD COLUMN IF NOT EXISTS avg_target_accuracy DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS avg_voice_stability DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS target_accuracy_change DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS voice_stability_change DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS predominant_tendency VARCHAR(20);        -- Most common pitch tendency for the week

-- ============================================================================
-- CREATE TABLE: pitch_training_progress_history
-- Stores historical progress data for tracking evolution over time
-- ============================================================================
CREATE TABLE IF NOT EXISTS pitch_training_progress_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Time period
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_type VARCHAR(20) NOT NULL,              -- 'daily', 'weekly', 'monthly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Core metrics at this point in time
    target_accuracy DECIMAL(5,2),
    voice_stability DECIMAL(5,2),
    overall_score DECIMAL(5,2),

    -- Progress indicators (compared to previous period)
    target_accuracy_delta DECIMAL(6,2),
    voice_stability_delta DECIMAL(6,2),
    overall_score_delta DECIMAL(6,2),

    -- Volume metrics
    total_sessions INTEGER DEFAULT 0,
    total_notes_attempted INTEGER DEFAULT 0,
    total_practice_seconds INTEGER DEFAULT 0,

    -- Problem areas
    consistently_flat_notes TEXT[],               -- Notes user tends to go flat on
    consistently_sharp_notes TEXT[],              -- Notes user tends to go sharp on
    strongest_notes TEXT[],                       -- Notes with highest accuracy
    weakest_notes TEXT[],                         -- Notes needing most work

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, period_type, period_start)
);

-- ============================================================================
-- INDEX for faster progress queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_progress_history_user_period
ON pitch_training_progress_history(user_id, period_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_progress_history_user_date
ON pitch_training_progress_history(user_id, period_start DESC);

-- ============================================================================
-- RLS Policies for progress_history
-- ============================================================================
ALTER TABLE pitch_training_progress_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own progress history"
ON pitch_training_progress_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress history"
ON pitch_training_progress_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: Calculate and store daily progress
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_daily_pitch_progress(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
DECLARE
    v_session RECORD;
    v_prev_record RECORD;
BEGIN
    -- Get the session for this date
    SELECT
        avg_pitch_accuracy,
        avg_pitch_stability,
        overall_score,
        avg_target_accuracy,
        avg_voice_stability,
        total_notes_attempted,
        duration_seconds
    INTO v_session
    FROM pitch_training_sessions
    WHERE user_id = p_user_id AND session_date = p_date;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Get previous day's record for delta calculation
    SELECT
        target_accuracy,
        voice_stability,
        overall_score
    INTO v_prev_record
    FROM pitch_training_progress_history
    WHERE user_id = p_user_id
      AND period_type = 'daily'
      AND period_start < p_date
    ORDER BY period_start DESC
    LIMIT 1;

    -- Insert or update progress record
    INSERT INTO pitch_training_progress_history (
        user_id,
        period_type,
        period_start,
        period_end,
        target_accuracy,
        voice_stability,
        overall_score,
        target_accuracy_delta,
        voice_stability_delta,
        overall_score_delta,
        total_sessions,
        total_notes_attempted,
        total_practice_seconds
    ) VALUES (
        p_user_id,
        'daily',
        p_date,
        p_date,
        COALESCE(v_session.avg_target_accuracy, v_session.avg_pitch_accuracy),
        COALESCE(v_session.avg_voice_stability, v_session.avg_pitch_stability),
        v_session.overall_score,
        CASE WHEN v_prev_record.target_accuracy IS NOT NULL
             THEN COALESCE(v_session.avg_target_accuracy, v_session.avg_pitch_accuracy) - v_prev_record.target_accuracy
             ELSE NULL END,
        CASE WHEN v_prev_record.voice_stability IS NOT NULL
             THEN COALESCE(v_session.avg_voice_stability, v_session.avg_pitch_stability) - v_prev_record.voice_stability
             ELSE NULL END,
        CASE WHEN v_prev_record.overall_score IS NOT NULL
             THEN v_session.overall_score - v_prev_record.overall_score
             ELSE NULL END,
        1,
        v_session.total_notes_attempted,
        COALESCE(v_session.duration_seconds, 0)
    )
    ON CONFLICT (user_id, period_type, period_start)
    DO UPDATE SET
        target_accuracy = EXCLUDED.target_accuracy,
        voice_stability = EXCLUDED.voice_stability,
        overall_score = EXCLUDED.overall_score,
        target_accuracy_delta = EXCLUDED.target_accuracy_delta,
        voice_stability_delta = EXCLUDED.voice_stability_delta,
        overall_score_delta = EXCLUDED.overall_score_delta,
        total_notes_attempted = EXCLUDED.total_notes_attempted,
        total_practice_seconds = EXCLUDED.total_practice_seconds;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-calculate progress after session insert/update
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_calculate_pitch_progress()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_daily_pitch_progress(NEW.user_id, NEW.session_date);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_pitch_session_progress ON pitch_training_sessions;
CREATE TRIGGER after_pitch_session_progress
AFTER INSERT OR UPDATE ON pitch_training_sessions
FOR EACH ROW
EXECUTE FUNCTION trigger_calculate_pitch_progress();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN pitch_training_note_metrics.target_accuracy IS 'How close to target note (0-100), penalizes semitone distance';
COMMENT ON COLUMN pitch_training_note_metrics.voice_stability IS 'How steady the voice is (0-100), independent of hitting target';
COMMENT ON COLUMN pitch_training_note_metrics.most_sung_note IS 'The note the user actually sang most during this attempt';
COMMENT ON COLUMN pitch_training_note_metrics.pitch_direction IS 'Whether user tends sharp, flat, or on-target for this note';
COMMENT ON TABLE pitch_training_progress_history IS 'Historical record of user progress for tracking evolution over time';
