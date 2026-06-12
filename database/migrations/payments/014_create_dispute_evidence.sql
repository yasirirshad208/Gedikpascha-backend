-- =============================================================================
-- Payments Phase 6: dispute_evidence
-- When a chargeback opens, the seller uploads invoice / shipping proof here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  order_id            UUID,
  uploaded_by         UUID NOT NULL,
  evidence_type       TEXT NOT NULL
                      CHECK (evidence_type IN ('invoice','shipping_proof','delivery_proof','other')),
  file_url            TEXT NOT NULL,
  file_name           TEXT,
  file_size_bytes     BIGINT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_transaction ON dispute_evidence(transaction_id);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_uploaded_by ON dispute_evidence(uploaded_by);

ALTER TABLE dispute_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers read their dispute evidence" ON dispute_evidence;
CREATE POLICY "Sellers read their dispute evidence"
  ON dispute_evidence FOR SELECT
  USING (auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "Sellers upload their dispute evidence" ON dispute_evidence;
CREATE POLICY "Sellers upload their dispute evidence"
  ON dispute_evidence FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);
