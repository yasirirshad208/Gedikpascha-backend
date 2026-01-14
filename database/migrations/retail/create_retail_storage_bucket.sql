-- Create storage bucket for retail brand images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('retail', 'retail', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload to their own retail folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own retail files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own retail files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view retail images" ON storage.objects;

-- Policy: Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload to their own retail folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'retail' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow authenticated users to update their own files
CREATE POLICY "Users can update their own retail files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'retail' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own retail files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'retail' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow public read access to retail bucket
CREATE POLICY "Public can view retail images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'retail');
