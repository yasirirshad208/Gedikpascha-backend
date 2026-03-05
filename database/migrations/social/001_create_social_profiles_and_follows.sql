CREATE TABLE IF NOT EXISTS social_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(64) UNIQUE,
  display_name VARCHAR(255),
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  location_text VARCHAR(255),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  swaps_completed INTEGER NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  seller_reputation NUMERIC(6,4) NOT NULL DEFAULT 0.5,
  response_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
  avg_reply_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_follows_unique UNIQUE (follower_id, following_id),
  CONSTRAINT social_follows_not_self CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_social_profiles_username ON social_profiles(username);
CREATE INDEX IF NOT EXISTS idx_social_profiles_seller_reputation ON social_profiles(seller_reputation DESC);
CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_social_follows_following ON social_follows(following_id);

CREATE OR REPLACE FUNCTION social_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_profiles_updated_at ON social_profiles;
CREATE TRIGGER trg_social_profiles_updated_at
BEFORE UPDATE ON social_profiles
FOR EACH ROW
EXECUTE FUNCTION social_set_updated_at();

INSERT INTO social_profiles (user_id, username, display_name, created_at, updated_at)
SELECT
  u.id,
  LOWER(REPLACE(COALESCE(NULLIF(u.full_name, ''), SPLIT_PART(u.email, '@', 1)), ' ', '_')),
  COALESCE(NULLIF(u.full_name, ''), SPLIT_PART(u.email, '@', 1)),
  NOW(),
  NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read social profiles" ON social_profiles;
CREATE POLICY "Public read social profiles"
  ON social_profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users update own social profile" ON social_profiles;
CREATE POLICY "Users update own social profile"
  ON social_profiles FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users follow insert" ON social_follows;
CREATE POLICY "Users follow insert"
  ON social_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users follow delete" ON social_follows;
CREATE POLICY "Users follow delete"
  ON social_follows FOR DELETE
  USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Public read follows" ON social_follows;
CREATE POLICY "Public read follows"
  ON social_follows FOR SELECT
  USING (true);
