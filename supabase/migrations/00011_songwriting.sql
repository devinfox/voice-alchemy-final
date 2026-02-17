-- ============================================================================
-- Migration: Songwriting Documents
-- Description: Tables for storing student songwriting projects with AI coaching
-- ============================================================================

-- ============================================================================
-- TABLE: songwriting_documents
-- Main songwriting document storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS songwriting_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Document info
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled Song',

    -- Song metadata
    vibe VARCHAR(100),                          -- e.g., "melancholic", "uplifting", "dreamy"
    mood VARCHAR(100),                          -- e.g., "happy", "sad", "nostalgic"
    genre VARCHAR(100),                         -- e.g., "pop", "rock", "r&b", "country"
    tempo VARCHAR(50),                          -- e.g., "slow ballad", "mid-tempo", "upbeat"

    -- Inspiration section
    inspiration_story TEXT,                     -- What inspired this song in their life
    key_emotions TEXT[],                        -- Array of emotions they want to convey
    target_audience VARCHAR(255),               -- Who is this song for

    -- Main content (Tiptap JSON format)
    content JSONB DEFAULT '{}',                 -- Full song content as Tiptap JSON
    plain_text TEXT,                            -- Plain text extraction for searching/AI

    -- Song structure tracking
    has_verse BOOLEAN DEFAULT FALSE,
    has_chorus BOOLEAN DEFAULT FALSE,
    has_bridge BOOLEAN DEFAULT FALSE,
    has_pre_chorus BOOLEAN DEFAULT FALSE,

    -- Word/character counts
    word_count INTEGER DEFAULT 0,
    character_count INTEGER DEFAULT 0,

    -- AI coaching data
    last_ai_feedback JSONB,                     -- Latest AI tips/suggestions
    ai_feedback_history JSONB DEFAULT '[]',     -- History of AI feedback
    total_ai_interactions INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(50) DEFAULT 'draft',         -- draft, in_progress, completed
    is_favorite BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: songwriting_ai_feedback
-- Store individual AI feedback entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS songwriting_ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES songwriting_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Feedback content
    feedback_type VARCHAR(50) NOT NULL,         -- 'lyric_tip', 'structure', 'emotion', 'hook', 'general'
    section_type VARCHAR(50),                   -- 'verse', 'chorus', 'bridge', 'pre_chorus', null for general

    -- The feedback itself
    original_text TEXT,                         -- What text triggered the feedback
    suggestion TEXT NOT NULL,                   -- The AI's suggestion
    reasoning TEXT,                             -- Why this suggestion helps

    -- User response
    was_accepted BOOLEAN,
    was_helpful BOOLEAN,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_songwriting_docs_user
    ON songwriting_documents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_songwriting_docs_status
    ON songwriting_documents(user_id, status) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_songwriting_feedback_doc
    ON songwriting_ai_feedback(document_id, created_at DESC);

-- Full-text search on song content
CREATE INDEX IF NOT EXISTS idx_songwriting_docs_search
    ON songwriting_documents USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(plain_text, '')));

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE songwriting_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE songwriting_ai_feedback ENABLE ROW LEVEL SECURITY;

-- Users can only access their own documents
CREATE POLICY "Users can view own songwriting documents"
    ON songwriting_documents FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own songwriting documents"
    ON songwriting_documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own songwriting documents"
    ON songwriting_documents FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own songwriting documents"
    ON songwriting_documents FOR DELETE
    USING (auth.uid() = user_id);

-- AI feedback policies
CREATE POLICY "Users can view own songwriting feedback"
    ON songwriting_ai_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own songwriting feedback"
    ON songwriting_ai_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own songwriting feedback"
    ON songwriting_ai_feedback FOR UPDATE
    USING (auth.uid() = user_id);

-- Teachers can view their students' songwriting
CREATE POLICY "Teachers can view student songwriting"
    ON songwriting_documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.student_id = songwriting_documents.user_id
            AND bookings.instructor_id = auth.uid()
            AND bookings.status = 'confirmed'
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_songwriting_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_songwriting_timestamp ON songwriting_documents;
CREATE TRIGGER trg_songwriting_timestamp
    BEFORE UPDATE ON songwriting_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_songwriting_timestamp();
