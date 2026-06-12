-- =============================================================================
-- Payments Phase 1 seed: launch defaults (client-confirmed)
--   * 10% flat platform commission for every scope
--   * T+30 days payout release window for every scope
-- These can be overridden later without a schema migration.
-- =============================================================================

-- Single global 10% rule. Layered lookup in code: brand override -> category override -> scope rule -> global.
INSERT INTO commission_rules (scope, percentage, flat_fee, is_active, notes)
SELECT 'global', 10.00, 0, true,
       'Launch default: 10% flat commission across all segments (client-confirmed).'
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules WHERE scope = 'global' AND category_id IS NULL AND brand_id IS NULL
);

-- T+30 release window for every scope.
INSERT INTO payout_settings (scope, release_after_days, auto_release_enabled, notes)
VALUES
  ('global',    30, true, 'Launch default: payout T+30 days (client-confirmed; tentative pending Iyzico contract).'),
  ('wholesale', 30, true, 'Launch default - matches global.'),
  ('retail',    30, true, 'Launch default - covers 14-day withdrawal + chargeback buffer.'),
  ('social',    30, true, 'Launch default - C2C dispute buffer.'),
  ('swap',      30, true, 'Launch default - swap completion buffer.')
ON CONFLICT (scope) DO NOTHING;
