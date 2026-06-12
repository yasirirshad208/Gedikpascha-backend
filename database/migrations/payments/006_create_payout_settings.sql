-- =============================================================================
-- Payments Phase 1: payout_settings
-- Single source of truth for the payout-release window.
-- Seeded with 30 days (T+30) per client decision; revisit after Iyzico contract.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payout_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                    TEXT NOT NULL UNIQUE
                           CHECK (scope IN ('global','wholesale','retail','social','swap')),
  release_after_days       INT NOT NULL,
  auto_release_enabled     BOOLEAN NOT NULL DEFAULT true,
  notes                    TEXT,
  created_by               UUID,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION payout_settings_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payout_settings_updated_at ON payout_settings;
CREATE TRIGGER trg_payout_settings_updated_at
  BEFORE UPDATE ON payout_settings
  FOR EACH ROW EXECUTE FUNCTION payout_settings_set_updated_at();

ALTER TABLE payout_settings ENABLE ROW LEVEL SECURITY;
