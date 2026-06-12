-- =============================================================================
-- Payments Phase 1 (schema only) / Phase 2 (logic): sub_merchants
-- One row per brand or social-seller registered with Iyzico marketplace.
-- Phase 1 ships the table empty; Phase 2 wires brand approval -> creation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sub_merchants (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                    UUID,                       -- nullable for social_user where seller is the user themselves
  brand_scope                 TEXT NOT NULL CHECK (brand_scope IN ('wholesale_brand','retail_brand','social_user')),
  user_id                     UUID,                       -- the natural person who owns the brand / social account
  sub_merchant_external_id    TEXT NOT NULL UNIQUE,       -- our identifier we send to iyzico
  sub_merchant_key            TEXT UNIQUE,                -- key iyzico returns; null until creation succeeds
  sub_merchant_type           TEXT NOT NULL
                              CHECK (sub_merchant_type IN ('PERSONAL','PRIVATE_COMPANY','LIMITED_OR_JOINT_STOCK_COMPANY')),
  legal_company_title         TEXT,
  tax_office                  TEXT,
  tax_number                  TEXT,
  identity_number             TEXT,                       -- TC kimlik for PERSONAL
  iban                        TEXT,
  contact_name                TEXT,
  contact_surname             TEXT,
  email                       TEXT,
  gsm_number                  TEXT,
  address                     TEXT,
  currency                    TEXT NOT NULL DEFAULT 'TRY',
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','submitted','active','rejected','suspended')),
  provider_raw                JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_merchants_brand ON sub_merchants(brand_scope, brand_id);
CREATE INDEX IF NOT EXISTS idx_sub_merchants_user ON sub_merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_merchants_status ON sub_merchants(status);

CREATE OR REPLACE FUNCTION sub_merchants_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sub_merchants_updated_at ON sub_merchants;
CREATE TRIGGER trg_sub_merchants_updated_at
  BEFORE UPDATE ON sub_merchants
  FOR EACH ROW EXECUTE FUNCTION sub_merchants_set_updated_at();

ALTER TABLE sub_merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers read their own sub_merchant" ON sub_merchants;
CREATE POLICY "Sellers read their own sub_merchant"
  ON sub_merchants FOR SELECT
  USING (auth.uid() = user_id);
