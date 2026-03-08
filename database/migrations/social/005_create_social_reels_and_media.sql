-- 005_create_social_reels_and_media.sql

CREATE TABLE IF NOT EXISTS social_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  watch_completion_avg DECIMAL(5, 4) NOT NULL DEFAULT 0,
  engagement_rate DECIMAL(8, 6) NOT NULL DEFAULT 0,
  product_click_through DECIMAL(8, 6) NOT NULL DEFAULT 0,
  quality_score DECIMAL(6, 4) NOT NULL DEFAULT 0.5,

  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_reel_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  reel_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_reels_user ON social_reels(user_id);
CREATE INDEX IF NOT EXISTS idx_social_reels_status ON social_reels(status);
CREATE INDEX IF NOT EXISTS idx_social_reels_category ON social_reels(category_id);
CREATE INDEX IF NOT EXISTS idx_social_reels_published_at ON social_reels(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reels_rank ON social_reels(status, engagement_rate DESC, watch_completion_avg DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reel_media_reel ON social_reel_media(reel_id);

DROP TRIGGER IF EXISTS trigger_social_reels_updated_at ON social_reels;
CREATE TRIGGER trigger_social_reels_updated_at
BEFORE UPDATE ON social_reels
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_reel_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published social reels" ON social_reels;
CREATE POLICY "Public can view published social reels"
  ON social_reels FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Users can view own social reels" ON social_reels;
CREATE POLICY "Users can view own social reels"
  ON social_reels FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own social reels" ON social_reels;
CREATE POLICY "Users can insert own social reels"
  ON social_reels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social reels" ON social_reels;
CREATE POLICY "Users can update own social reels"
  ON social_reels FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own social reels" ON social_reels;
CREATE POLICY "Users can delete own social reels"
  ON social_reels FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social reels" ON social_reels;
CREATE POLICY "Service role full access social reels"
  ON social_reels FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view social reel media" ON social_reel_media;
CREATE POLICY "Public can view social reel media"
  ON social_reel_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_reels sr
      WHERE sr.id = social_reel_media.reel_id
      AND sr.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Users can manage own social reel media" ON social_reel_media;
CREATE POLICY "Users can manage own social reel media"
  ON social_reel_media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_reels sr
      WHERE sr.id = social_reel_media.reel_id
      AND sr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_reels sr
      WHERE sr.id = social_reel_media.reel_id
      AND sr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social reel media" ON social_reel_media;
CREATE POLICY "Service role full access social reel media"
  ON social_reel_media FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
