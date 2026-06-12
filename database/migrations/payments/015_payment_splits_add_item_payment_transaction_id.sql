-- =============================================================================
-- Payments Phase 3/6: track Iyzico's per-item paymentTransactionId on each split
-- so refunds and approve/disapprove calls can target the right Iyzico record.
-- =============================================================================

ALTER TABLE payment_splits
  ADD COLUMN IF NOT EXISTS provider_payment_tx_id  TEXT,
  ADD COLUMN IF NOT EXISTS basket_item_id          TEXT,
  ADD COLUMN IF NOT EXISTS sub_merchant_payout     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refunded_amount         NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payment_splits_provider_payment_tx
  ON payment_splits(provider_payment_tx_id);
