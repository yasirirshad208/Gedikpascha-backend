-- ============================================================================
-- 035: Allow several items to be offered in one exchange, and let the person
--      receiving the offer choose which of them they actually want.
--
-- Before this, a listing/proposal could reference exactly one product via
-- offered_product_id. These columns hold the full set. offered_product_id is
-- kept in sync with the FIRST entry so existing queries, views and previews
-- keep working unchanged.
-- ============================================================================

-- All items offered on a listing.
ALTER TABLE social_swap_listings
  ADD COLUMN IF NOT EXISTS offered_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- All items offered on a proposal, plus the subset the listing owner accepted.
ALTER TABLE social_swap_proposals
  ADD COLUMN IF NOT EXISTS offered_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE social_swap_proposals
  ADD COLUMN IF NOT EXISTS selected_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: existing rows become single-item sets so old and new rows read the same.
UPDATE social_swap_listings
   SET offered_product_ids = jsonb_build_array(offered_product_id)
 WHERE offered_product_id IS NOT NULL
   AND (offered_product_ids IS NULL OR offered_product_ids = '[]'::jsonb);

UPDATE social_swap_proposals
   SET offered_product_ids = jsonb_build_array(offered_product_id)
 WHERE offered_product_id IS NOT NULL
   AND (offered_product_ids IS NULL OR offered_product_ids = '[]'::jsonb);

-- An accepted proposal that predates this migration implicitly had its single
-- offered item selected.
UPDATE social_swap_proposals
   SET selected_product_ids = jsonb_build_array(offered_product_id)
 WHERE status = 'accepted'
   AND offered_product_id IS NOT NULL
   AND (selected_product_ids IS NULL OR selected_product_ids = '[]'::jsonb);

CREATE INDEX IF NOT EXISTS idx_social_swap_listings_offered_ids
  ON social_swap_listings USING GIN (offered_product_ids);

CREATE INDEX IF NOT EXISTS idx_social_swap_proposals_offered_ids
  ON social_swap_proposals USING GIN (offered_product_ids);
