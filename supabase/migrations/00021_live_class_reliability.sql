-- ============================================================================
-- Migration: Live Class Reliability, Audio Asset Decoupling, & Worker Leases
-- Description: Adds audio_storage_path and worker lease tracking columns to
--              lesson_recordings, and adds structured note storage columns to
--              notes_archive for CRDT and JSON representation.
-- ============================================================================

BEGIN;

-- 1. Ensure columns exist on lesson_recordings for audio decoupling, worker leases, and lock tokens
ALTER TABLE public.lesson_recordings
    ADD COLUMN IF NOT EXISTS audio_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS audio_file_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS ai_locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_lock_token UUID,
    ADD COLUMN IF NOT EXISTS ai_attempt_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_next_retry_at TIMESTAMPTZ;

-- 2. Ensure columns exist on notes_archive for CRDT binary & JSON storage
ALTER TABLE public.notes_archive
    ADD COLUMN IF NOT EXISTS content_json JSONB,
    ADD COLUMN IF NOT EXISTS ydoc_binary BYTEA;

-- 3. Create composite lookup index for pending worker jobs with lease expiration
CREATE INDEX IF NOT EXISTS idx_lesson_recordings_ai_worker_queue
    ON public.lesson_recordings (ai_processing_status, ai_locked_at, ai_next_retry_at, ai_attempt_count);

-- 4. Atomic Worker Claim RPC Function (Single-Statement Leased Lock Evaluation)
CREATE OR REPLACE FUNCTION public.claim_lesson_recording(
    p_recording_id UUID,
    p_lock_token UUID,
    p_lease_seconds INT DEFAULT 900,
    p_max_attempts INT DEFAULT 5,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    booking_id UUID,
    student_id UUID,
    storage_path TEXT,
    audio_storage_path TEXT,
    file_size_bytes BIGINT,
    audio_file_size_bytes BIGINT,
    duration_seconds INT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    ai_attempt_count INT,
    ai_lock_token UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.lesson_recordings lr
    SET
        ai_processing_status = 'processing',
        ai_locked_at = NOW(),
        ai_lock_token = p_lock_token,
        ai_attempt_count = COALESCE(lr.ai_attempt_count, 0) + 1,
        updated_at = NOW()
    WHERE lr.id = p_recording_id
      AND (
        p_force = TRUE
        OR (
            -- Eligible for claim if pending/failed and retry delay has elapsed
            (
                lr.ai_processing_status IN ('pending', 'failed')
                AND (lr.ai_next_retry_at IS NULL OR lr.ai_next_retry_at <= NOW())
                AND COALESCE(lr.ai_attempt_count, 0) < p_max_attempts
            )
            -- OR expired lease (worker crashed/timed out)
            OR (
                lr.ai_processing_status = 'processing'
                AND (lr.ai_locked_at IS NULL OR lr.ai_locked_at < NOW() - (p_lease_seconds || ' seconds')::INTERVAL)
            )
        )
      )
    RETURNING
        lr.id,
        lr.booking_id,
        lr.student_id,
        lr.storage_path,
        lr.audio_storage_path,
        lr.file_size_bytes,
        lr.audio_file_size_bytes,
        lr.duration_seconds,
        lr.started_at,
        lr.ended_at,
        lr.ai_attempt_count,
        lr.ai_lock_token;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_lesson_recording(UUID, UUID, INT, INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lesson_recording(UUID, UUID, INT, INT, BOOLEAN) TO authenticated, service_role;

COMMIT;
