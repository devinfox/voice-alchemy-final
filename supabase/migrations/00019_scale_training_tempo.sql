-- Add tempo (BPM) tracking to scale training
-- This allows tracking practice speed and its contribution to training progress

-- Add tempo_bpm to scale_training_sessions
ALTER TABLE scale_training_sessions
ADD COLUMN IF NOT EXISTS tempo_bpm INTEGER DEFAULT 80;

-- Add tempo stats to weekly progress
ALTER TABLE scale_training_weekly_progress
ADD COLUMN IF NOT EXISTS avg_tempo_bpm DECIMAL(5,1),
ADD COLUMN IF NOT EXISTS min_tempo_bpm INTEGER,
ADD COLUMN IF NOT EXISTS max_tempo_bpm INTEGER;

-- Create index for tempo-based queries
CREATE INDEX IF NOT EXISTS idx_scale_sessions_tempo ON scale_training_sessions(tempo_bpm);

-- Update the unique constraint to include tempo (so same scale at different tempos are tracked separately)
-- First drop the old constraint if it exists
ALTER TABLE scale_training_sessions DROP CONSTRAINT IF EXISTS scale_training_sessions_user_id_session_date_scale_type_root_key;

-- Create new unique constraint including tempo
ALTER TABLE scale_training_sessions
ADD CONSTRAINT scale_training_sessions_user_date_scale_tempo_key
UNIQUE (user_id, session_date, scale_type, root_note, direction, tempo_bpm);
