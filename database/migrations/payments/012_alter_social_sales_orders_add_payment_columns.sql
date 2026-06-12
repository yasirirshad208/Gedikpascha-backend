-- =============================================================================
-- Payments Phase 5: social order payment columns + C2C VAT lock.
-- =============================================================================

ALTER TABLE social_sales_orders
  ADD COLUMN IF NOT EXISTS payment_provider           TEXT DEFAULT 'iyzico',
  ADD COLUMN IF NOT EXISTS payment_transaction_id     UUID REFERENCES payment_transactions(id),
  ADD COLUMN IF NOT EXISTS payment_intent_token       TEXT,
  -- payment_status mirrors wholesale_orders/retail_orders: pending | paid | failed
  -- | refunded | partial_refund | cancelled. The base table only has the
  -- fulfilment `status` column, so the payments flow needs this added explicitly.
  ADD COLUMN IF NOT EXISTS payment_status             VARCHAR(50) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS buyer_ip                   TEXT,
  ADD COLUMN IF NOT EXISTS buyer_identity_number      TEXT,
  ADD COLUMN IF NOT EXISTS buyer_registration_address TEXT,
  ADD COLUMN IF NOT EXISTS refunded_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_at               TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_social_sales_orders_payment_transaction
  ON social_sales_orders(payment_transaction_id);

CREATE INDEX IF NOT EXISTS idx_social_sales_orders_payment_status
  ON social_sales_orders(payment_status);

ALTER TABLE social_sales_order_items
  ADD COLUMN IF NOT EXISTS vat_mode    TEXT NOT NULL DEFAULT 'none'
    CHECK (vat_mode IN ('included','excluded','none')),
  ADD COLUMN IF NOT EXISTS vat_rate    NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount  NUMERIC(12,2) DEFAULT 0;
