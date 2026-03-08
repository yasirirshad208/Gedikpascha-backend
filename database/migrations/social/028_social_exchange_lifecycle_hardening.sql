-- 028_social_exchange_lifecycle_hardening.sql
-- Adds address book + managed lifecycle helpers for social exchange.

CREATE TABLE IF NOT EXISTS social_swap_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(120),
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(60),
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120),
  postal_code VARCHAR(40),
  country VARCHAR(120) NOT NULL DEFAULT 'United States',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE social_swap_transactions
  ADD COLUMN IF NOT EXISTS owner_address_id UUID REFERENCES social_swap_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposer_address_id UUID REFERENCES social_swap_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_address_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS proposer_address_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS owner_shipped_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS proposer_shipped_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS owner_delivered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS proposer_delivered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS owner_delivery_confirmed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS proposer_delivery_confirmed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS inspection_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cash_top_up DECIMAL(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_swap_transactions_cash_top_up_non_negative'
  ) THEN
    ALTER TABLE social_swap_transactions
      ADD CONSTRAINT social_swap_transactions_cash_top_up_non_negative
      CHECK (cash_top_up >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_swap_transactions_active_listing
  ON social_swap_transactions(listing_id)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_social_swap_addresses_user
  ON social_swap_addresses(user_id, is_active, is_default DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_transactions_status_updated
  ON social_swap_transactions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_transactions_owner_updated
  ON social_swap_transactions(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_transactions_proposer_updated
  ON social_swap_transactions(proposer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_proposals_status_listing
  ON social_swap_proposals(listing_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_swap_addresses_updated_at ON social_swap_addresses;
CREATE TRIGGER trigger_social_swap_addresses_updated_at
BEFORE UPDATE ON social_swap_addresses
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_swap_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social swap addresses" ON social_swap_addresses;
CREATE POLICY "Users can view own social swap addresses"
  ON social_swap_addresses FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own social swap addresses" ON social_swap_addresses;
CREATE POLICY "Users can manage own social swap addresses"
  ON social_swap_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social swap addresses" ON social_swap_addresses;
CREATE POLICY "Service role full access social swap addresses"
  ON social_swap_addresses FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE OR REPLACE FUNCTION social_accept_swap_proposal_atomic(
  p_listing_id UUID,
  p_proposal_id UUID,
  p_actor_id UUID
)
RETURNS TABLE(
  transaction_id UUID,
  listing_id UUID,
  proposal_id UUID
) AS $$
DECLARE
  v_listing social_swap_listings%ROWTYPE;
  v_proposal social_swap_proposals%ROWTYPE;
  v_existing social_swap_transactions%ROWTYPE;
  v_transaction social_swap_transactions%ROWTYPE;
  v_listing_product social_products%ROWTYPE;
  v_proposal_product social_products%ROWTYPE;
BEGIN
  SELECT *
  INTO v_listing
  FROM social_swap_listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF v_listing.id IS NULL THEN
    RAISE EXCEPTION 'Swap listing not found';
  END IF;

  IF v_listing.owner_id <> p_actor_id THEN
    RAISE EXCEPTION 'Only listing owner can accept a proposal';
  END IF;

  IF v_listing.status <> 'open' THEN
    RAISE EXCEPTION 'Listing is not open';
  END IF;

  IF v_listing.expires_at IS NOT NULL AND v_listing.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Listing is expired';
  END IF;

  SELECT *
  INTO v_proposal
  FROM social_swap_proposals
  WHERE id = p_proposal_id
    AND listing_id = p_listing_id
  FOR UPDATE;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Swap proposal not found';
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'Swap proposal is not pending';
  END IF;

  IF v_listing.offered_product_id IS NULL OR v_proposal.offered_product_id IS NULL THEN
    RAISE EXCEPTION 'Both listing and proposal must include offered products';
  END IF;

  SELECT *
  INTO v_listing_product
  FROM social_products
  WHERE id = v_listing.offered_product_id
  FOR UPDATE;

  SELECT *
  INTO v_proposal_product
  FROM social_products
  WHERE id = v_proposal.offered_product_id
  FOR UPDATE;

  IF v_listing_product.id IS NULL OR v_proposal_product.id IS NULL THEN
    RAISE EXCEPTION 'Offered product not found';
  END IF;

  IF v_listing_product.status <> 'active'
     OR v_proposal_product.status <> 'active' THEN
    RAISE EXCEPTION 'Offered products must be active';
  END IF;

  IF COALESCE(v_listing_product.is_exchangeable, false) = false
     OR COALESCE(v_proposal_product.is_exchangeable, false) = false THEN
    RAISE EXCEPTION 'Offered products must be exchangeable';
  END IF;

  IF COALESCE(v_listing_product.available_quantity, 0) <= 0
     OR COALESCE(v_proposal_product.available_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Offered product is out of stock';
  END IF;

  SELECT *
  INTO v_existing
  FROM social_swap_transactions
  WHERE listing_id = p_listing_id
    AND status <> 'cancelled'
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing.id, v_existing.listing_id, v_existing.accepted_proposal_id;
    RETURN;
  END IF;

  UPDATE social_swap_proposals
  SET status = 'declined', updated_at = NOW()
  WHERE listing_id = p_listing_id
    AND status = 'pending'
    AND id <> p_proposal_id;

  UPDATE social_swap_proposals
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_proposal_id;

  UPDATE social_swap_listings
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_listing_id;

  INSERT INTO social_swap_transactions (
    listing_id,
    accepted_proposal_id,
    owner_id,
    proposer_id,
    status,
    cash_top_up
  ) VALUES (
    p_listing_id,
    p_proposal_id,
    v_listing.owner_id,
    v_proposal.proposer_id,
    'accepted',
    GREATEST(0, COALESCE(v_proposal.cash_top_up, 0))
  )
  RETURNING * INTO v_transaction;

  INSERT INTO social_swap_timeline (
    transaction_id,
    event_type,
    actor_id,
    payload
  ) VALUES (
    v_transaction.id,
    'swap_proposal_accepted',
    p_actor_id,
    jsonb_build_object(
      'listing_id', p_listing_id,
      'proposal_id', p_proposal_id
    )
  );

  UPDATE social_products
  SET available_quantity = GREATEST(0, available_quantity - 1),
      reserved_quantity = reserved_quantity + 1,
      status = CASE
        WHEN (available_quantity - 1) <= 0 THEN 'inactive'
        ELSE status
      END
  WHERE id IN (v_listing.offered_product_id, v_proposal.offered_product_id);

  RETURN QUERY SELECT v_transaction.id, v_transaction.listing_id, v_transaction.accepted_proposal_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_update_swap_transaction_state(
  p_transaction_id UUID,
  p_actor_id UUID,
  p_action TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  transaction_id UUID,
  status VARCHAR,
  inspection_ends_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_transaction social_swap_transactions%ROWTYPE;
  v_address social_swap_addresses%ROWTYPE;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_actor_side TEXT;
  v_reason TEXT;
  v_open_disputes INTEGER := 0;
BEGIN
  SELECT *
  INTO v_transaction
  FROM social_swap_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_transaction.id IS NULL THEN
    RAISE EXCEPTION 'Swap transaction not found';
  END IF;

  IF p_actor_id <> v_transaction.owner_id AND p_actor_id <> v_transaction.proposer_id THEN
    RAISE EXCEPTION 'You are not a participant in this transaction';
  END IF;

  v_actor_side := CASE WHEN p_actor_id = v_transaction.owner_id THEN 'owner' ELSE 'proposer' END;

  IF p_action = 'sync' THEN
    IF v_transaction.status = 'inspection'
       AND v_transaction.inspection_ends_at IS NOT NULL
       AND v_transaction.inspection_ends_at <= v_now THEN
      SELECT COUNT(*)
      INTO v_open_disputes
      FROM social_swap_disputes
      WHERE transaction_id = v_transaction.id
        AND status = 'open';

      IF v_open_disputes = 0 THEN
        UPDATE social_swap_transactions
        SET status = 'completed',
            completed_at = COALESCE(completed_at, v_now),
            updated_at = v_now
        WHERE id = v_transaction.id
        RETURNING * INTO v_transaction;

        UPDATE social_swap_listings
        SET status = 'closed', updated_at = v_now
        WHERE id = v_transaction.listing_id;

        INSERT INTO social_swap_timeline (
          transaction_id,
          event_type,
          actor_id,
          payload
        ) VALUES (
          v_transaction.id,
          'swap_completed_auto',
          NULL,
          jsonb_build_object('inspection_ended_at', v_transaction.inspection_ends_at)
        );
      END IF;
    END IF;

    RETURN QUERY SELECT v_transaction.id, v_transaction.status, v_transaction.inspection_ends_at;
    RETURN;
  END IF;

  IF p_action = 'set_address' THEN
    SELECT *
    INTO v_address
    FROM social_swap_addresses
    WHERE id = (p_payload ->> 'address_id')::UUID
      AND user_id = p_actor_id
      AND is_active = true;

    IF v_address.id IS NULL THEN
      RAISE EXCEPTION 'Address not found';
    END IF;

    IF v_actor_side = 'owner' THEN
      UPDATE social_swap_transactions
      SET owner_address_id = v_address.id,
          owner_address_snapshot = jsonb_build_object(
            'id', v_address.id,
            'label', v_address.label,
            'full_name', v_address.full_name,
            'phone', v_address.phone,
            'address_line1', v_address.address_line1,
            'address_line2', v_address.address_line2,
            'city', v_address.city,
            'state', v_address.state,
            'postal_code', v_address.postal_code,
            'country', v_address.country
          ),
          status = CASE WHEN status = 'accepted' THEN 'shipping_pending' ELSE status END,
          updated_at = v_now
      WHERE id = v_transaction.id
      RETURNING * INTO v_transaction;
    ELSE
      UPDATE social_swap_transactions
      SET proposer_address_id = v_address.id,
          proposer_address_snapshot = jsonb_build_object(
            'id', v_address.id,
            'label', v_address.label,
            'full_name', v_address.full_name,
            'phone', v_address.phone,
            'address_line1', v_address.address_line1,
            'address_line2', v_address.address_line2,
            'city', v_address.city,
            'state', v_address.state,
            'postal_code', v_address.postal_code,
            'country', v_address.country
          ),
          status = CASE WHEN status = 'accepted' THEN 'shipping_pending' ELSE status END,
          updated_at = v_now
      WHERE id = v_transaction.id
      RETURNING * INTO v_transaction;
    END IF;

    INSERT INTO social_swap_timeline (
      transaction_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      v_transaction.id,
      'swap_address_set',
      p_actor_id,
      jsonb_build_object('side', v_actor_side, 'address_id', v_address.id)
    );

    RETURN QUERY SELECT v_transaction.id, v_transaction.status, v_transaction.inspection_ends_at;
    RETURN;
  END IF;

  IF p_action = 'mark_shipped' THEN
    INSERT INTO social_swap_shipments (
      transaction_id,
      shipper_id,
      carrier,
      tracking_number,
      status,
      shipped_at,
      updated_at
    ) VALUES (
      v_transaction.id,
      p_actor_id,
      NULLIF(BTRIM(COALESCE(p_payload ->> 'carrier', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload ->> 'tracking_number', '')), ''),
      'in_transit',
      v_now,
      v_now
    )
    ON CONFLICT (transaction_id, shipper_id)
    DO UPDATE SET
      carrier = EXCLUDED.carrier,
      tracking_number = EXCLUDED.tracking_number,
      status = 'in_transit',
      shipped_at = COALESCE(social_swap_shipments.shipped_at, EXCLUDED.shipped_at),
      updated_at = v_now;

    IF v_actor_side = 'owner' THEN
      UPDATE social_swap_transactions
      SET owner_shipped_at = COALESCE(owner_shipped_at, v_now),
          status = CASE
            WHEN proposer_shipped_at IS NOT NULL OR p_actor_id = proposer_id THEN 'in_transit'
            ELSE 'shipping_pending'
          END,
          updated_at = v_now
      WHERE id = v_transaction.id
      RETURNING * INTO v_transaction;
    ELSE
      UPDATE social_swap_transactions
      SET proposer_shipped_at = COALESCE(proposer_shipped_at, v_now),
          status = CASE
            WHEN owner_shipped_at IS NOT NULL OR p_actor_id = owner_id THEN 'in_transit'
            ELSE 'shipping_pending'
          END,
          updated_at = v_now
      WHERE id = v_transaction.id
      RETURNING * INTO v_transaction;
    END IF;

    INSERT INTO social_swap_timeline (
      transaction_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      v_transaction.id,
      'swap_shipped',
      p_actor_id,
      jsonb_build_object(
        'side', v_actor_side,
        'carrier', p_payload ->> 'carrier',
        'tracking_number', p_payload ->> 'tracking_number'
      )
    );

    RETURN QUERY SELECT v_transaction.id, v_transaction.status, v_transaction.inspection_ends_at;
    RETURN;
  END IF;

  IF p_action = 'confirm_delivered' THEN
    UPDATE social_swap_shipments
    SET status = 'delivered',
        delivered_at = COALESCE(delivered_at, v_now),
        confirmed_at = COALESCE(confirmed_at, v_now),
        updated_at = v_now
    WHERE transaction_id = v_transaction.id
      AND shipper_id = p_actor_id;

    IF v_actor_side = 'owner' THEN
      UPDATE social_swap_transactions
      SET owner_delivered_at = COALESCE(owner_delivered_at, v_now),
          owner_delivery_confirmed_at = COALESCE(owner_delivery_confirmed_at, v_now),
          status = 'delivered',
          updated_at = v_now
      WHERE id = v_transaction.id
      RETURNING * INTO v_transaction;
    ELSE
      UPDATE social_swap_transactions
      SET proposer_delivered_at = COALESCE(proposer_delivered_at, v_now),
          proposer_delivery_confirmed_at = COALESCE(proposer_delivery_confirmed_at, v_now),
          status = 'delivered',
          updated_at = v_now
      WHERE id = v_transaction.id
      RETURNING * INTO v_transaction;
    END IF;

    IF v_transaction.owner_delivery_confirmed_at IS NOT NULL
       AND v_transaction.proposer_delivery_confirmed_at IS NOT NULL THEN
      UPDATE social_swap_transactions
      SET status = 'inspection',
          inspection_started_at = COALESCE(inspection_started_at, v_now),
          inspection_ends_at = COALESCE(inspection_ends_at, v_now + INTERVAL '72 hours'),
          updated_at = v_now
      WHERE id = v_transaction.id
      RETURNING * INTO v_transaction;
    END IF;

    INSERT INTO social_swap_timeline (
      transaction_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      v_transaction.id,
      'swap_delivered_confirmed',
      p_actor_id,
      jsonb_build_object('side', v_actor_side)
    );

    RETURN QUERY SELECT v_transaction.id, v_transaction.status, v_transaction.inspection_ends_at;
    RETURN;
  END IF;

  IF p_action = 'open_dispute' THEN
    v_reason := NULLIF(BTRIM(COALESCE(p_payload ->> 'reason', '')), '');
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Dispute reason is required';
    END IF;

    INSERT INTO social_swap_disputes (
      transaction_id,
      opened_by,
      reason,
      status,
      resolution_notes
    ) VALUES (
      v_transaction.id,
      p_actor_id,
      v_reason,
      'open',
      NULLIF(BTRIM(COALESCE(p_payload ->> 'details', '')), '')
    );

    UPDATE social_swap_transactions
    SET status = 'disputed',
        disputed_at = COALESCE(disputed_at, v_now),
        updated_at = v_now
    WHERE id = v_transaction.id
    RETURNING * INTO v_transaction;

    INSERT INTO social_swap_timeline (
      transaction_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      v_transaction.id,
      'swap_dispute_opened',
      p_actor_id,
      jsonb_build_object('reason', v_reason)
    );

    RETURN QUERY SELECT v_transaction.id, v_transaction.status, v_transaction.inspection_ends_at;
    RETURN;
  END IF;

  IF p_action = 'complete' THEN
    SELECT COUNT(*)
    INTO v_open_disputes
    FROM social_swap_disputes
    WHERE transaction_id = v_transaction.id
      AND status = 'open';

    IF v_open_disputes > 0 THEN
      RAISE EXCEPTION 'Open disputes must be resolved before completion';
    END IF;

    IF v_transaction.status = 'inspection'
       AND v_transaction.inspection_ends_at IS NOT NULL
       AND v_transaction.inspection_ends_at > v_now
       AND COALESCE(p_payload ->> 'force', 'false') <> 'true' THEN
      RAISE EXCEPTION 'Inspection window is still active';
    END IF;

    UPDATE social_swap_transactions
    SET status = 'completed',
        completed_at = COALESCE(completed_at, v_now),
        updated_at = v_now
    WHERE id = v_transaction.id
    RETURNING * INTO v_transaction;

    UPDATE social_swap_listings
    SET status = 'closed',
        updated_at = v_now
    WHERE id = v_transaction.listing_id;

    INSERT INTO social_swap_timeline (
      transaction_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      v_transaction.id,
      'swap_completed',
      p_actor_id,
      '{}'::jsonb
    );

    RETURN QUERY SELECT v_transaction.id, v_transaction.status, v_transaction.inspection_ends_at;
    RETURN;
  END IF;

  IF p_action = 'cancel' THEN
    UPDATE social_swap_transactions
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, v_now),
        updated_at = v_now
    WHERE id = v_transaction.id
    RETURNING * INTO v_transaction;

    UPDATE social_swap_listings
    SET status = 'cancelled',
        updated_at = v_now
    WHERE id = v_transaction.listing_id;

    INSERT INTO social_swap_timeline (
      transaction_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      v_transaction.id,
      'swap_cancelled',
      p_actor_id,
      '{}'::jsonb
    );

    RETURN QUERY SELECT v_transaction.id, v_transaction.status, v_transaction.inspection_ends_at;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Unsupported action: %', p_action;
END;
$$ LANGUAGE plpgsql;
