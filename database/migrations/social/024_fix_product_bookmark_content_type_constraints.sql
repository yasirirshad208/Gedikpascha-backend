-- 024_fix_product_bookmark_content_type_constraints.sql
-- Purpose:
-- 1) Normalize any legacy engagement rows that used content_type='listing' to 'product'
-- 2) Ensure engagement/report/hide tables all allow content_type IN ('post','reel','product')
-- 3) Refresh product counters after normalization

-- Deduplicate legacy + canonical rows before converting listing -> product
DELETE FROM social_likes legacy
USING social_likes canonical
WHERE legacy.user_id = canonical.user_id
  AND legacy.content_id = canonical.content_id
  AND legacy.content_type = 'listing'
  AND canonical.content_type = 'product';

DELETE FROM social_saves legacy
USING social_saves canonical
WHERE legacy.user_id = canonical.user_id
  AND legacy.content_id = canonical.content_id
  AND legacy.content_type = 'listing'
  AND canonical.content_type = 'product';

DO $$
BEGIN
  IF to_regclass('public.social_content_reports') IS NOT NULL THEN
    DELETE FROM social_content_reports legacy
    USING social_content_reports canonical
    WHERE legacy.user_id = canonical.user_id
      AND legacy.content_id = canonical.content_id
      AND legacy.content_type = 'listing'
      AND canonical.content_type = 'product';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.social_content_hides') IS NOT NULL THEN
    DELETE FROM social_content_hides legacy
    USING social_content_hides canonical
    WHERE legacy.user_id = canonical.user_id
      AND legacy.content_id = canonical.content_id
      AND legacy.content_type = 'listing'
      AND canonical.content_type = 'product';
  END IF;
END $$;

-- Normalize legacy value if present
UPDATE social_likes SET content_type = 'product' WHERE content_type = 'listing';
UPDATE social_comments SET content_type = 'product' WHERE content_type = 'listing';
UPDATE social_saves SET content_type = 'product' WHERE content_type = 'listing';
UPDATE social_shares SET content_type = 'product' WHERE content_type = 'listing';
UPDATE social_views SET content_type = 'product' WHERE content_type = 'listing';
DO $$
BEGIN
  IF to_regclass('public.social_content_reports') IS NOT NULL THEN
    UPDATE social_content_reports
    SET content_type = 'product'
    WHERE content_type = 'listing';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.social_content_hides') IS NOT NULL THEN
    UPDATE social_content_hides
    SET content_type = 'product'
    WHERE content_type = 'listing';
  END IF;
END $$;

-- Recreate content_type checks with canonical set
ALTER TABLE IF EXISTS social_likes
  DROP CONSTRAINT IF EXISTS social_likes_content_type_check;
ALTER TABLE IF EXISTS social_likes
  ADD CONSTRAINT social_likes_content_type_check
  CHECK (content_type IN ('post', 'reel', 'product'));

ALTER TABLE IF EXISTS social_comments
  DROP CONSTRAINT IF EXISTS social_comments_content_type_check;
ALTER TABLE IF EXISTS social_comments
  ADD CONSTRAINT social_comments_content_type_check
  CHECK (content_type IN ('post', 'reel', 'product'));

ALTER TABLE IF EXISTS social_saves
  DROP CONSTRAINT IF EXISTS social_saves_content_type_check;
ALTER TABLE IF EXISTS social_saves
  ADD CONSTRAINT social_saves_content_type_check
  CHECK (content_type IN ('post', 'reel', 'product'));

ALTER TABLE IF EXISTS social_shares
  DROP CONSTRAINT IF EXISTS social_shares_content_type_check;
ALTER TABLE IF EXISTS social_shares
  ADD CONSTRAINT social_shares_content_type_check
  CHECK (content_type IN ('post', 'reel', 'product'));

ALTER TABLE IF EXISTS social_views
  DROP CONSTRAINT IF EXISTS social_views_content_type_check;
ALTER TABLE IF EXISTS social_views
  ADD CONSTRAINT social_views_content_type_check
  CHECK (content_type IN ('post', 'reel', 'product'));

ALTER TABLE IF EXISTS social_content_reports
  DROP CONSTRAINT IF EXISTS social_content_reports_content_type_check;
ALTER TABLE IF EXISTS social_content_reports
  ADD CONSTRAINT social_content_reports_content_type_check
  CHECK (content_type IN ('post', 'reel', 'product'));

ALTER TABLE IF EXISTS social_content_hides
  DROP CONSTRAINT IF EXISTS social_content_hides_content_type_check;
ALTER TABLE IF EXISTS social_content_hides
  ADD CONSTRAINT social_content_hides_content_type_check
  CHECK (content_type IN ('post', 'reel', 'product'));

-- Keep product counters consistent after normalization
DO $$
DECLARE
  product_row RECORD;
BEGIN
  IF to_regprocedure('social_refresh_content_counters(character varying,uuid)') IS NULL THEN
    RETURN;
  END IF;

  FOR product_row IN
    SELECT DISTINCT content_id
    FROM (
      SELECT content_id FROM social_likes WHERE content_type = 'product'
      UNION
      SELECT content_id FROM social_comments WHERE content_type = 'product'
      UNION
      SELECT content_id FROM social_saves WHERE content_type = 'product'
      UNION
      SELECT content_id FROM social_shares WHERE content_type = 'product'
      UNION
      SELECT content_id FROM social_views WHERE content_type = 'product'
    ) merged
  LOOP
    PERFORM social_refresh_content_counters('product', product_row.content_id);
  END LOOP;
END $$;
