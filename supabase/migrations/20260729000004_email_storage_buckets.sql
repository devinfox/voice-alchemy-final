-- Ensure storage buckets used by the email system exist.
-- Run in Supabase; ignore errors if buckets already exist via dashboard.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('email-attachments', 'email-attachments', true),
  ('email-template-images', 'email-template-images', true)
ON CONFLICT (id) DO NOTHING;
