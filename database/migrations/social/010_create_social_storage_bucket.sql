INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social',
  'social',
  true,
  52428800,
  ARRAY['image/*', 'video/*']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/*', 'video/*']::TEXT[];

DROP POLICY IF EXISTS "Public can view social files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own social files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own social files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own social files" ON storage.objects;

CREATE POLICY "Public can view social files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social');

CREATE POLICY "Users can upload own social files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'social' AND
    auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own social files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'social' AND
    auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own social files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'social' AND
    auth.uid()::TEXT = (storage.foldername(name))[1]
  );
