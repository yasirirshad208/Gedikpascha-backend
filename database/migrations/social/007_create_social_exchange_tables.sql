-- 007_create_social_exchange_tables.sql

CREATE TABLE IF NOT EXISTS social_swap_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offered_product_id UUID REFERENCES social_products(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,

  wanted_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  wanted_subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
  wanted_sub_subcategory_id UUID REFERENCES sub_subcategories(id) ON DELETE SET NULL,
  wanted_description TEXT,
  wanted_min_value DECIMAL(12,2),
  wanted_max_value DECIMAL(12,2),

  offered_value DECIMAL(12,2),
  is_cash_top_up_allowed BOOLEAN NOT NULL DEFAULT true,

  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'closed', 'cancelled', 'expired')),
  proposal_count INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,

  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_swap_wants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES social_swap_listings(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
  sub_subcategory_id UUID REFERENCES sub_subcategories(id) ON DELETE SET NULL,
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_swap_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES social_swap_listings(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offered_product_id UUID REFERENCES social_products(id) ON DELETE SET NULL,
  offered_value DECIMAL(12,2),
  cash_top_up DECIMAL(12,2) DEFAULT 0,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, proposer_id, offered_product_id)
);

CREATE TABLE IF NOT EXISTS social_swap_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES social_swap_listings(id) ON DELETE CASCADE,
  accepted_proposal_id UUID NOT NULL REFERENCES social_swap_proposals(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'shipping_pending', 'in_transit', 'delivered', 'inspection', 'completed', 'disputed', 'cancelled')),
  inspection_ends_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (accepted_proposal_id)
);

CREATE TABLE IF NOT EXISTS social_swap_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  shipper_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  carrier VARCHAR(120),
  tracking_number VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'label_created' CHECK (status IN ('label_created', 'in_transit', 'delivered', 'confirmed', 'failed')),
  shipped_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, shipper_id)
);

