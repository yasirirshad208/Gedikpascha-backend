-- 004_create_social_posts_and_media.sql

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption TEXT,
  location_text VARCHAR(255),
  hashtags TEXT[] DEFAULT '{}',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_comments_enabled BOOLEAN NOT NULL DEFAULT true,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_published_at ON social_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_media_post ON social_post_media(post_id);

DROP TRIGGER IF EXISTS trigger_social_posts_updated_at ON social_posts;
CREATE TRIGGER trigger_social_posts_updated_at
BEFORE UPDATE ON social_posts
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published social posts" ON social_posts;
CREATE POLICY "Public can view published social posts"
  ON social_posts FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Users can view own social posts" ON social_posts;
CREATE POLICY "Users can view own social posts"
  ON social_posts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own social posts" ON social_posts;
CREATE POLICY "Users can insert own social posts"
  ON social_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social posts" ON social_posts;
CREATE POLICY "Users can update own social posts"
  ON social_posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own social posts" ON social_posts;
CREATE POLICY "Users can delete own social posts"
  ON social_posts FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social posts" ON social_posts;
CREATE POLICY "Service role full access social posts"
  ON social_posts FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view social post media" ON social_post_media;
CREATE POLICY "Public can view social post media"
  ON social_post_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_media.post_id
      AND sp.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Users can manage own social post media" ON social_post_media;
CREATE POLICY "Users can manage own social post media"
  ON social_post_media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_media.post_id
      AND sp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_media.post_id
      AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access social post media" ON social_post_media;
CREATE POLICY "Service role full access social post media"
  ON social_post_media FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
