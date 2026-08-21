-- ============================================================================
-- Migration: Scale Training Reliability, RLS, & Weekly Rollup Triggers
-- Description: Fixes unique constraints, RLS policies for note metrics,
--              adds tempo and octave to session identifiers, and creates
--              hardened, note-weighted weekly progress calculation triggers.
-- ============================================================================

BEGIN;

-- 1. Ensure columns exist on scale_training_sessions
ALTER TABLE public.scale_training_sessions
    ADD COLUMN IF NOT EXISTS tempo_bpm INTEGER DEFAULT 80,
    ADD COLUMN IF NOT EXISTS octave INTEGER DEFAULT 4;

-- 2. Drop legacy narrower unique constraint and add comprehensive composite unique constraint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'scale_training_sessions_user_id_session_date_scale_type_root_key'
           OR conname = 'scale_training_sessions_user_id_session_date_scale_type_root__key'
    ) THEN
        ALTER TABLE public.scale_training_sessions
            DROP CONSTRAINT IF EXISTS scale_training_sessions_user_id_session_date_scale_type_root_key,
            DROP CONSTRAINT IF EXISTS scale_training_sessions_user_id_session_date_scale_type_root__key;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'scale_training_sessions_composite_unique'
    ) THEN
        ALTER TABLE public.scale_training_sessions
            ADD CONSTRAINT scale_training_sessions_composite_unique
            UNIQUE (user_id, session_date, scale_type, root_note, octave, direction, tempo_bpm);
    END IF;
END $$;

-- 3. Ensure columns exist on scale_training_weekly_progress
ALTER TABLE public.scale_training_weekly_progress
    ADD COLUMN IF NOT EXISTS avg_tempo_bpm NUMERIC,
    ADD COLUMN IF NOT EXISTS min_tempo_bpm INTEGER,
    ADD COLUMN IF NOT EXISTS max_tempo_bpm INTEGER,
    ADD COLUMN IF NOT EXISTS predominant_tendency VARCHAR(20);

-- 4. Update RLS policies on scale_training_note_metrics to allow ALL (SELECT, INSERT, UPDATE, DELETE)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can delete own scale note metrics" ON public.scale_training_note_metrics;
    CREATE POLICY "Users can delete own scale note metrics" 
        ON public.scale_training_note_metrics FOR DELETE 
        USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own scale note metrics" ON public.scale_training_note_metrics;
    CREATE POLICY "Users can update own scale note metrics" 
        ON public.scale_training_note_metrics FOR UPDATE 
        USING (auth.uid() = user_id);
END $$;

-- 5. Create composite lookup index for session queries
CREATE INDEX IF NOT EXISTS idx_scale_sessions_full_lookup
    ON public.scale_training_sessions (user_id, session_date, scale_type, root_note, octave, direction, tempo_bpm);

