-- =============================================================================
-- Payments Phase 1: payment_splits
-- Per-seller slice of a transaction. Drives commissions, holds, payouts.
-- In Phase 1 we already write these rows (single-brand) so Phase 3 only adds logic.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_splits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id       UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  sub_merchant_key     TEXT,                              -- null until sub-merchant onboarding (Phase 2) is wired
  brand_id             UUID,                              -- nullable: social C2C uses brand_scope='social_user' + user_id
  brand_scope          TEXT NOT NULL CHECK (brand_scope IN ('wholesale_brand','retail_brand','social_user','main_merchant')),
  user_id              UUID,                              -- seller user_id (esp. social_user)
  order_id             UUID,                              -- redundant from transaction but useful for joins
  order_item_id        UUID,
  gross_amount         NUMERIC(12,2) NOT NULL,
  commission_percent   NUMERIC(5,2) NOT NULL,             -- the % applied at the time of charge
  commission_amount    NUMERIC(12,2) NOT NULL,
  psp_fee_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,  -- iyzico fee; populated when known
  net_amount           NUMERIC(12,2) NOT NULL,            -- gross - commission - psp_fee
  payout_status        TEXT NOT NULL DEFAULT 'pending'
                       CHECK (payout_status IN ('pending','approvable','approved','refunded','on_hold','cancelled')),
  payout_eligible_at   TIMESTAMPTZ,                       -- transaction.created_at + payout_settings.release_after_days
  approved_at          TIMESTAMPTZ,
  hold_reason          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_splits_transaction ON payment_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_brand ON payment_splits(brand_scope, brand_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_user ON payment_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_status ON payment_splits(payout_status);
CREATE INDEX IF NOT EXISTS idx_payment_splits_eligible
  ON payment_splits(payout_eligible_at) WHERE payout_status IN ('pending','approvable');

CREATE OR REPLACE FUNCTION payment_splits_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_splits_updated_at ON payment_splits;
CREATE TRIGGER trg_payment_splits_updated_at
  BEFORE UPDATE ON payment_splits
  FOR EACH ROW EXECUTE FUNCTION payment_splits_set_updated_at();

ALTER TABLE payment_splits ENABLE ROW LEVEL SECURITY;

-- Sellers can read their own splits
DROP POLICY IF EXISTS "Sellers read their own payment splits" ON payment_splits;
CREATE POLICY "Sellers read their own payment splits"
  ON payment_splits FOR SELECT
  USING (auth.uid() = user_id);
