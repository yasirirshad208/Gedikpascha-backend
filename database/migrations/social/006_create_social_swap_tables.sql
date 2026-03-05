CREATE TABLE IF NOT EXISTS social_swap_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  description TEXT,
  wanted_category VARCHAR(120) NOT NULL,
  wanted_description TEXT,
  wanted_alternatives TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  wanted_min_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  wanted_max_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  offered_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_top_up_allowed BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  accepted_proposal_id UUID,
  views_count INTEGER NOT NULL DEFAULT 0,
  proposal_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_swap_listing_status CHECK (status IN ('open', 'accepted', 'closed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS social_swap_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES social_swap_listings(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  offered_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_top_up NUMERIC(12,2) NOT NULL DEFAULT 0,
  message TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_swap_proposal_status CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS social_swap_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES social_swap_listings(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES social_swap_proposals(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'accepted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  inspection_ends_at TIMESTAMPTZ,
  CONSTRAINT social_swap_txn_status CHECK (status IN ('accepted', 'in_transit', 'delivered', 'completed', 'disputed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS social_swap_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  side VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  tracking_number VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_swap_ship_side CHECK (side IN ('owner', 'proposer')),
  CONSTRAINT social_swap_ship_status CHECK (status IN ('pending', 'shipped', 'delivered')),
  CONSTRAINT social_swap_ship_unique UNIQUE (transaction_id, side)
);

CREATE TABLE IF NOT EXISTS social_swap_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason VARCHAR(240) NOT NULL,
  details TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT social_swap_dispute_status CHECK (status IN ('open', 'resolved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS social_swap_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES social_swap_listings(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_swap_listings_owner ON social_swap_listings(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_listings_status ON social_swap_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_proposals_listing ON social_swap_proposals(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_proposals_proposer ON social_swap_proposals(proposer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_transactions_listing ON social_swap_transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_shipments_txn ON social_swap_shipments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_disputes_txn ON social_swap_disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_timeline_listing ON social_swap_timeline(listing_id, created_at DESC);

ALTER TABLE social_swap_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read open swap listings" ON social_swap_listings;
CREATE POLICY "Public read open swap listings"
  ON social_swap_listings FOR SELECT
  USING (status IN ('open', 'accepted'));

DROP POLICY IF EXISTS "Users manage own swap listings" ON social_swap_listings;
CREATE POLICY "Users manage own swap listings"
  ON social_swap_listings FOR ALL
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users read related proposals" ON social_swap_proposals;
CREATE POLICY "Users read related proposals"
  ON social_swap_proposals FOR SELECT
  USING (
    auth.uid() = proposer_id OR
    EXISTS (
      SELECT 1 FROM social_swap_listings l
      WHERE l.id = social_swap_proposals.listing_id
      AND l.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users create own proposals" ON social_swap_proposals;
CREATE POLICY "Users create own proposals"
  ON social_swap_proposals FOR INSERT
  WITH CHECK (auth.uid() = proposer_id);

DROP POLICY IF EXISTS "Users update own proposals or owner" ON social_swap_proposals;
CREATE POLICY "Users update own proposals or owner"
  ON social_swap_proposals FOR UPDATE
  USING (
    auth.uid() = proposer_id OR
    EXISTS (
      SELECT 1 FROM social_swap_listings l
      WHERE l.id = social_swap_proposals.listing_id
      AND l.owner_id = auth.uid()
    )
  );
