-- 020_add_social_profile_follow_search_indexes.sql

CREATE INDEX IF NOT EXISTS idx_social_follows_following_created_id
  ON social_follows (following_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_social_follows_follower_created_id
  ON social_follows (follower_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_social_profiles_lower_username
  ON social_profiles (LOWER(username));

CREATE INDEX IF NOT EXISTS idx_social_profiles_lower_display_name
  ON social_profiles (LOWER(display_name));

CREATE INDEX IF NOT EXISTS idx_social_profiles_created_user
  ON social_profiles (created_at DESC, user_id DESC);

