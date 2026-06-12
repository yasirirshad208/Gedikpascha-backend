-- =============================================================================
-- Payments Phase 6: storage bucket for dispute evidence (invoices, shipping PDFs).
-- Run separately from the main schema if your Supabase project uses storage RLS.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('dispute-evidence', 'dispute-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated sellers may upload into their own folder: dispute-evidence/<user_id>/<filename>
DROP POLICY IF EXISTS "Sellers upload own dispute evidence" ON storage.objects;
CREATE POLICY "Sellers upload own dispute evidence"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Sellers read own dispute evidence" ON storage.objects;
CREATE POLICY "Sellers read own dispute evidence"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dispute-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
