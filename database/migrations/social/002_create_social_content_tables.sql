CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caption TEXT,
  comments_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,
  engagement_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'image',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caption TEXT,
  reel_url TEXT NOT NULL,
  thumbnail_url TEXT,
  category VARCHAR(120),
  is_live BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  watch_completion NUMERIC(8,4) NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  creator_affinity NUMERIC(8,4) NOT NULL DEFAULT 0,
  product_click_through NUMERIC(8,4) NOT NULL DEFAULT 0,
  quality_score NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  seller_trust NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_reel_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'video',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES social_comments(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_comments_content_type CHECK (content_type IN ('post', 'reel'))
);

CREATE TABLE IF NOT EXISTS social_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type VARCHAR(20) NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_reactions_type CHECK (content_type IN ('post', 'reel')),
  CONSTRAINT social_reactions_unique UNIQUE (content_type, content_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_saves_type CHECK (content_type IN ('post', 'reel', 'product')),
  CONSTRAINT social_saves_unique UNIQUE (content_type, content_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  watched_seconds NUMERIC(8,2) NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_views_type CHECK (content_type IN ('post', 'reel', 'product'))
);

CREATE TABLE IF NOT EXISTS social_content_product_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  product_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_tags_type CHECK (content_type IN ('post', 'reel')),
  CONSTRAINT social_tags_unique UNIQUE (content_type, content_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reels_created ON social_reels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reels_category ON social_reels(category);
CREATE INDEX IF NOT EXISTS idx_social_comments_content ON social_comments(content_type, content_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reactions_content ON social_reactions(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_saves_user ON social_saves(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_views_content ON social_views(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_tags_content ON social_content_product_tags(content_type, content_id);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_reel_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_content_product_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read social posts" ON social_posts;
CREATE POLICY "Public read social posts" ON social_posts FOR SELECT USING (is_published = true);
DROP POLICY IF EXISTS "Users write own social posts" ON social_posts;
CREATE POLICY "Users write own social posts" ON social_posts FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read social reels" ON social_reels;
CREATE POLICY "Public read social reels" ON social_reels FOR SELECT USING (is_published = true);
DROP POLICY IF EXISTS "Users write own social reels" ON social_reels;
CREATE POLICY "Users write own social reels" ON social_reels FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read post media" ON social_post_media;
CREATE POLICY "Public read post media" ON social_post_media FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read reel media" ON social_reel_media;
CREATE POLICY "Public read reel media" ON social_reel_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read comments" ON social_comments;
CREATE POLICY "Public read comments" ON social_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write comments" ON social_comments;
CREATE POLICY "Users write comments" ON social_comments FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read reactions" ON social_reactions;
CREATE POLICY "Public read reactions" ON social_reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write reactions" ON social_reactions;
CREATE POLICY "Users write reactions" ON social_reactions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own saves" ON social_saves;
CREATE POLICY "Users manage own saves" ON social_saves FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read tags" ON social_content_product_tags;
CREATE POLICY "Public read tags" ON social_content_product_tags FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write tags" ON social_content_product_tags;
CREATE POLICY "Users write tags" ON social_content_product_tags FOR ALL USING (true);
