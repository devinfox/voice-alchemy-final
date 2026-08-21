-- ============================================================================
-- Migration: Singer-Focused Rhythm Training Metrics
-- Description: Adds rhythm tendency tracking and fixes timing offset calculations
--              for better singer feedback
-- ============================================================================

-- ============================================================================
-- ADD COLUMNS TO rhythm_training_sessions
-- ============================================================================
ALTER TABLE rhythm_training_sessions
ADD COLUMN IF NOT EXISTS rhythm_tendency VARCHAR(20) DEFAULT 'on-time',  -- 'early', 'late', 'on-time'
ADD COLUMN IF NOT EXISTS avg_early_ms DECIMAL(8,2) DEFAULT 0,            -- Average early offset (negative)
ADD COLUMN IF NOT EXISTS avg_late_ms DECIMAL(8,2) DEFAULT 0;             -- Average late offset (positive)

-- ============================================================================
-- ADD COLUMNS TO rhythm_training_weekly_progress
-- ============================================================================
ALTER TABLE rhythm_training_weekly_progress
ADD COLUMN IF NOT EXISTS predominant_tendency VARCHAR(20),               -- Most common tendency for the week
ADD COLUMN IF NOT EXISTS avg_early_ms DECIMAL(8,2),                      -- Weekly average early offset
ADD COLUMN IF NOT EXISTS avg_late_ms DECIMAL(8,2);                       -- Weekly average late offset

-- ============================================================================
-- UPDATE FUNCTION: Fix timing offset change calculation
-- The previous version didn't properly handle negative vs positive offsets
-- Now uses ABS for both values to measure improvement in overall offset
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_rhythm_weekly_progress(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
DECLARE
    v_current_week RECORD;
    v_previous_week RECORD;
    v_predominant_tendency VARCHAR(20);
BEGIN
    -- Get current week beat-weighted averages
    SELECT
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(avg_timing_offset_ms * total_beats) / SUM(total_beats)
            ELSE AVG(avg_timing_offset_ms) END as avg_offset,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(timing_consistency * total_beats) / SUM(total_beats)
            ELSE AVG(timing_consistency) END as avg_consistency,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(on_beat_percent * total_beats) / SUM(total_beats)
            ELSE AVG(on_beat_percent) END as avg_on_beat,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(overall_score * total_beats) / SUM(total_beats)
            ELSE AVG(overall_score) END as avg_score,
        COUNT(*) as total_sessions,
        SUM(total_beats) as total_beats,
        SUM(duration_seconds) as total_time,
        MIN(bpm) as min_bpm,
        MAX(bpm) as max_bpm,
        AVG(bpm) as avg_bpm,
        -- Average early/late offsets
        AVG(avg_early_ms) as avg_early,
        AVG(avg_late_ms) as avg_late
    INTO v_current_week
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    -- Get previous week beat-weighted averages
    SELECT
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(ABS(avg_timing_offset_ms) * total_beats) / SUM(total_beats)
            ELSE AVG(ABS(avg_timing_offset_ms)) END as avg_abs_offset,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(timing_consistency * total_beats) / SUM(total_beats)
            ELSE AVG(timing_consistency) END as avg_consistency,
        CASE WHEN SUM(total_beats) > 0
            THEN SUM(on_beat_percent * total_beats) / SUM(total_beats)
            ELSE AVG(on_beat_percent) END as avg_on_beat
    INTO v_previous_week
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start - INTERVAL '7 days'
    AND session_date < p_week_start;

    -- Determine predominant tendency for the week
    SELECT
        CASE
            WHEN SUM(CASE WHEN rhythm_tendency = 'early' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'late' THEN 1 ELSE 0 END) AND
                 SUM(CASE WHEN rhythm_tendency = 'early' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'on-time' THEN 1 ELSE 0 END) THEN 'early'
            WHEN SUM(CASE WHEN rhythm_tendency = 'late' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'early' THEN 1 ELSE 0 END) AND
                 SUM(CASE WHEN rhythm_tendency = 'late' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN rhythm_tendency = 'on-time' THEN 1 ELSE 0 END) THEN 'late'
            ELSE 'on-time'
        END
    INTO v_predominant_tendency
    FROM rhythm_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    -- Upsert weekly progress
    INSERT INTO rhythm_training_weekly_progress (
        user_id, week_start_date,
        avg_timing_offset_ms, avg_timing_consistency, avg_on_beat_percent,
        avg_overall_score,
        total_sessions, total_beats_attempted, total_practice_time_seconds,
        min_bpm_practiced, max_bpm_practiced, avg_bpm_practiced,
        timing_offset_change, consistency_change, on_beat_percent_change,
        -- New fields
        predominant_tendency, avg_early_ms, avg_late_ms,
        updated_at
    ) VALUES (
        p_user_id, p_week_start,
        v_current_week.avg_offset, v_current_week.avg_consistency, v_current_week.avg_on_beat,
        v_current_week.avg_score,
        v_current_week.total_sessions, v_current_week.total_beats,
        v_current_week.total_time,
        v_current_week.min_bpm, v_current_week.max_bpm, v_current_week.avg_bpm,
        -- Compare ABS values
        CASE WHEN v_previous_week.avg_abs_offset IS NOT NULL AND v_previous_week.avg_abs_offset > 0
            THEN ((ABS(v_current_week.avg_offset) - v_previous_week.avg_abs_offset) / v_previous_week.avg_abs_offset * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_consistency IS NOT NULL AND v_previous_week.avg_consistency > 0
            THEN ((v_current_week.avg_consistency - v_previous_week.avg_consistency) / v_previous_week.avg_consistency * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_on_beat IS NOT NULL AND v_previous_week.avg_on_beat > 0
            THEN ((v_current_week.avg_on_beat - v_previous_week.avg_on_beat) / v_previous_week.avg_on_beat * 100)
            ELSE NULL END,
        -- New fields
        v_predominant_tendency,
        v_current_week.avg_early,
        v_current_week.avg_late,
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
        predominant_tendency = EXCLUDED.predominant_tendency,
        avg_early_ms = EXCLUDED.avg_early_ms,
        avg_late_ms = EXCLUDED.avg_late_ms,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- AUTOMATED TRIGGER FOR RHYTHM SESSIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_calculate_rhythm_weekly_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_week_start DATE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_week_start := date_trunc('week', OLD.session_date)::DATE;
        PERFORM calculate_rhythm_weekly_progress(OLD.user_id, v_week_start);
        RETURN OLD;
    ELSE
        v_week_start := date_trunc('week', NEW.session_date)::DATE;
        PERFORM calculate_rhythm_weekly_progress(NEW.user_id, v_week_start);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_rhythm_sessions_weekly_progress ON rhythm_training_sessions;
CREATE TRIGGER trg_rhythm_sessions_weekly_progress
AFTER INSERT OR UPDATE OR DELETE ON rhythm_training_sessions
FOR EACH ROW EXECUTE FUNCTION trigger_calculate_rhythm_weekly_progress();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN rhythm_training_sessions.rhythm_tendency IS 'Overall timing tendency: early, late, or on-time';
COMMENT ON COLUMN rhythm_training_sessions.avg_early_ms IS 'Average early offset in ms (when hitting early)';
COMMENT ON COLUMN rhythm_training_sessions.avg_late_ms IS 'Average late offset in ms (when hitting late)';
COMMENT ON COLUMN rhythm_training_weekly_progress.predominant_tendency IS 'Most common rhythm tendency for the week';
