-- 006_create_social_content_tags_and_engagement.sql

CREATE TABLE IF NOT EXISTS social_content_product_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel')),
  content_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES social_products(id) ON DELETE CASCADE,
  tagger_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, content_id, product_id)
);

CREATE TABLE IF NOT EXISTS social_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel', 'product')),
  content_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_type, content_id)
);

CREATE TABLE IF NOT EXISTS social_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_comment_id UUID REFERENCES social_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel', 'product')),
  content_id UUID NOT NULL,
  body TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel', 'product')),
  content_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_type, content_id)
);

CREATE TABLE IF NOT EXISTS social_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel', 'product')),
  content_id UUID NOT NULL,
  channel VARCHAR(30) DEFAULT 'copy_link',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_key VARCHAR(255),
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'reel', 'product')),
  content_id UUID NOT NULL,
  watch_seconds INTEGER DEFAULT 0,
  completion_ratio DECIMAL(5, 4) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_content_product_tags_content ON social_content_product_tags(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_content ON social_likes(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_content ON social_comments(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_saves_content ON social_saves(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_shares_content ON social_shares(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_views_content ON social_views(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_views_content_created ON social_views(content_type, content_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_social_comments_updated_at ON social_comments;
CREATE TRIGGER trigger_social_comments_updated_at
BEFORE UPDATE ON social_comments
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

CREATE OR REPLACE FUNCTION social_refresh_content_counters(p_content_type VARCHAR, p_content_id UUID)
RETURNS VOID AS $$
DECLARE
  likes_count_val INTEGER;
  comments_count_val INTEGER;
  saves_count_val INTEGER;
  shares_count_val INTEGER;
  views_count_val INTEGER;
  avg_completion_val NUMERIC;
  engagement_rate_val NUMERIC;
BEGIN
  SELECT COUNT(*) INTO likes_count_val FROM social_likes WHERE content_type = p_content_type AND content_id = p_content_id;
  SELECT COUNT(*) INTO comments_count_val FROM social_comments WHERE content_type = p_content_type AND content_id = p_content_id;
  SELECT COUNT(*) INTO saves_count_val FROM social_saves WHERE content_type = p_content_type AND content_id = p_content_id;
  SELECT COUNT(*) INTO shares_count_val FROM social_shares WHERE content_type = p_content_type AND content_id = p_content_id;
  SELECT COUNT(*) INTO views_count_val FROM social_views WHERE content_type = p_content_type AND content_id = p_content_id;

  IF p_content_type = 'post' THEN
    UPDATE social_posts sp
    SET reactions_count = likes_count_val,
        comments_count = comments_count_val,
        saves_count = saves_count_val,
        shares_count = shares_count_val,
        views_count = views_count_val,
        updated_at = NOW()
    WHERE sp.id = p_content_id;
  ELSIF p_content_type = 'reel' THEN
    SELECT COALESCE(AVG(NULLIF(sv.completion_ratio, 0)), 0)
      INTO avg_completion_val
    FROM social_views sv
    WHERE sv.content_type = 'reel'
      AND sv.content_id = p_content_id;

    IF views_count_val > 0 THEN
      engagement_rate_val := (likes_count_val + (2 * comments_count_val) + (1.5 * saves_count_val) + shares_count_val) / views_count_val::NUMERIC;
    ELSE
      engagement_rate_val := 0;
    END IF;

    UPDATE social_reels sr
    SET likes_count = likes_count_val,
        comments_count = comments_count_val,
        saves_count = saves_count_val,
        shares_count = shares_count_val,
        views_count = views_count_val,
        watch_completion_avg = COALESCE(avg_completion_val, 0),
        engagement_rate = COALESCE(engagement_rate_val, 0),
        updated_at = NOW()
    WHERE sr.id = p_content_id;
  ELSIF p_content_type = 'product' THEN
    UPDATE social_products sp
    SET likes_count = likes_count_val,
        saves_count = saves_count_val,
        shares_count = shares_count_val,
        views_count = views_count_val,
        updated_at = NOW()
    WHERE sp.id = p_content_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_refresh_content_counters_trigger()
RETURNS TRIGGER AS $$
DECLARE
  content_type_val VARCHAR;
  content_id_val UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    content_type_val := OLD.content_type;
    content_id_val := OLD.content_id;
  ELSE
    content_type_val := NEW.content_type;
    content_id_val := NEW.content_id;
  END IF;

  PERFORM social_refresh_content_counters(content_type_val, content_id_val);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_refresh_likes ON social_likes;
CREATE TRIGGER trigger_social_refresh_likes
AFTER INSERT OR DELETE ON social_likes
FOR EACH ROW
EXECUTE FUNCTION social_refresh_content_counters_trigger();

DROP TRIGGER IF EXISTS trigger_social_refresh_comments ON social_comments;
CREATE TRIGGER trigger_social_refresh_comments
AFTER INSERT OR DELETE ON social_comments
FOR EACH ROW
EXECUTE FUNCTION social_refresh_content_counters_trigger();

DROP TRIGGER IF EXISTS trigger_social_refresh_saves ON social_saves;
CREATE TRIGGER trigger_social_refresh_saves
AFTER INSERT OR DELETE ON social_saves
FOR EACH ROW
EXECUTE FUNCTION social_refresh_content_counters_trigger();

DROP TRIGGER IF EXISTS trigger_social_refresh_shares ON social_shares;
CREATE TRIGGER trigger_social_refresh_shares
AFTER INSERT OR DELETE ON social_shares
FOR EACH ROW
EXECUTE FUNCTION social_refresh_content_counters_trigger();

DROP TRIGGER IF EXISTS trigger_social_refresh_views ON social_views;
CREATE TRIGGER trigger_social_refresh_views
AFTER INSERT OR DELETE ON social_views
FOR EACH ROW
EXECUTE FUNCTION social_refresh_content_counters_trigger();

ALTER TABLE social_content_product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view social content product tags" ON social_content_product_tags;
CREATE POLICY "Public can view social content product tags"
  ON social_content_product_tags FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage own social content product tags" ON social_content_product_tags;
CREATE POLICY "Users can manage own social content product tags"
  ON social_content_product_tags FOR ALL
  USING (auth.uid() = tagger_user_id)
  WITH CHECK (auth.uid() = tagger_user_id);

DROP POLICY IF EXISTS "Service role full access social content product tags" ON social_content_product_tags;
CREATE POLICY "Service role full access social content product tags"
  ON social_content_product_tags FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view social likes" ON social_likes;
CREATE POLICY "Public can view social likes"
  ON social_likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage own social likes" ON social_likes;
CREATE POLICY "Users can manage own social likes"
  ON social_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view social comments" ON social_comments;
CREATE POLICY "Public can view social comments"
  ON social_comments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert social comments" ON social_comments;
CREATE POLICY "Users can insert social comments"
  ON social_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social comments" ON social_comments;
CREATE POLICY "Users can update own social comments"
  ON social_comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own social comments" ON social_comments;
CREATE POLICY "Users can delete own social comments"
  ON social_comments FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view social saves" ON social_saves;
CREATE POLICY "Public can view social saves"
  ON social_saves FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage own social saves" ON social_saves;
CREATE POLICY "Users can manage own social saves"
  ON social_saves FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view social shares" ON social_shares;
CREATE POLICY "Public can view social shares"
  ON social_shares FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert social shares" ON social_shares;
CREATE POLICY "Authenticated can insert social shares"
  ON social_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Public can view social views" ON social_views;
CREATE POLICY "Public can view social views"
  ON social_views FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert social views" ON social_views;
CREATE POLICY "Anyone can insert social views"
  ON social_views FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access social engagement" ON social_likes;
CREATE POLICY "Service role full access social engagement"
  ON social_likes FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social comments" ON social_comments;
CREATE POLICY "Service role full access social comments"
  ON social_comments FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social saves" ON social_saves;
CREATE POLICY "Service role full access social saves"
  ON social_saves FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social shares" ON social_shares;
CREATE POLICY "Service role full access social shares"
  ON social_shares FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role full access social views" ON social_views;
CREATE POLICY "Service role full access social views"
  ON social_views FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