CREATE TABLE IF NOT EXISTS social_swap_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_swap_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_swap_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES social_swap_transactions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_social_swap_listings_owner ON social_swap_listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_listings_status ON social_swap_listings(status);
CREATE INDEX IF NOT EXISTS idx_social_swap_listings_created_at ON social_swap_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_proposals_listing ON social_swap_proposals(listing_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_proposals_proposer ON social_swap_proposals(proposer_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_transactions_listing ON social_swap_transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_shipments_transaction ON social_swap_shipments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_disputes_transaction ON social_swap_disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_social_swap_timeline_transaction ON social_swap_timeline(transaction_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_swap_listings_updated_at ON social_swap_listings;
CREATE TRIGGER trigger_social_swap_listings_updated_at
BEFORE UPDATE ON social_swap_listings
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_swap_proposals_updated_at ON social_swap_proposals;
CREATE TRIGGER trigger_social_swap_proposals_updated_at
BEFORE UPDATE ON social_swap_proposals
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_swap_transactions_updated_at ON social_swap_transactions;
CREATE TRIGGER trigger_social_swap_transactions_updated_at
BEFORE UPDATE ON social_swap_transactions
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_swap_shipments_updated_at ON social_swap_shipments;
CREATE TRIGGER trigger_social_swap_shipments_updated_at
BEFORE UPDATE ON social_swap_shipments
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

DROP TRIGGER IF EXISTS trigger_social_swap_disputes_updated_at ON social_swap_disputes;
CREATE TRIGGER trigger_social_swap_disputes_updated_at
BEFORE UPDATE ON social_swap_disputes
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_sync_swap_proposal_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE social_swap_listings SET proposal_count = proposal_count + 1 WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE social_swap_listings SET proposal_count = GREATEST(0, proposal_count - 1) WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_swap_proposal_count ON social_swap_proposals;
CREATE TRIGGER trigger_social_swap_proposal_count
AFTER INSERT OR DELETE ON social_swap_proposals
FOR EACH ROW
EXECUTE FUNCTION social_sync_swap_proposal_count();

ALTER TABLE social_swap_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_wants ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_swap_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view open social swap listings" ON social_swap_listings;
CREATE POLICY "Public can view open social swap listings"
  ON social_swap_listings FOR SELECT
  USING (status IN ('open', 'accepted', 'closed'));

DROP POLICY IF EXISTS "Users can manage own social swap listings" ON social_swap_listings;
CREATE POLICY "Users can manage own social swap listings"
  ON social_swap_listings FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Public can view social swap wants" ON social_swap_wants;
CREATE POLICY "Public can view social swap wants"
  ON social_swap_wants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Listing owners can manage social swap wants" ON social_swap_wants;
CREATE POLICY "Listing owners can manage social swap wants"
  ON social_swap_wants FOR ALL
  USING (
    EXISTS (SELECT 1 FROM social_swap_listings ssl WHERE ssl.id = social_swap_wants.listing_id AND ssl.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM social_swap_listings ssl WHERE ssl.id = social_swap_wants.listing_id AND ssl.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view related social swap proposals" ON social_swap_proposals;
CREATE POLICY "Users can view related social swap proposals"
  ON social_swap_proposals FOR SELECT
  USING (
    proposer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM social_swap_listings ssl WHERE ssl.id = social_swap_proposals.listing_id AND ssl.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create own social swap proposals" ON social_swap_proposals;
CREATE POLICY "Users can create own social swap proposals"
  ON social_swap_proposals FOR INSERT
  WITH CHECK (auth.uid() = proposer_id);

DROP POLICY IF EXISTS "Proposal owner or listing owner can update social swap proposals" ON social_swap_proposals;
CREATE POLICY "Proposal owner or listing owner can update social swap proposals"
  ON social_swap_proposals FOR UPDATE
  USING (
    proposer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM social_swap_listings ssl WHERE ssl.id = social_swap_proposals.listing_id AND ssl.owner_id = auth.uid())
  )
  WITH CHECK (
    proposer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM social_swap_listings ssl WHERE ssl.id = social_swap_proposals.listing_id AND ssl.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own social swap transactions" ON social_swap_transactions;
CREATE POLICY "Users can view own social swap transactions"
  ON social_swap_transactions FOR SELECT
  USING (owner_id = auth.uid() OR proposer_id = auth.uid());

DROP POLICY IF EXISTS "Participants can update social swap transactions" ON social_swap_transactions;
CREATE POLICY "Participants can update social swap transactions"
  ON social_swap_transactions FOR UPDATE
  USING (owner_id = auth.uid() OR proposer_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() OR proposer_id = auth.uid());

DROP POLICY IF EXISTS "Participants can view social swap shipments" ON social_swap_shipments;
CREATE POLICY "Participants can view social swap shipments"
  ON social_swap_shipments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_swap_transactions sst
      WHERE sst.id = social_swap_shipments.transaction_id
      AND (sst.owner_id = auth.uid() OR sst.proposer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can manage own social swap shipments" ON social_swap_shipments;
CREATE POLICY "Participants can manage own social swap shipments"
  ON social_swap_shipments FOR ALL
  USING (shipper_id = auth.uid())
  WITH CHECK (shipper_id = auth.uid());

DROP POLICY IF EXISTS "Participants can view social swap disputes" ON social_swap_disputes;
CREATE POLICY "Participants can view social swap disputes"
  ON social_swap_disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_swap_transactions sst
      WHERE sst.id = social_swap_disputes.transaction_id
      AND (sst.owner_id = auth.uid() OR sst.proposer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can create social swap disputes" ON social_swap_disputes;
CREATE POLICY "Participants can create social swap disputes"
  ON social_swap_disputes FOR INSERT
  WITH CHECK (opened_by = auth.uid());

DROP POLICY IF EXISTS "Participants can view social swap timeline" ON social_swap_timeline;
CREATE POLICY "Participants can view social swap timeline"
  ON social_swap_timeline FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_swap_transactions sst
      WHERE sst.id = social_swap_timeline.transaction_id
      AND (sst.owner_id = auth.uid() OR sst.proposer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role full access social swap timeline" ON social_swap_timeline;
CREATE POLICY "Service role full access social swap timeline"
  ON social_swap_timeline FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Participants can view social swap ratings" ON social_swap_ratings;
CREATE POLICY "Participants can view social swap ratings"
  ON social_swap_ratings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Participants can create social swap ratings" ON social_swap_ratings;
CREATE POLICY "Participants can create social swap ratings"
  ON social_swap_ratings FOR INSERT
  WITH CHECK (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access social swap entities" ON social_swap_listings;
CREATE POLICY "Service role full access social swap entities"
  ON social_swap_listings FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social swap wants" ON social_swap_wants;
CREATE POLICY "Service role full access social swap wants"
  ON social_swap_wants FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social swap proposals" ON social_swap_proposals;
CREATE POLICY "Service role full access social swap proposals"
  ON social_swap_proposals FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social swap transactions" ON social_swap_transactions;
CREATE POLICY "Service role full access social swap transactions"
  ON social_swap_transactions FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social swap shipments" ON social_swap_shipments;
CREATE POLICY "Service role full access social swap shipments"
  ON social_swap_shipments FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social swap disputes" ON social_swap_disputes;
CREATE POLICY "Service role full access social swap disputes"
  ON social_swap_disputes FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social swap ratings" ON social_swap_ratings;
CREATE POLICY "Service role full access social swap ratings"
  ON social_swap_ratings FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
