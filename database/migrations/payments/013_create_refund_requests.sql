-- =============================================================================
-- Payments Phase 6: refund_requests
-- B2C buyers initiate a 14-day withdrawal; seller / admin approve or reject.
-- =============================================================================

CREATE TABLE IF NOT EXISTS refund_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL,
  order_scope           TEXT NOT NULL CHECK (order_scope IN ('wholesale','retail','social','swap')),
  transaction_id        UUID REFERENCES payment_transactions(id),
  requested_by          UUID NOT NULL,        -- buyer user_id
  reason                TEXT NOT NULL,        -- 'buyer_request' | 'damaged' | 'wrong_item' | 'not_delivered' | 'other'
  description           TEXT,
  request_type          TEXT NOT NULL DEFAULT 'partial'
                        CHECK (request_type IN ('full','partial','withdrawal')),  -- 'withdrawal' = 14-day cayma
  requested_amount      NUMERIC(12,2) NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','approved','rejected','processing','completed','cancelled')),
  decided_by            UUID,
  decided_at            TIMESTAMPTZ,
  decision_note         TEXT,
  refunded_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON refund_requests(order_id, order_scope);
CREATE INDEX IF NOT EXISTS idx_refund_requests_requested_by ON refund_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);

CREATE OR REPLACE FUNCTION refund_requests_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refund_requests_updated_at ON refund_requests;
CREATE TRIGGER trg_refund_requests_updated_at
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION refund_requests_set_updated_at();

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers read own refund_requests" ON refund_requests;
CREATE POLICY "Buyers read own refund_requests"
  ON refund_requests FOR SELECT
  USING (auth.uid() = requested_by);

DROP POLICY IF EXISTS "Buyers create refund_requests" ON refund_requests;
CREATE POLICY "Buyers create refund_requests"
  ON refund_requests FOR INSERT
  WITH CHECK (auth.uid() = requested_by);
