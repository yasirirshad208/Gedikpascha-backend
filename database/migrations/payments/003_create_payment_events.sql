-- =============================================================================
-- Payments Phase 1: payment_events
-- Idempotent webhook ingest. Iyzico HMAC-signed events are inserted here first,
-- then dispatched to handlers. Every row is the raw truth, never overwritten.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             TEXT NOT NULL,                     -- iyzico-provided id (idempotency key)
  event_type           TEXT NOT NULL,                     -- e.g. 'PAYMENT.SUCCESS', 'REFUND.SUCCESS', 'CHARGEBACK.OPEN'
  provider             TEXT NOT NULL DEFAULT 'iyzico',
  provider_payment_id  TEXT,
  payload              JSONB NOT NULL,
  signature            TEXT,
  verified             BOOLEAN NOT NULL DEFAULT false,
  processed_at         TIMESTAMPTZ,
  process_error        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_event_id
  ON payment_events(provider, event_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON payment_events(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_unprocessed
  ON payment_events(created_at) WHERE processed_at IS NULL;

-- RLS off: this table is backend-only.
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
