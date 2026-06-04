-- 012_create_social_indexes_triggers_helpers.sql

CREATE INDEX IF NOT EXISTS idx_social_posts_caption_fts
ON social_posts USING GIN (to_tsvector('simple', COALESCE(caption, '')));

CREATE INDEX IF NOT EXISTS idx_social_reels_caption_fts
ON social_reels USING GIN (to_tsvector('simple', COALESCE(caption, '')));

CREATE INDEX IF NOT EXISTS idx_social_products_title_desc_fts
ON social_products USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, '')));

CREATE INDEX IF NOT EXISTS idx_social_notifications_unread_created
ON social_notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_swap_proposals_status
ON social_swap_proposals(listing_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_messages_created
ON social_messages(created_at DESC);

CREATE OR REPLACE FUNCTION social_slugify(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(COALESCE(input_text, 'item')), '[^a-z0-9]+', '-', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION social_generate_product_slug(p_seller_id UUID, p_title TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  candidate_slug TEXT;
  suffix_num INTEGER := 1;
BEGIN
  base_slug := social_slugify(p_title);
  IF base_slug = '' THEN
    base_slug := 'item';
  END IF;

  candidate_slug := base_slug;
  WHILE EXISTS (
    SELECT 1 FROM social_products sp
    WHERE sp.seller_id = p_seller_id
      AND sp.slug = candidate_slug
  ) LOOP
    suffix_num := suffix_num + 1;
    candidate_slug := base_slug || '-' || suffix_num;
  END LOOP;

  RETURN candidate_slug;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_set_product_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := social_generate_product_slug(NEW.seller_id, NEW.title);
  ELSE
    NEW.slug := social_slugify(NEW.slug);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_set_product_slug ON social_products;
CREATE TRIGGER trigger_social_set_product_slug
BEFORE INSERT OR UPDATE OF title, slug ON social_products
FOR EACH ROW
EXECUTE FUNCTION social_set_product_slug();

CREATE OR REPLACE FUNCTION social_apply_swap_rating_to_profile()
RETURNS TRIGGER AS $$
DECLARE
  avg_rating NUMERIC;
  total_ratings INTEGER;
BEGIN
  SELECT COALESCE(AVG(ssr.rating), 0), COUNT(*)
    INTO avg_rating, total_ratings
  FROM social_swap_ratings ssr
  WHERE ssr.reviewee_id = NEW.reviewee_id;

  UPDATE social_profiles
  SET
    rating_avg = ROUND(avg_rating::NUMERIC, 2),
    swaps_completed = (
      SELECT COUNT(*)
      FROM social_swap_transactions sst
      WHERE (sst.owner_id = NEW.reviewee_id OR sst.proposer_id = NEW.reviewee_id)
        AND sst.status = 'completed'
    ),
    seller_reputation = ROUND((COALESCE(avg_rating, 0) * 20)::NUMERIC, 2),
    updated_at = NOW()
  WHERE user_id = NEW.reviewee_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_apply_swap_rating_to_profile ON social_swap_ratings;
CREATE TRIGGER trigger_social_apply_swap_rating_to_profile
AFTER INSERT ON social_swap_ratings
FOR EACH ROW
EXECUTE FUNCTION social_apply_swap_rating_to_profile();

CREATE OR REPLACE FUNCTION social_log_swap_event(
  p_transaction_id UUID,
  p_event_type VARCHAR,
  p_actor_id UUID,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO social_swap_timeline (transaction_id, event_type, actor_id, payload)
  VALUES (p_transaction_id, p_event_type, p_actor_id, COALESCE(p_payload, '{}'::JSONB));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_mark_notification_read(p_notification_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE social_notifications
  SET is_read = true,
      read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$ LANGUAGE plpgsql;
