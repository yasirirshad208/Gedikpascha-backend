-- 001_create_social_profiles_and_follows.sql

CREATE OR REPLACE FUNCTION social_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS social_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  swaps_completed INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  rating_avg DECIMAL(3, 2) DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  response_rate DECIMAL(5, 2) DEFAULT 0 CHECK (response_rate >= 0 AND response_rate <= 100),
  avg_reply_seconds INTEGER DEFAULT NULL,
  seller_reputation DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, following_id),
  CONSTRAINT social_follows_not_self CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_social_profiles_username ON social_profiles(username);
CREATE INDEX IF NOT EXISTS idx_social_profiles_followers ON social_profiles(followers_count DESC);
CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_social_follows_following ON social_follows(following_id);

CREATE OR REPLACE FUNCTION social_generate_username(input_email TEXT, input_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  base_username TEXT;
  candidate TEXT;
BEGIN
  base_username := LOWER(REGEXP_REPLACE(SPLIT_PART(COALESCE(input_email, input_user_id::text), '@', 1), '[^a-zA-Z0-9_]+', '_', 'g'));
  IF base_username = '' THEN
    base_username := 'user';
  END IF;

  candidate := base_username;

  IF EXISTS (SELECT 1 FROM social_profiles sp WHERE sp.username = candidate AND sp.user_id <> input_user_id) THEN
    candidate := base_username || '_' || SUBSTRING(input_user_id::TEXT FROM 1 FOR 8);
  END IF;

  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION social_sync_profile_from_users()
RETURNS TRIGGER AS $$
DECLARE
  generated_username TEXT;
BEGIN
  generated_username := social_generate_username(NEW.email, NEW.id);

  INSERT INTO social_profiles (
    user_id,
    username,
    display_name,
    avatar_url,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    generated_username,
    COALESCE(NEW.full_name, generated_username),
    NEW.avatar_url,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, social_profiles.display_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, social_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_sync_profile_from_users_insert ON users;
CREATE TRIGGER trigger_social_sync_profile_from_users_insert
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION social_sync_profile_from_users();

DROP TRIGGER IF EXISTS trigger_social_sync_profile_from_users_update ON users;
CREATE TRIGGER trigger_social_sync_profile_from_users_update
AFTER UPDATE OF full_name, avatar_url, email ON users
FOR EACH ROW
EXECUTE FUNCTION social_sync_profile_from_users();

WITH source_users AS (
  SELECT
    u.id AS user_id,
    u.email,
    u.full_name,
    u.avatar_url,
    social_generate_username(u.email, u.id) AS base_username
  FROM users u
),
deduped_usernames AS (
  SELECT
    su.user_id,
    su.full_name,
    su.avatar_url,
    CASE
      WHEN COUNT(*) OVER (PARTITION BY su.base_username) > 1
        OR EXISTS (
          SELECT 1
          FROM social_profiles sp
          WHERE sp.username = su.base_username
            AND sp.user_id <> su.user_id
        )
      THEN su.base_username || '_' || SUBSTRING(su.user_id::TEXT FROM 1 FOR 8)
      ELSE su.base_username
    END AS username
  FROM source_users su
)
INSERT INTO social_profiles (user_id, username, display_name, avatar_url, created_at, updated_at)
SELECT
  du.user_id,
  du.username,
  COALESCE(du.full_name, du.username),
  du.avatar_url,
  NOW(),
  NOW()
FROM deduped_usernames du
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION social_apply_follow_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE social_profiles SET following_count = following_count + 1 WHERE user_id = NEW.follower_id;
    UPDATE social_profiles SET followers_count = followers_count + 1 WHERE user_id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE social_profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = OLD.follower_id;
    UPDATE social_profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE user_id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_follow_counters ON social_follows;
CREATE TRIGGER trigger_social_follow_counters
AFTER INSERT OR DELETE ON social_follows
FOR EACH ROW
EXECUTE FUNCTION social_apply_follow_counters();

DROP TRIGGER IF EXISTS trigger_social_profiles_updated_at ON social_profiles;
CREATE TRIGGER trigger_social_profiles_updated_at
BEFORE UPDATE ON social_profiles
FOR EACH ROW
EXECUTE FUNCTION social_touch_updated_at();

ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view social profiles" ON social_profiles;
CREATE POLICY "Public can view social profiles"
  ON social_profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert own social profile" ON social_profiles;
CREATE POLICY "Users can insert own social profile"
  ON social_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own social profile" ON social_profiles;
CREATE POLICY "Users can update own social profile"
  ON social_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own social profile" ON social_profiles;
CREATE POLICY "Users can delete own social profile"
  ON social_profiles FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access social profiles" ON social_profiles;
CREATE POLICY "Service role full access social profiles"
  ON social_profiles FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Public can view social follows" ON social_follows;
CREATE POLICY "Public can view social follows"
  ON social_follows FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can follow" ON social_follows;
CREATE POLICY "Users can follow"
  ON social_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON social_follows;
CREATE POLICY "Users can unfollow"
  ON social_follows FOR DELETE
  USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Service role full access social follows" ON social_follows;
CREATE POLICY "Service role full access social follows"
  ON social_follows FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
