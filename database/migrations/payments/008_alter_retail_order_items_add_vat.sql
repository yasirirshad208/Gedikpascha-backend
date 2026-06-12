-- =============================================================================
-- Payments Phase 1: VAT (KDV) columns on retail order items.
-- Per client decision: B2C is locked to vat_mode='included'.
-- (Wholesale + social order items get the same columns in Phase 4 / Phase 5.)
-- =============================================================================

ALTER TABLE retail_order_items
  ADD COLUMN IF NOT EXISTS vat_mode    TEXT NOT NULL DEFAULT 'included'
                           CHECK (vat_mode IN ('included','excluded','none')),
  ADD COLUMN IF NOT EXISTS vat_rate    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS vat_amount  NUMERIC(12,2);
