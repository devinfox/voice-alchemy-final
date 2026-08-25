-- ============================================================================
-- Voice Alchemy Academy - Migration: Teacher/admin visibility into training
--
-- Fixes:
--   * 00018's teacher policies on scale training required bookings.status =
--     'active' — a status the app never writes (it uses 'confirmed'), so
--     teachers could never read student scale sessions.
--   * No admin SELECT policies existed on any training table, so admin
--     dashboards silently saw empty data through RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Scale training: teacher policies keyed to the status the app actually uses
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can view student scale sessions" ON scale_training_sessions;
CREATE POLICY "Teachers can view student scale sessions" ON scale_training_sessions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.student_id = scale_training_sessions.user_id
          AND b.instructor_id = auth.uid()
          AND b.status = 'confirmed'
    )
);

DROP POLICY IF EXISTS "Teachers can view student scale weekly progress" ON scale_training_weekly_progress;
CREATE POLICY "Teachers can view student scale weekly progress" ON scale_training_weekly_progress FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.student_id = scale_training_weekly_progress.user_id
          AND b.instructor_id = auth.uid()
          AND b.status = 'confirmed'
    )
);

-- ----------------------------------------------------------------------------
-- Admin read access to training sessions (dashboards/stats)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all pitch sessions" ON pitch_training_sessions;
CREATE POLICY "Admins can view all pitch sessions" ON pitch_training_sessions FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view all rhythm sessions" ON rhythm_training_sessions;
CREATE POLICY "Admins can view all rhythm sessions" ON rhythm_training_sessions FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view all scale sessions" ON scale_training_sessions;
CREATE POLICY "Admins can view all scale sessions" ON scale_training_sessions FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view all pitch weekly progress" ON pitch_training_weekly_progress;
CREATE POLICY "Admins can view all pitch weekly progress" ON pitch_training_weekly_progress FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view all rhythm weekly progress" ON rhythm_training_weekly_progress;
CREATE POLICY "Admins can view all rhythm weekly progress" ON rhythm_training_weekly_progress FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view all scale weekly progress" ON scale_training_weekly_progress;
CREATE POLICY "Admins can view all scale weekly progress" ON scale_training_weekly_progress FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ----------------------------------------------------------------------------
-- Song-key training: teacher + admin read policies (none existed at all)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can view student song key sessions" ON song_key_training_sessions;
CREATE POLICY "Teachers can view student song key sessions" ON song_key_training_sessions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.student_id = song_key_training_sessions.user_id
          AND b.instructor_id = auth.uid()
          AND b.status = 'confirmed'
    )
);

DROP POLICY IF EXISTS "Admins can view all song key sessions" ON song_key_training_sessions;
CREATE POLICY "Admins can view all song key sessions" ON song_key_training_sessions FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Teachers can view student song key weekly progress" ON song_key_weekly_progress;
CREATE POLICY "Teachers can view student song key weekly progress" ON song_key_weekly_progress FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.student_id = song_key_weekly_progress.user_id
          AND b.instructor_id = auth.uid()
          AND b.status = 'confirmed'
    )
);

DROP POLICY IF EXISTS "Admins can view all song key weekly progress" ON song_key_weekly_progress;
CREATE POLICY "Admins can view all song key weekly progress" ON song_key_weekly_progress FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
