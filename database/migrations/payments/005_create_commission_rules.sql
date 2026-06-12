-- =============================================================================
-- Payments Phase 1: commission_rules
-- Configurable platform commission. Seeded with a single 10% global rule.
-- Future per-scope, per-category, per-brand overrides require no schema change.
-- =============================================================================

CREATE TABLE IF NOT EXISTS commission_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL CHECK (scope IN ('global','wholesale','retail','social','swap')),
  category_id     UUID,                                  -- nullable: applies to all categories within scope
  brand_id        UUID,                                  -- nullable: applies to all brands within scope/category
  percentage      NUMERIC(5,2) NOT NULL,
  flat_fee        NUMERIC(8,2) NOT NULL DEFAULT 0,
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to    TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_lookup
  ON commission_rules(scope, category_id, brand_id, is_active);

CREATE INDEX IF NOT EXISTS idx_commission_rules_effective
  ON commission_rules(effective_from, effective_to);

CREATE OR REPLACE FUNCTION commission_rules_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_rules_updated_at ON commission_rules;
CREATE TRIGGER trg_commission_rules_updated_at
  BEFORE UPDATE ON commission_rules
  FOR EACH ROW EXECUTE FUNCTION commission_rules_set_updated_at();

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
