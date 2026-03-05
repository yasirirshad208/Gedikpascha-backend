CREATE OR REPLACE FUNCTION social_update_follow_counters()
RETURNS TRIGGER AS $$
DECLARE
  v_follower UUID;
  v_following UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_follower := NEW.follower_id;
    v_following := NEW.following_id;
  ELSE
    v_follower := OLD.follower_id;
    v_following := OLD.following_id;
  END IF;

  UPDATE social_profiles
  SET following_count = (
    SELECT COUNT(*) FROM social_follows WHERE follower_id = v_follower
  )
  WHERE user_id = v_follower;

  UPDATE social_profiles
  SET followers_count = (
    SELECT COUNT(*) FROM social_follows WHERE following_id = v_following
  )
  WHERE user_id = v_following;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_follows_counter_ins ON social_follows;
DROP TRIGGER IF EXISTS trg_social_follows_counter_del ON social_follows;
CREATE TRIGGER trg_social_follows_counter_ins
AFTER INSERT ON social_follows
FOR EACH ROW EXECUTE FUNCTION social_update_follow_counters();

CREATE TRIGGER trg_social_follows_counter_del
AFTER DELETE ON social_follows
FOR EACH ROW EXECUTE FUNCTION social_update_follow_counters();

CREATE OR REPLACE FUNCTION social_sync_product_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    INSERT INTO social_product_location (product_id, latitude, longitude, created_at, updated_at)
    VALUES (NEW.id, NEW.latitude, NEW.longitude, NOW(), NOW())
    ON CONFLICT (product_id)
    DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, updated_at = NOW();
  ELSE
    DELETE FROM social_product_location WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_sync_product_location ON social_products;
CREATE TRIGGER trg_social_sync_product_location
AFTER INSERT OR UPDATE OF latitude, longitude ON social_products
FOR EACH ROW EXECUTE FUNCTION social_sync_product_location();

CREATE OR REPLACE FUNCTION social_update_swap_proposal_count()
RETURNS TRIGGER AS $$
DECLARE
  v_listing UUID;
BEGIN
  v_listing := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE social_swap_listings
  SET proposal_count = (SELECT COUNT(*) FROM social_swap_proposals WHERE listing_id = v_listing)
  WHERE id = v_listing;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_swap_proposal_count_ins ON social_swap_proposals;
DROP TRIGGER IF EXISTS trg_social_swap_proposal_count_del ON social_swap_proposals;
CREATE TRIGGER trg_social_swap_proposal_count_ins
AFTER INSERT ON social_swap_proposals
FOR EACH ROW EXECUTE FUNCTION social_update_swap_proposal_count();

CREATE TRIGGER trg_social_swap_proposal_count_del
AFTER DELETE ON social_swap_proposals
FOR EACH ROW EXECUTE FUNCTION social_update_swap_proposal_count();

DROP TRIGGER IF EXISTS trg_social_posts_updated_at ON social_posts;
CREATE TRIGGER trg_social_posts_updated_at
BEFORE UPDATE ON social_posts
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_reels_updated_at ON social_reels;
CREATE TRIGGER trg_social_reels_updated_at
BEFORE UPDATE ON social_reels
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_products_updated_at ON social_products;
CREATE TRIGGER trg_social_products_updated_at
BEFORE UPDATE ON social_products
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_swap_listings_updated_at ON social_swap_listings;
CREATE TRIGGER trg_social_swap_listings_updated_at
BEFORE UPDATE ON social_swap_listings
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_swap_proposals_updated_at ON social_swap_proposals;
CREATE TRIGGER trg_social_swap_proposals_updated_at
BEFORE UPDATE ON social_swap_proposals
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_swap_txn_updated_at ON social_swap_transactions;
CREATE TRIGGER trg_social_swap_txn_updated_at
BEFORE UPDATE ON social_swap_transactions
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_swap_ship_updated_at ON social_swap_shipments;
CREATE TRIGGER trg_social_swap_ship_updated_at
BEFORE UPDATE ON social_swap_shipments
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_thread_updated_at ON social_threads;
CREATE TRIGGER trg_social_thread_updated_at
BEFORE UPDATE ON social_threads
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_prefs_updated_at ON social_notification_preferences;
CREATE TRIGGER trg_social_prefs_updated_at
BEFORE UPDATE ON social_notification_preferences
FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_social_posts_engagement ON social_posts(engagement_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reels_engagement ON social_reels(engagement_rate DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_products_engagement ON social_products(engagement_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_swap_listing_created ON social_swap_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_messages_created ON social_messages(created_at DESC);
