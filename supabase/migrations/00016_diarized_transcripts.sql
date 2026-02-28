-- Add diarized transcript column to lesson_recordings
-- Stores speaker-labeled transcript from AssemblyAI

ALTER TABLE lesson_recordings
ADD COLUMN IF NOT EXISTS transcript_diarized JSONB;

-- Add comment explaining the column structure
COMMENT ON COLUMN lesson_recordings.transcript_diarized IS 'Speaker-diarized transcript from AssemblyAI. Structure: { "text": "full text", "utterances": [{ "speaker": "TEACHER"|"STUDENT", "text": "...", "start": ms, "end": ms, "confidence": 0-1 }], "speakerWordCounts": { "teacher": n, "student": n } }';