-- 6. Create or Replace hardened automated weekly progress rollup function
CREATE OR REPLACE FUNCTION calculate_scale_weekly_progress(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
DECLARE
    v_current_week RECORD;
    v_previous_week RECORD;
    v_most_scale TEXT;
    v_most_root TEXT;
BEGIN
    -- Aggregate current week sessions (weighted by total notes expected)
    SELECT
        CASE WHEN SUM(total_notes_expected) > 0
            THEN SUM(sequence_accuracy * total_notes_expected) / SUM(total_notes_expected)
            ELSE AVG(sequence_accuracy) END as avg_seq,
        CASE WHEN SUM(total_notes_expected) > 0
            THEN SUM(pitch_accuracy * total_notes_expected) / SUM(total_notes_expected)
            ELSE AVG(pitch_accuracy) END as avg_pitch,
        CASE WHEN SUM(total_notes_expected) > 0
            THEN SUM(timing_consistency * total_notes_expected) / SUM(total_notes_expected)
            ELSE AVG(timing_consistency) END as avg_timing,
        CASE WHEN SUM(total_notes_expected) > 0
            THEN SUM(overall_score * total_notes_expected) / SUM(total_notes_expected)
            ELSE AVG(overall_score) END as avg_score,
        AVG(tempo_bpm) as avg_tempo,
        MIN(tempo_bpm) as min_tempo,
        MAX(tempo_bpm) as max_tempo,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT scale_type) as total_scales,
        SUM(total_notes_expected) as total_notes,
        SUM(duration_seconds) as total_time
    INTO v_current_week
    FROM public.scale_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days';

    -- Aggregate previous week averages using the exact same note-weighted formula
    SELECT
        CASE WHEN SUM(total_notes_expected) > 0
            THEN SUM(sequence_accuracy * total_notes_expected) / SUM(total_notes_expected)
            ELSE AVG(sequence_accuracy) END as avg_seq,
        CASE WHEN SUM(total_notes_expected) > 0
            THEN SUM(pitch_accuracy * total_notes_expected) / SUM(total_notes_expected)
            ELSE AVG(pitch_accuracy) END as avg_pitch,
        CASE WHEN SUM(total_notes_expected) > 0
            THEN SUM(overall_score * total_notes_expected) / SUM(total_notes_expected)
            ELSE AVG(overall_score) END as avg_score
    INTO v_previous_week
    FROM public.scale_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start - INTERVAL '7 days'
    AND session_date < p_week_start;

    -- Determine most practiced scale and root
    SELECT scale_type, root_note INTO v_most_scale, v_most_root
    FROM public.scale_training_sessions
    WHERE user_id = p_user_id
    AND session_date >= p_week_start
    AND session_date < p_week_start + INTERVAL '7 days'
    GROUP BY scale_type, root_note
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Upsert weekly progress
    INSERT INTO public.scale_training_weekly_progress (
        user_id, week_start_date,
        avg_sequence_accuracy, avg_pitch_accuracy, avg_timing_consistency,
        avg_overall_score, avg_tempo_bpm, min_tempo_bpm, max_tempo_bpm,
        total_sessions, total_scales_practiced, total_notes_attempted,
        total_practice_time_seconds, most_practiced_scale, most_practiced_root,
        sequence_accuracy_change, pitch_accuracy_change, overall_score_change,
        updated_at
    ) VALUES (
        p_user_id, p_week_start,
        v_current_week.avg_seq, v_current_week.avg_pitch, v_current_week.avg_timing,
        v_current_week.avg_score, v_current_week.avg_tempo, v_current_week.min_tempo, v_current_week.max_tempo,
        COALESCE(v_current_week.total_sessions, 0),
        COALESCE(v_current_week.total_scales, 0),
        COALESCE(v_current_week.total_notes, 0),
        COALESCE(v_current_week.total_time, 0),
        v_most_scale, v_most_root,
        CASE WHEN v_previous_week.avg_seq IS NOT NULL AND v_previous_week.avg_seq > 0
            THEN ((v_current_week.avg_seq - v_previous_week.avg_seq) / v_previous_week.avg_seq * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_pitch IS NOT NULL AND v_previous_week.avg_pitch > 0
            THEN ((v_current_week.avg_pitch - v_previous_week.avg_pitch) / v_previous_week.avg_pitch * 100)
            ELSE NULL END,
        CASE WHEN v_previous_week.avg_score IS NOT NULL AND v_previous_week.avg_score > 0
            THEN ((v_current_week.avg_score - v_previous_week.avg_score) / v_previous_week.avg_score * 100)
            ELSE NULL END,
        NOW()
    )
    ON CONFLICT (user_id, week_start_date) DO UPDATE SET
        avg_sequence_accuracy = EXCLUDED.avg_sequence_accuracy,
        avg_pitch_accuracy = EXCLUDED.avg_pitch_accuracy,
        avg_timing_consistency = EXCLUDED.avg_timing_consistency,
        avg_overall_score = EXCLUDED.avg_overall_score,
        avg_tempo_bpm = EXCLUDED.avg_tempo_bpm,
        min_tempo_bpm = EXCLUDED.min_tempo_bpm,
        max_tempo_bpm = EXCLUDED.max_tempo_bpm,
        total_sessions = EXCLUDED.total_sessions,
        total_scales_practiced = EXCLUDED.total_scales_practiced,
        total_notes_attempted = EXCLUDED.total_notes_attempted,
        total_practice_time_seconds = EXCLUDED.total_practice_time_seconds,
        most_practiced_scale = EXCLUDED.most_practiced_scale,
        most_practiced_root = EXCLUDED.most_practiced_root,
        sequence_accuracy_change = EXCLUDED.sequence_accuracy_change,
        pitch_accuracy_change = EXCLUDED.pitch_accuracy_change,
        overall_score_change = EXCLUDED.overall_score_change,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 7. Hardened Trigger: Handles INSERT, DELETE, and week-crossing UPDATEs
CREATE OR REPLACE FUNCTION trigger_calculate_scale_weekly_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_old_week DATE;
    v_new_week DATE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old_week := date_trunc('week', OLD.session_date)::DATE;
        PERFORM calculate_scale_weekly_progress(OLD.user_id, v_old_week);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_week := date_trunc('week', OLD.session_date)::DATE;
        v_new_week := date_trunc('week', NEW.session_date)::DATE;

        PERFORM calculate_scale_weekly_progress(NEW.user_id, v_new_week);

        -- If date was moved across a week boundary or user changed, update old week too
        IF v_old_week <> v_new_week OR OLD.user_id <> NEW.user_id THEN
            PERFORM calculate_scale_weekly_progress(OLD.user_id, v_old_week);
        END IF;
        RETURN NEW;
    ELSE
        v_new_week := date_trunc('week', NEW.session_date)::DATE;
        PERFORM calculate_scale_weekly_progress(NEW.user_id, v_new_week);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_scale_sessions_weekly_progress ON public.scale_training_sessions;
CREATE TRIGGER trg_scale_sessions_weekly_progress
AFTER INSERT OR UPDATE OR DELETE ON public.scale_training_sessions
FOR EACH ROW EXECUTE FUNCTION trigger_calculate_scale_weekly_progress();

-- 8. Restrict direct public execution
REVOKE ALL ON FUNCTION calculate_scale_weekly_progress(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION trigger_calculate_scale_weekly_progress() FROM PUBLIC;

COMMIT;
