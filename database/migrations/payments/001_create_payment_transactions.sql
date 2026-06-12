-- =============================================================================
-- Payments Phase 1: payment_transactions
-- Source of truth for every Iyzico interaction. One row per checkout-form session.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID,                              -- nullable: swap differentials have no order_id
  order_scope          TEXT NOT NULL CHECK (order_scope IN ('wholesale','retail','social','swap')),
  user_id              UUID,                              -- payer; null for guest checkouts
  provider             TEXT NOT NULL DEFAULT 'iyzico',
  provider_payment_id  TEXT,                              -- iyzico paymentId (only known after success)
  provider_token       TEXT,                              -- iyzico checkout form token
  provider_conv_id     TEXT NOT NULL,                     -- our conversationId
  status               TEXT NOT NULL DEFAULT 'init'
                       CHECK (status IN ('init','pending','success','failure','refunded','partially_refunded','cancelled')),
  failure_code         TEXT,
  failure_message      TEXT,
  amount               NUMERIC(12,2) NOT NULL,
  paid_price           NUMERIC(12,2),                     -- final price after installment surcharge (if any)
  currency             TEXT NOT NULL DEFAULT 'TRY',
  installment          INT NOT NULL DEFAULT 1,
  card_family          TEXT,
  card_association     TEXT,
  card_type            TEXT,
  last_four_digits     TEXT,
  buyer_ip             TEXT,
  raw_request          JSONB,
  raw_response         JSONB,                             -- full iyzico response for audit
  refunded_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order
  ON payment_transactions(order_id, order_scope);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user
  ON payment_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
  ON payment_transactions(status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_payment_id
  ON payment_transactions(provider_payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_conv
  ON payment_transactions(provider_conv_id);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION payment_transactions_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER trg_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION payment_transactions_set_updated_at();

-- RLS: backend uses service_role, so we keep policies minimal.
-- Buyers can read their own transactions; nothing else from the client side.
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own payment transactions" ON payment_transactions;
CREATE POLICY "Users read their own payment transactions"
  ON payment_transactions FOR SELECT
  USING (auth.uid() = user_id);
