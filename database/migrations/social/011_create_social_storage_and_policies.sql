-- 011_create_social_storage_and_policies.sql

INSERT INTO storage.buckets (id, name, public)
VALUES ('social', 'social', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view social media files" ON storage.objects;
CREATE POLICY "Public can view social media files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'social');

DROP POLICY IF EXISTS "Users can upload to own social folder" ON storage.objects;
CREATE POLICY "Users can upload to own social folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'social'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update own social files" ON storage.objects;
CREATE POLICY "Users can update own social files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'social'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'social'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete own social files" ON storage.objects;
CREATE POLICY "Users can delete own social files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'social'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
