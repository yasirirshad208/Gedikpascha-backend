-- 029_add_swap_offered_quantities.sql
-- Adds offered quantity fields for swap listings/proposals and quantity-aware acceptance.

ALTER TABLE social_swap_listings
  ADD COLUMN IF NOT EXISTS offered_quantity INTEGER NOT NULL DEFAULT 1;

ALTER TABLE social_swap_proposals
  ADD COLUMN IF NOT EXISTS offered_quantity INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_swap_listings_offered_quantity_positive'
  ) THEN
    ALTER TABLE social_swap_listings
      ADD CONSTRAINT social_swap_listings_offered_quantity_positive
      CHECK (offered_quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_swap_proposals_offered_quantity_positive'
  ) THEN
    ALTER TABLE social_swap_proposals
      ADD CONSTRAINT social_swap_proposals_offered_quantity_positive
      CHECK (offered_quantity > 0);
  END IF;
END;
$$;

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
  v_listing_quantity INTEGER := 1;
  v_proposal_quantity INTEGER := 1;
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

  v_listing_quantity := GREATEST(1, COALESCE(v_listing.offered_quantity, 1));
  v_proposal_quantity := GREATEST(1, COALESCE(v_proposal.offered_quantity, 1));

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

  IF COALESCE(v_listing_product.available_quantity, 0) < v_listing_quantity
     OR COALESCE(v_proposal_product.available_quantity, 0) < v_proposal_quantity THEN
    RAISE EXCEPTION 'Offered product quantity exceeds available stock';
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
      'proposal_id', p_proposal_id,
      'listing_offered_quantity', v_listing_quantity,
      'proposal_offered_quantity', v_proposal_quantity
    )
  );

  UPDATE social_products
  SET available_quantity = GREATEST(0, available_quantity - v_listing_quantity),
      reserved_quantity = reserved_quantity + v_listing_quantity,
      status = CASE
        WHEN (available_quantity - v_listing_quantity) <= 0 THEN 'inactive'
        ELSE status
      END
  WHERE id = v_listing.offered_product_id;

  UPDATE social_products
  SET available_quantity = GREATEST(0, available_quantity - v_proposal_quantity),
      reserved_quantity = reserved_quantity + v_proposal_quantity,
      status = CASE
        WHEN (available_quantity - v_proposal_quantity) <= 0 THEN 'inactive'
        ELSE status
      END
  WHERE id = v_proposal.offered_product_id;

  RETURN QUERY SELECT v_transaction.id, v_transaction.listing_id, v_transaction.accepted_proposal_id;
END;
$$ LANGUAGE plpgsql;

