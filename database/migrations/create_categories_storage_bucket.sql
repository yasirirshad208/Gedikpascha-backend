-- Create Supabase Storage bucket for category images
-- Run this in Supabase SQL Editor
-- Note: RLS is already enabled on storage.objects by default in Supabase

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('categories', 'categories', true, 5242880, ARRAY['image/*']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/*']::text[];

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public can view category images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload category images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update category images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete category images" ON storage.objects;

-- Storage policies (RLS for storage)
-- Note: Service role key bypasses RLS policies automatically
-- Backend uses service role client, so RLS won't block uploads
-- These policies below are for direct client uploads (if needed in future)

-- Allow public read access to category images
CREATE POLICY "Public can view category images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'categories');

-- Allow admins to upload category images (for direct client uploads if needed)
CREATE POLICY "Admins can upload category images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'categories' AND
    is_admin()
  );

-- Allow admins to update category images
CREATE POLICY "Admins can update category images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'categories' AND
    is_admin()
  );

-- Allow admins to delete category images
CREATE POLICY "Admins can delete category images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'categories' AND
    is_admin()
  );

