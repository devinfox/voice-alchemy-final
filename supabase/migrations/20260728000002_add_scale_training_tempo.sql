-- ============================================================================
-- Fix: scale training writes reference columns that do not exist
-- ============================================================================
-- Commit 2cc5236 ("Rename Training Center to Pitch Perfect and add tempo
-- feature") added tempo handling to app/api/scale-training/session/route.ts
-- but shipped no migration. The route writes:
--   scale_training_sessions.tempo_bpm                    (insert :150, filter :84)
--   scale_training_weekly_progress.avg/min/max_tempo_bpm (upsert :335-337)
-- None of these columns exist, so every scale session insert fails and
-- scale_training_sessions has 0 rows. The Scale Analysis AI panel therefore
-- has nothing to analyse.
--
-- This migration adds the missing columns and the unique constraints the
-- upserts depend on (an upsert with onConflict requires a matching unique
-- index; without it the upsert errors even once the columns exist).
-- ============================================================================

BEGIN;

-- --- session-level tempo -----------------------------------------------------
ALTER TABLE public.scale_training_sessions
    ADD COLUMN IF NOT EXISTS tempo_bpm integer;

COMMENT ON COLUMN public.scale_training_sessions.tempo_bpm
    IS 'Metronome tempo the scale was practised at. Route defaults to 80 when unset.';

-- --- weekly rollup tempo -----------------------------------------------------
ALTER TABLE public.scale_training_weekly_progress
    ADD COLUMN IF NOT EXISTS avg_tempo_bpm numeric,
    ADD COLUMN IF NOT EXISTS min_tempo_bpm integer,
    ADD COLUMN IF NOT EXISTS max_tempo_bpm integer;

-- --- unique constraints required by the upserts ------------------------------
-- scale-training/session/route.ts:349 -> onConflict: 'user_id,week_start_date'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'scale_training_weekly_progress_user_week_key'
    ) THEN
        ALTER TABLE public.scale_training_weekly_progress
            ADD CONSTRAINT scale_training_weekly_progress_user_week_key
            UNIQUE (user_id, week_start_date);
    END IF;
END $$;

-- pitch-training/song-key-session/route.ts:212 -> onConflict: 'user_id,week_start'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'song_key_weekly_progress_user_week_key'
    ) THEN
        ALTER TABLE public.song_key_weekly_progress
            ADD CONSTRAINT song_key_weekly_progress_user_week_key
            UNIQUE (user_id, week_start);
    END IF;
END $$;

-- The session route looks up an existing row by this exact tuple before
-- deciding to insert or update (route.ts:80-89).
CREATE INDEX IF NOT EXISTS idx_scale_sessions_lookup
    ON public.scale_training_sessions
       (user_id, session_date, scale_type, root_note, direction, tempo_bpm);

COMMIT;
