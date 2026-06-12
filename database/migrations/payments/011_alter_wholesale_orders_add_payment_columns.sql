-- =============================================================================
-- Payments Phase 4: wholesale order payment columns (parallel to retail).
-- B2B has no 14-day withdrawal right; refund_due_until stays null.
-- =============================================================================

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS payment_provider           TEXT DEFAULT 'iyzico',
  ADD COLUMN IF NOT EXISTS payment_transaction_id     UUID REFERENCES payment_transactions(id),
  ADD COLUMN IF NOT EXISTS payment_intent_token       TEXT,
  ADD COLUMN IF NOT EXISTS buyer_ip                   TEXT,
  ADD COLUMN IF NOT EXISTS buyer_identity_number      TEXT,
  ADD COLUMN IF NOT EXISTS buyer_registration_address TEXT,
  ADD COLUMN IF NOT EXISTS refunded_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_at               TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wholesale_orders_payment_transaction
  ON wholesale_orders(payment_transaction_id);

ALTER TABLE wholesale_order_items
  ADD COLUMN IF NOT EXISTS vat_mode    TEXT NOT NULL DEFAULT 'included'
    CHECK (vat_mode IN ('included','excluded','none')),
  ADD COLUMN IF NOT EXISTS vat_rate    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS vat_amount  NUMERIC(12,2);

-- Also propagate delivered_at to retail (was deferred to Phase 4 in the plan).
ALTER TABLE retail_orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
