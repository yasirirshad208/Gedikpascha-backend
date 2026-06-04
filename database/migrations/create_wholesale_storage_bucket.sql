-- Create Supabase Storage bucket for wholesale brand images (logo and cover)
-- Run this in Supabase SQL Editor
-- Note: RLS is already enabled on storage.objects by default in Supabase

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wholesale', 'wholesale', true, 10485760, ARRAY['image/*']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/*']::text[];

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public can view wholesale images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own wholesale images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own wholesale images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own wholesale images" ON storage.objects;

-- Storage policies (RLS for storage)
-- Note: Service role key bypasses RLS policies automatically
-- Backend uses service role client, so RLS won't block uploads
-- These policies below are for direct client uploads (if needed in future)

-- Allow public read access to wholesale brand images
CREATE POLICY "Public can view wholesale images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wholesale');

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload their own wholesale images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'wholesale' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update their own wholesale images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'wholesale' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete their own wholesale images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'wholesale' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

