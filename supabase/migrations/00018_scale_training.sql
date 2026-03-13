-- Scale Training Tables
-- Tracks scale practice sessions with note sequence accuracy

-- Scale training sessions table
CREATE TABLE IF NOT EXISTS scale_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Scale info
  scale_type TEXT NOT NULL, -- 'major', 'natural_minor', 'harmonic_minor', 'melodic_minor', 'pentatonic_major', 'pentatonic_minor', 'blues', 'chromatic'
  root_note TEXT NOT NULL, -- 'C', 'C#', 'D', etc.
  octave INTEGER NOT NULL DEFAULT 4,
  direction TEXT NOT NULL DEFAULT 'ascending', -- 'ascending', 'descending', 'both'

  -- Accuracy metrics
  sequence_accuracy DECIMAL(5,2), -- % of notes in correct order (0-100)
  pitch_accuracy DECIMAL(5,2), -- average pitch accuracy across all notes (0-100)
  timing_consistency DECIMAL(5,2), -- how consistent the timing between notes (0-100)
  overall_score DECIMAL(5,2), -- weighted combination

  -- Totals
  total_notes_expected INTEGER NOT NULL,
  total_notes_sung INTEGER NOT NULL DEFAULT 0,
  notes_in_correct_order INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, session_date, scale_type, root_note, direction)
);

-- Individual note metrics within a scale session
CREATE TABLE IF NOT EXISTS scale_training_note_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES scale_training_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Note info
  note_name TEXT NOT NULL, -- 'C', 'D', 'E', etc.
  octave INTEGER NOT NULL,
  expected_position INTEGER NOT NULL, -- 1, 2, 3... position in scale
  actual_position INTEGER, -- what position they sang it at (NULL if not sung)
  target_frequency DECIMAL(10,2) NOT NULL,

  -- Accuracy metrics
  pitch_accuracy DECIMAL(5,2), -- how accurate the pitch was (0-100)
  cents_deviation DECIMAL(8,2), -- average cents off
  target_accuracy DECIMAL(5,2), -- singer-focused accuracy
  voice_stability DECIMAL(5,2), -- pitch consistency

  -- Timing
  time_to_sing_ms INTEGER, -- milliseconds from previous note
  was_in_order BOOLEAN DEFAULT FALSE,

  -- Sample data
  sample_count INTEGER DEFAULT 0,
  avg_detected_frequency DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, note_name, octave, expected_position)
);

-- Weekly progress aggregation
CREATE TABLE IF NOT EXISTS scale_training_weekly_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,

  -- Averages
  avg_sequence_accuracy DECIMAL(5,2),
  avg_pitch_accuracy DECIMAL(5,2),
  avg_timing_consistency DECIMAL(5,2),
  avg_overall_score DECIMAL(5,2),

  -- Totals
  total_sessions INTEGER DEFAULT 0,
  total_scales_practiced INTEGER DEFAULT 0,
  total_notes_attempted INTEGER DEFAULT 0,
  total_practice_time_seconds INTEGER DEFAULT 0,

  -- Most practiced
  most_practiced_scale TEXT,
  most_practiced_root TEXT,

  -- Week over week changes
  sequence_accuracy_change DECIMAL(5,2),
  pitch_accuracy_change DECIMAL(5,2),
  overall_score_change DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, week_start_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scale_sessions_user_date ON scale_training_sessions(user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_scale_sessions_scale ON scale_training_sessions(scale_type, root_note);
CREATE INDEX IF NOT EXISTS idx_scale_note_metrics_session ON scale_training_note_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_scale_weekly_user ON scale_training_weekly_progress(user_id, week_start_date DESC);

-- Enable RLS
ALTER TABLE scale_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_training_note_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_training_weekly_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
  -- Sessions policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_sessions' AND policyname = 'Users can view own scale sessions') THEN
    CREATE POLICY "Users can view own scale sessions" ON scale_training_sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_sessions' AND policyname = 'Users can insert own scale sessions') THEN
    CREATE POLICY "Users can insert own scale sessions" ON scale_training_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_sessions' AND policyname = 'Users can update own scale sessions') THEN
    CREATE POLICY "Users can update own scale sessions" ON scale_training_sessions FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  -- Note metrics policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_note_metrics' AND policyname = 'Users can view own scale note metrics') THEN
    CREATE POLICY "Users can view own scale note metrics" ON scale_training_note_metrics FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_note_metrics' AND policyname = 'Users can insert own scale note metrics') THEN
    CREATE POLICY "Users can insert own scale note metrics" ON scale_training_note_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Weekly progress policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_weekly_progress' AND policyname = 'Users can view own scale weekly progress') THEN
    CREATE POLICY "Users can view own scale weekly progress" ON scale_training_weekly_progress FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_weekly_progress' AND policyname = 'Users can insert own scale weekly progress') THEN
    CREATE POLICY "Users can insert own scale weekly progress" ON scale_training_weekly_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_weekly_progress' AND policyname = 'Users can update own scale weekly progress') THEN
    CREATE POLICY "Users can update own scale weekly progress" ON scale_training_weekly_progress FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Teachers can view their students' scale progress
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_sessions' AND policyname = 'Teachers can view student scale sessions') THEN
    CREATE POLICY "Teachers can view student scale sessions" ON scale_training_sessions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM bookings
        WHERE bookings.student_id = scale_training_sessions.user_id
        AND bookings.instructor_id = auth.uid()
        AND bookings.status = 'active'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scale_training_weekly_progress' AND policyname = 'Teachers can view student scale weekly progress') THEN
    CREATE POLICY "Teachers can view student scale weekly progress" ON scale_training_weekly_progress FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM bookings
        WHERE bookings.student_id = scale_training_weekly_progress.user_id
        AND bookings.instructor_id = auth.uid()
        AND bookings.status = 'active'
      )
    );
  END IF;
END $$;
