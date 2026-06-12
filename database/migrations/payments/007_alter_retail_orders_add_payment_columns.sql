-- =============================================================================
-- Payments Phase 1: extend retail_orders with payment-provider columns
-- =============================================================================

ALTER TABLE retail_orders
  ADD COLUMN IF NOT EXISTS payment_provider           TEXT DEFAULT 'iyzico',
  ADD COLUMN IF NOT EXISTS payment_transaction_id     UUID REFERENCES payment_transactions(id),
  ADD COLUMN IF NOT EXISTS payment_intent_token       TEXT,            -- iyzico checkoutForm token
  ADD COLUMN IF NOT EXISTS buyer_ip                   TEXT,
  ADD COLUMN IF NOT EXISTS buyer_identity_number      TEXT,            -- required by iyzico (TC kimlik or "11111111111" for B2B)
  ADD COLUMN IF NOT EXISTS buyer_registration_address TEXT,
  ADD COLUMN IF NOT EXISTS refunded_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_due_until           TIMESTAMPTZ,     -- 14-day withdrawal window (B2C)
  ADD COLUMN IF NOT EXISTS delivered_at               TIMESTAMPTZ;

-- payment_method was previously 'cash_on_delivery'; COD has been removed by client decision.
-- Existing 'cash_on_delivery' rows remain readable; new orders are 'iyzico'.
-- We keep the column free-form (no enum lock-in) so a future provider can plug in.

CREATE INDEX IF NOT EXISTS idx_retail_orders_payment_status ON retail_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_retail_orders_payment_transaction ON retail_orders(payment_transaction_id);
