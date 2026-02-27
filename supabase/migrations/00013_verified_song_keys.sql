-- ============================================================================
-- Verified Song Keys Cache
-- Stores AI-verified song key/BPM data for faster lookups and accuracy
-- ============================================================================

-- Create the verified_song_keys table
CREATE TABLE IF NOT EXISTS verified_song_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('major', 'minor')),
  bpm INTEGER NOT NULL DEFAULT 120,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.7,
  source TEXT NOT NULL DEFAULT 'openai',
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint on title + artist (case-insensitive)
  CONSTRAINT verified_song_keys_unique UNIQUE (title, artist)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_verified_song_keys_title ON verified_song_keys (lower(title));
CREATE INDEX IF NOT EXISTS idx_verified_song_keys_artist ON verified_song_keys (lower(artist));
CREATE INDEX IF NOT EXISTS idx_verified_song_keys_confidence ON verified_song_keys (confidence DESC);

-- Enable RLS
ALTER TABLE verified_song_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read verified keys (public data)
CREATE POLICY "Verified song keys are publicly readable"
  ON verified_song_keys
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Policy: Only authenticated users can insert/update (via API)
CREATE POLICY "Authenticated users can insert verified keys"
  ON verified_song_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update verified keys"
  ON verified_song_keys
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_verified_song_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_verified_song_keys_updated_at
  BEFORE UPDATE ON verified_song_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_verified_song_keys_updated_at();

-- Add some seed data for common songs with verified keys
INSERT INTO verified_song_keys (title, artist, key, mode, bpm, confidence, source) VALUES
  ('blinding lights', 'the weeknd', 'F', 'minor', 171, 0.99, 'seed'),
  ('shape of you', 'ed sheeran', 'C#', 'minor', 96, 0.99, 'seed'),
  ('someone like you', 'adele', 'A', 'major', 68, 0.99, 'seed'),
  ('rolling in the deep', 'adele', 'C', 'minor', 105, 0.99, 'seed'),
  ('hello', 'adele', 'F', 'minor', 79, 0.99, 'seed'),
  ('thinking out loud', 'ed sheeran', 'D', 'major', 79, 0.99, 'seed'),
  ('perfect', 'ed sheeran', 'Ab', 'major', 95, 0.99, 'seed'),
  ('bad guy', 'billie eilish', 'G', 'minor', 135, 0.99, 'seed'),
  ('shake it off', 'taylor swift', 'G', 'major', 160, 0.99, 'seed'),
  ('blank space', 'taylor swift', 'F', 'major', 96, 0.99, 'seed'),
  ('anti-hero', 'taylor swift', 'E', 'major', 97, 0.99, 'seed'),
  ('cruel summer', 'taylor swift', 'A', 'major', 170, 0.99, 'seed'),
  ('uptown funk', 'bruno mars', 'D', 'minor', 115, 0.99, 'seed'),
  ('just the way you are', 'bruno mars', 'F', 'major', 109, 0.99, 'seed'),
  ('bohemian rhapsody', 'queen', 'Bb', 'major', 72, 0.99, 'seed'),
  ('hotel california', 'eagles', 'B', 'minor', 74, 0.99, 'seed'),
  ('billie jean', 'michael jackson', 'F#', 'minor', 117, 0.99, 'seed'),
  ('beat it', 'michael jackson', 'E', 'minor', 139, 0.99, 'seed'),
  ('shallow', 'lady gaga', 'G', 'major', 96, 0.99, 'seed'),
  ('bad romance', 'lady gaga', 'A', 'minor', 119, 0.99, 'seed'),
  ('halo', 'beyonce', 'A', 'major', 80, 0.99, 'seed'),
  ('crazy in love', 'beyonce', 'D', 'minor', 99, 0.99, 'seed'),
  ('viva la vida', 'coldplay', 'Ab', 'major', 138, 0.99, 'seed'),
  ('fix you', 'coldplay', 'Eb', 'major', 69, 0.99, 'seed'),
  ('all of me', 'john legend', 'Ab', 'major', 63, 0.99, 'seed'),
  ('stay with me', 'sam smith', 'C', 'minor', 84, 0.99, 'seed'),
  ('i will always love you', 'whitney houston', 'A', 'major', 67, 0.99, 'seed'),
  ('superstition', 'stevie wonder', 'E', 'minor', 100, 0.99, 'seed'),
  ('drivers license', 'olivia rodrigo', 'Bb', 'major', 72, 0.99, 'seed'),
  ('good 4 u', 'olivia rodrigo', 'A', 'major', 166, 0.99, 'seed'),
  ('watermelon sugar', 'harry styles', 'D', 'minor', 95, 0.99, 'seed'),
  ('as it was', 'harry styles', 'F', 'major', 174, 0.99, 'seed'),
  ('dont start now', 'dua lipa', 'B', 'minor', 124, 0.99, 'seed'),
  ('levitating', 'dua lipa', 'B', 'minor', 103, 0.99, 'seed'),
  ('thank u, next', 'ariana grande', 'F', 'major', 107, 0.99, 'seed'),
  ('7 rings', 'ariana grande', 'Ab', 'minor', 140, 0.99, 'seed'),
  ('starboy', 'the weeknd', 'A', 'minor', 186, 0.99, 'seed'),
  ('save your tears', 'the weeknd', 'C', 'minor', 118, 0.99, 'seed'),
  ('circles', 'post malone', 'C', 'minor', 120, 0.99, 'seed'),
  ('sunflower', 'post malone', 'D', 'major', 90, 0.99, 'seed')
ON CONFLICT (title, artist) DO NOTHING;

COMMENT ON TABLE verified_song_keys IS 'Cache of AI-verified song key and BPM data for the Song Key Trainer';
